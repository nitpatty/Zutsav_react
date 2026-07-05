import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

// Fires `callback` only on the offline -> online transition, not on every
// connectivity event (which would otherwise cause redundant refetches while
// already online, e.g. wifi <-> cellular handoff).
export default function useOnReconnect(callback) {
  const wasOffline = useRef(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (!isOnline) {
        wasOffline.current = true;
      } else if (wasOffline.current) {
        wasOffline.current = false;
        callbackRef.current?.();
      }
    });
    return unsubscribe;
  }, []);
}
