import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { savePendingCheckout } from '../utils/pendingCheckout';

/**
 * The single, reusable authentication checkpoint for any checkout flow
 * (pooja booking today; marketplace/temple/astrology/donation checkouts can
 * call it the same way later). Every step before this — browsing, package
 * selection, date/time, address, review — stays guest-accessible; this is
 * the only place a flow should ever ask for login.
 *
 * Usage inside a "Pay"/"Place Order" handler:
 *   const { requireAuth } = useCheckoutAuthGuard();
 *   if (!requireAuth('booking', snapshot, resumePath)) return; // already redirected to login
 *   // ...proceed with the real payment/order API call
 */
export function useCheckoutAuthGuard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  function requireAuth(type, payload, resumePath) {
    if (user) return true;
    savePendingCheckout(type, payload, resumePath);
    navigate(`/login?next=${encodeURIComponent(resumePath)}`);
    return false;
  }

  return { requireAuth, isAuthenticated: !!user };
}
