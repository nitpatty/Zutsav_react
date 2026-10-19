import { useEffect, useRef, useState, useCallback } from 'react';
import { useNotificationSocket } from '../context/NotificationContext';

/**
 * Keeps a Pandit's calendar/availability view in sync with authoritative
 * backend schedule data.
 *
 * Refresh triggers:
 *   1. `pandit_schedule_changed` socket event — pushed by the backend on every
 *      occupancy-relevant transition (assign, accept, reject, cancellation,
 *      completion, admin status change). Debounced because a burst of events
 *      (e.g. admin reassigning several bookings) must cause ONE refetch.
 *   2. socket `connect` — events emitted while the socket was down were
 *      missed, so refetch on every reconnect.
 *   3. window focus / visibilitychange / online — ONLY as a fallback while the
 *      socket is not connected (socket.disconnected), so a healthy realtime
 *      link does not generate needless refetches.
 *
 * The callback is held in a ref, so consumers may pass an inline function
 * without re-subscribing on every render.
 */
const DEBOUNCE_MS = 250;

export default function usePanditScheduleSync(refetch, { enabled = true } = {}) {
  const socket = useNotificationSocket();
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const scheduleRefetch = useCallback(() => {
    const fn = refetchRef.current;
    if (typeof fn !== 'function') return;
    setLastSyncAt(Date.now());
    fn();
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;
    const debouncedRefetch = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        scheduleRefetch();
      }, DEBOUNCE_MS);
    };

    if (socket) {
      socket.on('pandit_schedule_changed', debouncedRefetch);
      // Missed-event catch-up: anything pushed while disconnected is lost.
      socket.on('connect', debouncedRefetch);
    }

    const refetchIfSocketDown = () => {
      if (!socket || socket.disconnected) debouncedRefetch();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchIfSocketDown();
    };

    window.addEventListener('focus', refetchIfSocketDown);
    window.addEventListener('online', debouncedRefetch);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      if (socket) {
        socket.off('pandit_schedule_changed', debouncedRefetch);
        socket.off('connect', debouncedRefetch);
      }
      window.removeEventListener('focus', refetchIfSocketDown);
      window.removeEventListener('online', debouncedRefetch);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [socket, enabled, scheduleRefetch]);

  return { lastSyncAt };
}
