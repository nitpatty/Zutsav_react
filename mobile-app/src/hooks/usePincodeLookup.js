import { useState, useEffect } from 'react';
import axios from 'axios';
import { thirdParty } from '../config';

// Same free India Post pincode API the website uses
// (frontend/src/components/shared/PincodeInput.jsx) — called directly via
// plain axios since it's a third-party public API, not the Zutsav backend.
export default function usePincodeLookup(pincode) {
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!pincode || pincode.length !== 6) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios.get(`${thirdParty.postalPincodeApiUrl}/${pincode}`)
      .then((res) => {
        if (cancelled) return;
        const result = res.data[0];
        if (result.Status === 'Success' && result.PostOffice?.length > 0) {
          const po = result.PostOffice[0];
          setData({
            state:    po.State,
            city:     po.Division || po.Block || po.Name,
            district: po.District,
          });
        } else {
          setData(null);
          setError('Invalid pincode. Please check and try again.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not fetch location data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pincode]);

  return { loading, data, error };
}
