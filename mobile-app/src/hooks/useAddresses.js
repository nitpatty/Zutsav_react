import { useState, useCallback, useEffect } from 'react';
import api from '../api/axios';

// Shared saved-address CRUD, backed by the same /users/addresses endpoints
// used by the website's AddressPicker. Consumed by both the Address Book
// screen (Profile) and the booking/checkout flows so there is only one
// address system across the app.
export default function useAddresses({ auto = true } = {}) {
  const [addresses, setAddresses] = useState([]);
  const [loading,   setLoading]   = useState(auto);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/users/addresses');
      setAddresses(data.addresses || []);
      return data.addresses || [];
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load addresses');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auto) refresh().catch(() => {});
  }, [auto, refresh]);

  const addAddress = useCallback(async ({ label, address, pincode, state, city, district, isDefault }) => {
    setSaving(true);
    try {
      const { data } = await api.post('/users/addresses', {
        label, address, pincode, state, city, district, setDefault: !!isDefault,
      });
      setAddresses(data.addresses || []);
      return data.addresses || [];
    } finally {
      setSaving(false);
    }
  }, []);

  const updateAddress = useCallback(async (addrId, { label, address, pincode, state, city, district, isDefault }) => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/users/addresses/${addrId}`, {
        label, address, pincode, state, city, district, isDefault,
      });
      setAddresses(data.addresses || []);
      return data.addresses || [];
    } finally {
      setSaving(false);
    }
  }, []);

  const deleteAddress = useCallback(async (addrId) => {
    setSaving(true);
    try {
      const { data } = await api.delete(`/users/addresses/${addrId}`);
      setAddresses(data.addresses || []);
      return data.addresses || [];
    } finally {
      setSaving(false);
    }
  }, []);

  const getDefault = useCallback(
    () => addresses.find((a) => a.isDefault) || addresses[0],
    [addresses]
  );

  return { addresses, loading, saving, error, refresh, addAddress, updateAddress, deleteAddress, getDefault };
}
