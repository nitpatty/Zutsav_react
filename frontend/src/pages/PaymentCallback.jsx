import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, RefreshCw, ShoppingBag } from 'lucide-react';
import API from '../api/axios';
import ZutsavLoader from '../components/shared/ZutsavLoader';

const isMarketplaceOrder  = (txId) => txId?.startsWith('ZOM_');
const isCartOrder         = (txId) => txId?.startsWith('ZUT_CART_');
const isRemainingPayment  = (txId) => txId?.startsWith('ZUT_REM_');

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/* ── Payment summary component ──────────────────────────────────────────── */
function PaymentSummary({ booking }) {
  const isPartial = booking.paymentStatus === 'PARTIALLY_PAID';
  const total     = booking.grandTotal ?? booking.amount ?? 0;
  // amountPaid is set by verifyPhonePePayment; fall back to total for full payment
  const paid      = booking.amountPaid != null ? booking.amountPaid : (isPartial ? 0 : total);
  const remaining = booking.remainingAmount ?? (total - paid);

  if (isPartial) {
    return (
      <div className="space-y-2.5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Booking Total</span>
          <span className="font-semibold text-gray-700">{fmt(total)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Amount Paid Now</span>
          <span className="font-bold text-green-700">{fmt(paid)}</span>
        </div>
        <div className="border-t border-saffron-100" />
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Remaining Balance</span>
          <span className="font-bold text-orange-600">{fmt(remaining)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Payment Status</span>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
            Partial Payment
          </span>
        </div>
        <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
          Pay the remaining balance from <strong>My Bookings</strong> before your scheduled date.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-500">Amount Paid</span>
        <span className="font-bold text-green-700">{fmt(paid || total)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">Payment Status</span>
        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
          Paid in Full ✓
        </span>
      </div>
    </div>
  );
}

export default function PaymentCallback() {
  const { merchantTransactionId } = useParams();
  const navigate = useNavigate();
  const [status,  setStatus]  = useState('verifying');
  const [data,    setData]    = useState(null);
  const [retries, setRetries] = useState(0);

  const isOrder     = isMarketplaceOrder(merchantTransactionId);
  const isCart      = isCartOrder(merchantTransactionId);
  const isRemaining = isRemainingPayment(merchantTransactionId);

  const verify = async () => {
    try {
      if (isRemaining) {
        const res = await API.get(`/bookings/verify-remaining/${merchantTransactionId}`);
        if (res.data.success || res.data.alreadyVerified) {
          setStatus('success');
          setData({ type: 'remaining', booking: res.data.booking });
        } else if (res.data.state === 'PENDING') {
          setStatus('pending');
          setData({ type: 'remaining', booking: res.data.booking });
        } else {
          setStatus('failed');
        }
      } else if (isOrder) {
        const res = await API.get(`/marketplace/orders/verify-phonepe/${merchantTransactionId}`);
        if (res.data.success) {
          setStatus('success');
          setData(res.data.order);
        } else if (res.data.state === 'PENDING') {
          setStatus('pending');
          setData(res.data.order);
        } else {
          setStatus('failed');
        }
      } else if (isCart) {
        const res = await API.get(`/checkout/verify/${merchantTransactionId}`);
        if (res.data.success || res.data.alreadyVerified) {
          setStatus('success');
          setData({ bookings: res.data.bookings || [], order: res.data.order || null });
        } else if (res.data.state === 'PENDING') {
          setStatus('pending');
          setData({ bookings: res.data.bookings || [], order: res.data.order || null });
        } else {
          setStatus('failed');
        }
      } else {
        // Single booking (standard flow — PhonePe)
        const res = await API.get(`/bookings/verify-phonepe/${merchantTransactionId}`);
        if (res.data.success) {
          setStatus('success');
          setData(res.data.booking);
        } else if (res.data.state === 'PENDING') {
          setStatus('pending');
          setData(res.data.booking);
        } else {
          setStatus('failed');
          setData(res.data.booking);
        }
      }
    } catch {
      setStatus('failed');
    }
  };

  useEffect(() => {
    verify();
  }, [merchantTransactionId]); // eslint-disable-line

  const handleRetry = () => {
    if (retries >= 3) return;
    setStatus('verifying');
    setRetries((r) => r + 1);
    verify();
  };

  /* ── Verifying ─────────────────────────────────────────── */
  if (status === 'verifying') {
    return (
      <ZutsavLoader
        fullscreen
        size={72}
        message="Verifying your payment… please do not close this page."
      />
    );
  }

  /* ── Success ───────────────────────────────────────────── */
  if (status === 'success') {

    /* Remaining payment success */
    if (isRemaining && data?.booking) {
      const b = data.booking;
      return (
        <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-saffron-100 p-8 text-center space-y-5">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={40} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Payment Complete! 🙏</h1>
            <p className="text-gray-600 text-sm">Your remaining balance has been cleared. Booking is now fully paid.</p>
            <div className="bg-green-50 rounded-2xl p-4 text-left space-y-2.5 border border-green-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Booking No.</span>
                <span className="font-bold text-gray-800">#{b.bookingNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pooja</span>
                <span className="font-medium text-gray-700">{b.poojaId?.name}</span>
              </div>
              <div className="border-t border-green-200" />
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Paid</span>
                <span className="font-bold text-green-700">{fmt(b.grandTotal || b.amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Payment Status</span>
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-0.5 rounded-full border border-green-200">
                  Fully Paid ✓
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400">A confirmation has been sent to your email.</p>
            <div className="flex gap-3">
              <Link to="/my-bookings" className="btn-outline flex-1 text-center text-sm py-2.5">My Bookings</Link>
              <Link to="/" className="btn-primary flex-1 text-center text-sm py-2.5">Back to Home</Link>
            </div>
          </div>
        </div>
      );
    }

    /* Cart success */
    if (isCart && data) {
      const bookings     = data.bookings || [];
      const order        = data.order;
      // amountPaid is set by verifyCartPayment; fall back to grandTotal for backward-compat
      const bookingSum   = bookings.reduce((s, b) => s + (b.amountPaid ?? b.grandTotal ?? b.amount ?? 0), 0);
      const productSum   = order?.totalAmount || 0;
      const combinedPaid = bookingSum + productSum;

      return (
        <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-saffron-100 p-8 text-center space-y-5">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={40} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Booking Confirmed! 🙏</h1>
            <p className="text-gray-600 text-sm">Your payment was successful and all items have been confirmed.</p>

            {/* Pooja bookings */}
            {bookings.length > 0 && (
              <div className="bg-orange-50 rounded-2xl p-4 text-left space-y-3 border border-orange-100">
                <p className="text-xs font-bold text-orange-600 uppercase tracking-wide flex items-center gap-1.5">
                  🪔 Pooja Booking{bookings.length > 1 ? 's' : ''}
                </p>
                {bookings.map((b) => (
                  <div key={b._id} className="space-y-1 pb-2 border-b border-orange-100 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-gray-800">#{b.bookingNumber} — {b.poojaId?.name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(b.scheduledDate).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })} · {b.scheduledTime}
                    </p>
                    <p className="text-xs text-gray-500">
                      Amount Paid:{' '}
                      <span className="font-semibold text-gray-700">
                        {fmt(b.amountPaid ?? b.grandTotal ?? b.amount ?? 0)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Products order */}
            {order && (
              <div className="bg-amber-50 rounded-2xl p-4 text-left space-y-2 border border-amber-100">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
                  <ShoppingBag size={11} /> Products Order
                </p>
                <p className="text-sm text-gray-600">Order <span className="font-semibold">#{order.orderNumber}</span></p>
                <p className="text-xs text-gray-500">
                  {order.items?.length} item(s) · {fmt(order.totalAmount)}
                </p>
                {order.shippingAddress?.city && (
                  <p className="text-xs text-gray-500">Ship to: {order.shippingAddress.city}</p>
                )}
              </div>
            )}

            {/* Combined total paid */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">Total Paid</span>
              <span className="text-xl font-bold text-orange-600">{fmt(combinedPaid)}</span>
            </div>

            <p className="text-xs text-gray-400">A confirmation message has been sent to your phone/email.</p>
            <div className="flex gap-3">
              <Link to="/my-bookings" className="btn-outline flex-1 text-center text-sm py-2.5">My Bookings</Link>
              <Link to="/" className="btn-primary flex-1 text-center text-sm py-2.5">Back to Home</Link>
            </div>
          </div>
        </div>
      );
    }

    /* Marketplace order success */
    if (isOrder) {
      return (
        <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-saffron-100 p-8 text-center space-y-5">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={40} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Order Placed! 🎉</h1>
            <p className="text-gray-600 text-sm">Your payment was successful and order has been confirmed.</p>
            {data && (
              <div className="bg-saffron-50 rounded-2xl p-4 text-left space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order No.</span>
                  <span className="font-semibold text-gray-800">#{data.orderNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Items</span>
                  <span className="font-medium text-gray-700">{data.items?.length} item(s)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Amount Paid</span>
                  <span className="font-bold text-green-700">{fmt(data.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ship to</span>
                  <span className="text-gray-700">{data.shippingAddress?.city}</span>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400">We will notify you once your order is dispatched.</p>
            <div className="flex gap-3">
              <Link to="/my-orders" className="btn-outline flex-1 text-center text-sm py-2.5">My Orders</Link>
              <Link to="/marketplace" className="btn-primary flex-1 text-center text-sm py-2.5">Continue Shopping</Link>
            </div>
          </div>
        </div>
      );
    }

    /* ── Single booking success (standard PhonePe flow) ─────── */
    return (
      <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-saffron-100 p-8 text-center space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Booking Confirmed! 🙏</h1>
          <p className="text-gray-600 text-sm">Your payment was successful and booking is confirmed.</p>

          {data && (
            <div className="bg-saffron-50 rounded-2xl p-4 text-left border border-saffron-100 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Booking No.</span>
                <span className="font-bold text-gray-800">#{data.bookingNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pooja</span>
                <span className="font-medium text-gray-700">{data.poojaId?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-700">
                  {new Date(data.scheduledDate).toLocaleDateString('en-IN', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Time</span>
                <span className="text-gray-700">{data.scheduledTime}</span>
              </div>

              {/* ── Payment summary — reads actual backend payment fields ── */}
              <div className="border-t border-saffron-200 pt-2.5">
                <PaymentSummary booking={data} />
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">A confirmation message has been sent to your phone/email.</p>
          <div className="flex gap-3">
            <Link to="/my-bookings" className="btn-outline flex-1 text-center text-sm py-2.5">My Bookings</Link>
            <Link to="/" className="btn-primary flex-1 text-center text-sm py-2.5">Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pending ───────────────────────────────────────────── */
  if (status === 'pending') {
    return (
      <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-yellow-100 p-8 text-center space-y-5">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
            <Clock size={40} className="text-yellow-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Payment Pending</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            Your payment is being processed. This usually takes a few seconds.
            If amount was debited, it will be confirmed shortly.
          </p>
          <button
            onClick={handleRetry}
            disabled={retries >= 3}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <RefreshCw size={15} /> Check Again
          </button>
          <Link
            to={isOrder ? '/my-orders' : '/my-bookings'}
            className="block text-sm text-saffron-600 hover:underline"
          >
            {isOrder ? 'View My Orders' : 'View My Bookings'}
          </Link>
          {isRemaining && (
            <p className="text-xs text-gray-400">Your remaining payment is being verified.</p>
          )}
          {isCart && (
            <p className="text-xs text-gray-400">Your pooja + product order will appear in My Bookings once confirmed.</p>
          )}
        </div>
      </div>
    );
  }

  /* ── Failed ────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-red-100 p-8 text-center space-y-5">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <XCircle size={40} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-800">Payment Failed</h1>
        <p className="text-gray-600 text-sm leading-relaxed">
          Your payment could not be processed. No amount has been deducted.
          Please try again or contact support if the issue persists.
        </p>
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)} className="btn-outline flex-1 text-sm py-2.5">
            Try Again
          </button>
          <Link to="/" className="btn-primary flex-1 text-center text-sm py-2.5">
            Back to Home
          </Link>
        </div>
        <p className="text-xs text-gray-400">Ref: {merchantTransactionId}</p>
      </div>
    </div>
  );
}
