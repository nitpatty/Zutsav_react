import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { thirdParty } from '../config';
import { useTranslation } from '../i18n';

// Same free India Post pincode API the website uses
// (frontend/src/components/shared/PincodeInput.jsx) — called directly via
// plain axios since it's a third-party public API, not the Zutsav backend.
export default function usePincodeLookup(pincode) {
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);
  const { t } = useTranslation();
  const tRef = useRef(t); // read through a ref so the lookup effect still runs only when the pincode changes
  tRef.current = t;

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
          setError(tRef.current('location.pincodeInvalid'));
        }
      })
      .catch(() => {
        if (!cancelled) setError(tRef.current('location.pincodeLookupFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pincode]);

  return { loading, data, error };
}
