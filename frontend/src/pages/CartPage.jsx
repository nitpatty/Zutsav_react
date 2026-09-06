import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, ShoppingBag, Calendar, Clock, MapPin, Package, ArrowRight, Shield, Minus, Plus, Zap, Truck, Tag, X, Coins } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/priceEngine';
import API from '../api/axios';
import AddressPicker from '../components/shared/AddressPicker';
import { getImageUrl } from '../config';
import { fmtTime } from '../components/booking/constants';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const fadeUp = (d = 0) => ({ initial:{ opacity:0, y:16 }, animate:{ opacity:1, y:0, transition:{ duration:0.35, delay:d } } });

export default function CartPage() {
  const { items, poojaItems, productItems, poojaTotal, productSubtotal, productTaxTotal, grandTotal, removeItem, updateProductQty, clearCart, cartType } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { code, discount, finalPayable }
  const [applying, setApplying] = useState(false);

  // Coin redemption state — wallet info comes from GET /api/wallet which now
  // also returns the redemption context (coin value + minimum threshold).
  const [walletInfo, setWalletInfo] = useState(null);
  const [useCoins, setUseCoins] = useState(false);

  useEffect(() => {
    if (!user) { setWalletInfo(null); setUseCoins(false); return; }
    API.get('/wallet')
      .then(({ data }) => setWalletInfo((data.wallet) || null))
      .catch(() => setWalletInfo(null));
  }, [user]);

  // Determine cart purchase type for coupon applicability
  const cartCouponType = poojaItems.length > 0 && productItems.length > 0
    ? 'POOJA'
    : poojaItems.length > 0 ? 'POOJA' : (productItems.length > 0 ? 'PRODUCTS' : 'POOJA');

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setApplying(true);
    try {
      const { data } = await API.post('/coupons/validate', {
        code: couponInput.trim(),
        cartValue: grandTotal,
        cartType: cartCouponType,
      });
      setAppliedCoupon({
        code: data.coupon.code,
        discount: data.discount,
        discountType: data.coupon.discountType,
        discountValue: data.coupon.discountValue,
        maxDiscount: data.coupon.maxDiscount,
      });
      setCouponInput('');
      setUseCoins(false);
      toast.success(`Coupon ${data.coupon.code} applied ✓`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid coupon');
    } finally {
      setApplying(false);
    }
  };

  const discount = appliedCoupon?.discount || 0;

  // ── Coin redemption derived values ──────────────────────────
  // Mutually exclusive with coupons: enabling coins clears any applied coupon
  // and applying a coupon turns coins off (the backend enforces this too).
  const coinRate     = Number(walletInfo?.coinMonetaryValue) || 0;
  const coinMinCoins = Number(walletInfo?.coinRedemptionMinCoins) || 0;
  const coinBalance  = Number(walletInfo?.balance) || 0;
  const coinEligible = !!user && walletInfo !== null && coinRate > 0 && coinBalance >= coinMinCoins
    && productItems.length === 0 && !appliedCoupon;
  const coinCoins    = useCoins && coinEligible
    ? Math.min(coinBalance, Math.floor(grandTotal / coinRate))
    : 0;
  const coinValue    = Math.round(coinCoins * coinRate * 100) / 100;

  const finalGrandTotal = Math.max(0, grandTotal - discount - coinValue);

  const toggleCoins = (v) => {
    if (v) setAppliedCoupon(null);
    setUseCoins(v);
  };

  // name/phone: pre-filled from profile; address fields managed by AddressPicker
  const [shipping, setShipping] = useState({
    name:     '',
    phone:    '',
    address:  '',
    pincode:  '',
    state:    '',
    city:     '',
    district: '',
  });
  const setField = (f) => (e) => setShipping((p) => ({ ...p, [f]: e.target.value }));

  // Pre-fill name/phone from auth context
  useEffect(() => {
    setShipping((p) => ({
      ...p,
      name:  p.name  || user?.name  || '',
      phone: p.phone || user?.phone || '',
    }));
  }, [user]);

  // Also pre-fill from first pooja booking's userDetails if available
  useEffect(() => {
    const ud = poojaItems[0]?.bookingDetails?.userDetails;
    if (ud) setShipping((p) => ({
      name:  p.name  || ud.name  || '',
      phone: p.phone || ud.phone || '',
    }));
  }, [poojaItems.length]);

  const hasProducts = productItems.length > 0;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (hasProducts && (!shipping.name || !shipping.phone || !shipping.address || !shipping.pincode)) {
      toast.error('Please fill delivery address details'); return;
    }
    setPaying(true);
    try {
      const bookingPayload = poojaItems.map(item => {
        // kitIds is the current shape; kitId is the legacy single-selection
        // alias from cart items saved before multi-select existed.
        const kitIds = item.bookingDetails?.kitIds?.length
          ? item.bookingDetails.kitIds
          : (item.bookingDetails?.kitId ? [item.bookingDetails.kitId] : []);
        return {
          poojaId:       item.poojaId,
          scheduledDate: item.bookingDetails.scheduledDate,
          scheduledTime: item.bookingDetails.scheduledTime,
          language:      item.bookingDetails.language,
          specialNote:   item.bookingDetails.specialNote,
          withKit:       item.bookingDetails.withKit,
          kitIds:        kitIds.length ? kitIds : undefined,
          isUrgent:      item.bookingDetails.isUrgent,
          userDetails:   item.bookingDetails.userDetails,
        };
      });

      const productPayload = productItems.map(item => ({
        productId: item.productId,
        variantId: item.variantId || undefined,
        quantity:  item.quantity,
      }));

      const { data } = await API.post('/checkout/cart', {
        bookings: bookingPayload,
        products: productPayload,
        shippingAddress: hasProducts ? shipping : undefined,
        couponCode: appliedCoupon?.code,
        coinRedemptionCoins: coinCoins || undefined,
      });

      clearCart();
      if (data.paidWithCoins) {
        navigate(`/payment-callback/${data.merchantTransactionId}`);
        setTimeout(() => setPaying(false), 200);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Checkout failed. Please try again.');
      setPaying(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#FAF6EE' }}>
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: "'Cormorant Garamond',serif" }}>Your cart is empty</h2>
        <p className="text-gray-500 text-sm mb-6 text-center">Add poojas or products to your cart and checkout together.</p>
        <Link to="/poojas" className="btn-primary px-8 py-3 flex items-center gap-2">
          Explore Poojas <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8" style={{ background: '#FAF6EE' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Header */}
        <motion.div {...fadeUp()} className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Cormorant Garamond',serif" }}>Your Cart</h1>
            <p className="text-sm text-gray-500 mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''} · {cartType} order</p>
          </div>
          <button onClick={clearCart} className="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
            Clear all
          </button>
        </motion.div>

        {/* ── Pooja bookings ────────────────────────── */}
        {poojaItems.length > 0 && (
          <motion.div {...fadeUp(0.05)} className="mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              🪔 Pooja Bookings ({poojaItems.length})
            </p>
            <div className="space-y-3">
              {poojaItems.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  {/* Pooja name + urgent badge */}
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl shrink-0">🪔</div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{item.poojaName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.bookingDetails?.isUrgent && (
                            <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                              <Zap size={9}/> Urgent
                            </span>
                          )}
                          {(item.kits?.length > 0 || item.kitName) && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                              <Package size={9}/> {item.kits?.length > 1 ? `${item.kits.length} Kits` : (item.kits?.[0]?.name || item.kitName)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors text-gray-400">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Booking details */}
                  <div className="px-5 py-3 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Calendar size={11} className="text-orange-400 shrink-0" />
                      {fmtDate(item.bookingDetails?.scheduledDate)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock size={11} className="text-orange-400 shrink-0" />
                      {item.bookingDetails?.scheduledTime ? fmtTime(item.bookingDetails.scheduledTime) : '—'}
                    </div>
                    {item.bookingDetails?.userDetails?.city && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 col-span-2">
                        <MapPin size={11} className="text-orange-400 shrink-0" />
                        {item.bookingDetails.userDetails.address?.slice(0, 40)}{item.bookingDetails.userDetails.city ? ', ' + item.bookingDetails.userDetails.city : ''}
                      </div>
                    )}
                  </div>

                  {/* Price for this item */}
                  <div className="px-5 py-3 bg-orange-50 border-t border-orange-100 flex items-center justify-between">
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>Pooja: {formatINR(item.pricing?.poojaAmount)}</p>
                      {item.pricing?.platformFee > 0 && <p>Platform fee: {formatINR(item.pricing?.platformFee)}</p>}
                      {item.pricing?.platformGST > 0 && <p>GST on fee: {formatINR(item.pricing?.platformGST)}</p>}
                      {item.pricing?.kitAmount > 0 && <p>Kit: {formatINR(item.pricing?.kitAmount)}</p>}
                      {item.pricing?.kitGST > 0 && <p>GST on kit: {formatINR(item.pricing?.kitGST)}</p>}
                    </div>
                    <span className="font-bold text-orange-600 text-lg" style={{ fontFamily: "'Cormorant Garamond',serif" }}>
                      {formatINR(item.pricing?.grandTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Marketplace products ──────────────────── */}
        {productItems.length > 0 && (
          <motion.div {...fadeUp(0.1)} className="mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ShoppingBag size={11} /> Products ({productItems.length})
            </p>
            <div className="space-y-3">
              {productItems.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image
                      ? <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" />
                      : <ShoppingBag size={20} className="text-gray-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{item.name}</p>
                    {item.variantLabel && <p className="text-xs text-gray-400">{item.variantLabel}</p>}
                    <p className="text-xs text-orange-600 font-semibold mt-0.5">{formatINR(item.price)} × {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 border border-gray-200 rounded-xl overflow-hidden">
                      <button onClick={() => updateProductQty(item.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"><Minus size={12}/></button>
                      <span className="w-7 text-center text-sm font-semibold text-gray-700">{item.quantity}</span>
                      <button onClick={() => updateProductQty(item.id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"><Plus size={12}/></button>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors text-gray-400">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Shipping address (only when products in cart) ── */}
        {hasProducts && (
          <motion.div {...fadeUp(0.12)} className="mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Truck size={11} /> Delivery Address
            </p>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
              {/* Name + Phone — pre-filled from profile */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Full Name *</label>
                  <input className="input text-sm" placeholder="Your name" value={shipping.name} onChange={setField('name')} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Phone *</label>
                  <input className="input text-sm" placeholder="10-digit number" value={shipping.phone} onChange={setField('phone')} />
                </div>
              </div>

              {/* Saved address picker — reuses same API as Pooja Booking */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <MapPin size={11} /> Select Delivery Address *
                </label>
                <AddressPicker
                  value={{ address: shipping.address, pincode: shipping.pincode, state: shipping.state, city: shipping.city, district: shipping.district }}
                  onChange={(fields) => setShipping((p) => ({ ...p, ...fields }))}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Order summary ─────────────────────────── */}
        <motion.div {...fadeUp(0.15)} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Order Summary</p>
          </div>
          <div className="px-5 py-4 space-y-2">

            {/* Pooja bookings breakdown */}
            {poojaItems.map((item) => (
              <div key={item.id} className="space-y-1 pb-2 border-b border-gray-50 last:border-0">
                <div className="flex justify-between text-sm text-gray-700 font-medium">
                  <span className="truncate max-w-[200px]">🪔 {item.poojaName}</span>
                  <span>{formatINR(item.pricing?.grandTotal)}</span>
                </div>
                <div className="pl-4 space-y-0.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Pooja service</span><span>{formatINR(item.pricing?.poojaAmount)}</span>
                  </div>
                  {(item.pricing?.platformFee || 0) > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Platform fee</span><span>{formatINR(item.pricing?.platformFee)}</span>
                    </div>
                  )}
                  {(item.pricing?.platformGST || 0) > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>GST on platform fee ({item.pricing?.gstPercent}%)</span><span>{formatINR(item.pricing?.platformGST)}</span>
                    </div>
                  )}
                  {(item.pricing?.kitAmount || 0) > 0 && (item.kits?.length > 1 ? (
                    item.kits.map((k) => (
                      <div key={k._id} className="flex justify-between text-xs text-gray-400">
                        <span>Kit — {k.name}</span><span>{formatINR(k.discountPrice || 0)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Kit — {item.kits?.[0]?.name || item.kitName}</span><span>{formatINR(item.pricing?.kitAmount)}</span>
                    </div>
                  ))}
                  {(item.pricing?.kitGST || 0) > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>GST on kit ({item.pricing?.gstPercent}%)</span><span>{formatINR(item.pricing?.kitGST)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Products breakdown */}
            {productItems.length > 0 && (
              <div className="space-y-1 pb-2 border-b border-gray-50">
                {productItems.map((item) => (
                  <div key={item.id} className="flex justify-between text-xs text-gray-500">
                    <span className="truncate max-w-[200px]">{item.name}{item.variantLabel ? ` · ${item.variantLabel}` : ''} ×{item.quantity}</span>
                    <span>{formatINR(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm text-gray-700 font-medium mt-1">
                  <span>Products subtotal</span>
                  <span>{formatINR(productSubtotal)}</span>
                </div>
                {productTaxTotal > 0 && (
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Product GST</span>
                    <span>{formatINR(productTaxTotal)}</span>
                  </div>
                )}
              </div>
            )}

            {discount > 0 && (
              <div className="pt-2 flex justify-between items-center">
                <span className="font-semibold text-green-600">Coupon Discount</span>
                <span className="font-semibold text-green-600">−{formatINR(discount)}</span>
              </div>
            )}

            {coinValue > 0 && (
              <div className="pt-2 flex justify-between items-center">
                <span className="font-semibold text-saffron-600">Coins Applied ({coinCoins} coins)</span>
                <span className="font-semibold text-saffron-600">−{formatINR(coinValue)}</span>
              </div>
            )}

            {/* Grand total */}
            <div className="pt-2 flex justify-between items-center">
              <span className="font-bold text-gray-800">Grand Total</span>
              <span className="font-bold text-orange-600 text-xl" style={{ fontFamily: "'Cormorant Garamond',serif" }}>
                {formatINR(finalGrandTotal)}
              </span>
            </div>
          </div>
        </motion.div>

            {/* ── Coupon input ─────────────────────────── */}
            <motion.div {...fadeUp(0.17)} className="mb-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                {!appliedCoupon ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-saffron-400">
                      <Tag size={14} className="text-gray-400 shrink-0" />
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Enter coupon code"
                        disabled={useCoins}
                        className="flex-1 text-sm outline-none bg-transparent uppercase placeholder:normal-case disabled:opacity-50"
                        onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                      />
                    </div>
                    <button onClick={applyCoupon} disabled={useCoins || applying || !couponInput.trim()}
                      className="px-4 py-2 bg-saffron-500 text-white text-sm font-semibold rounded-xl hover:bg-saffron-600 disabled:opacity-50">
                      {applying ? '…' : 'Apply'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-green-600" />
                      <span className="font-mono font-bold text-sm text-green-700">{appliedCoupon.code}</span>
                      <span className="text-xs text-gray-500">
                        {appliedCoupon.discountType === 'PERCENTAGE'
                          ? `${appliedCoupon.discountValue}% off${appliedCoupon.maxDiscount != null ? ` (max ₹${appliedCoupon.maxDiscount})` : ''}`
                          : `₹${appliedCoupon.discountValue} off`}
                      </span>
                    </div>
                    <button onClick={() => setAppliedCoupon(null)} className="text-gray-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                )}
                {useCoins && !appliedCoupon && (
                  <p className="text-[11px] text-gray-400 mt-1.5">Remove coins to apply a coupon — they cannot be combined.</p>
                )}
              </div>
            </motion.div>

            {/* ── Use Coins (redemption) ──────────────────── */}
            {walletInfo && !hasProducts && (
              <motion.div {...fadeUp(0.18)} className="mb-4">
                <div className="bg-white rounded-2xl border border-saffron-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                      <Coins size={13} className="text-saffron-500" /> Use Coins
                    </p>
                    <span className="text-xs text-gray-500">{coinBalance} coins balance</span>
                  </div>

                  {coinEligible ? (
                    <label className={`flex items-center justify-between gap-3 mt-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      useCoins ? 'border-saffron-500 bg-saffron-50' : 'border-gray-200 hover:border-saffron-200'
                    }`}>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-gray-800">
                          Apply {Math.max(0, coinCoins)} coins
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Redeem {formatINR(coinValue)} off this order
                        </p>
                      </div>
                      <input type="checkbox" checked={useCoins} onChange={(e) => toggleCoins(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                    </label>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2">
                      {coinRate <= 0
                        ? 'Coin value is not configured yet — redemption is unavailable.'
                        : coinBalance < coinMinCoins
                          ? `Redemption needs a minimum balance of ${coinMinCoins} coins. You have ${coinBalance}.`
                          : 'Coins cannot be combined with a coupon — remove the coupon to use coins.'}
                    </p>
                  )}
                  {useCoins && <p className="text-[11px] text-gray-400 mt-1.5">Coins are debited only after the payment succeeds.</p>}
                </div>
              </motion.div>
            )}

            {/* ── Trust + checkout ─────────────────────── */}
            <motion.div {...fadeUp(0.2)} className="space-y-3">
              <div className="flex items-center gap-2 py-2.5 px-4 rounded-xl border border-blue-100 bg-blue-50">
                <Shield size={13} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700">All payments are secured via PhonePe · UPI, Cards & Net Banking supported</p>
              </div>

              <button
                onClick={handleCheckout}
                disabled={paying}
                className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2"
              >
                {paying ? 'Creating order…' : `Checkout · ${formatINR(finalGrandTotal)} 🙏`}
              </button>

              <p className="text-center text-xs text-gray-400">
                You'll be redirected to PhonePe for secure payment
              </p>
            </motion.div>
      </div>
    </div>
  );
}
