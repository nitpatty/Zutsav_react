import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, ShoppingBag, Calendar, Clock, MapPin, Package, ArrowRight, Shield, Minus, Plus, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/priceEngine';
import API from '../api/axios';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const fadeUp = (d = 0) => ({ initial:{ opacity:0, y:16 }, animate:{ opacity:1, y:0, transition:{ duration:0.35, delay:d } } });

export default function CartPage() {
  const { items, poojaItems, productItems, grandTotal, removeItem, updateProductQty, clearCart, cartType } = useCart();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setPaying(true);
    try {
      const bookingPayload = poojaItems.map(item => ({
        poojaId:       item.poojaId,
        scheduledDate: item.bookingDetails.scheduledDate,
        scheduledTime: item.bookingDetails.scheduledTime,
        language:      item.bookingDetails.language,
        specialNote:   item.bookingDetails.specialNote,
        withKit:       item.bookingDetails.withKit,
        kitId:         item.bookingDetails.kitId || undefined,
        isUrgent:      item.bookingDetails.isUrgent,
        userDetails:   item.bookingDetails.userDetails,
      }));

      const productPayload = productItems.map(item => ({
        productId: item.productId,
        variantId: item.variantId || undefined,
        quantity:  item.quantity,
      }));

      const { data } = await API.post('/checkout/cart', {
        bookings: bookingPayload,
        products: productPayload,
      });

      clearCart();
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
                          {item.kitName && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                              <Package size={9}/> {item.kitName}
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
                      {fmtTime(item.bookingDetails?.scheduledTime)}
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
                      {item.pricing?.platformFee > 0 && <p>Fee: {formatINR(item.pricing?.platformFee)}</p>}
                      {item.pricing?.kitAmount > 0 && <p>Kit: {formatINR(item.pricing?.kitAmount)}</p>}
                      {item.pricing?.taxAmount > 0 && <p>Tax: {formatINR(item.pricing?.taxAmount)}</p>}
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
                      ? <img src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/${item.image}`} alt={item.name} className="w-full h-full object-cover" />
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

        {/* ── Order summary ─────────────────────────── */}
        <motion.div {...fadeUp(0.15)} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Order Summary</p>
          </div>
          <div className="px-5 py-4 space-y-2">
            {poojaItems.length > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Pooja Bookings ({poojaItems.length})</span>
                <span className="font-medium">{formatINR(poojaItems.reduce((s, i) => s + (i.pricing?.grandTotal || 0), 0))}</span>
              </div>
            )}
            {productItems.length > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Products ({productItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span className="font-medium">{formatINR(productItems.reduce((s, i) => s + i.price * i.quantity, 0))}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="font-bold text-gray-800">Grand Total</span>
              <span className="font-bold text-orange-600 text-xl" style={{ fontFamily: "'Cormorant Garamond',serif" }}>
                {formatINR(grandTotal)}
              </span>
            </div>
          </div>
        </motion.div>

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
            {paying ? 'Creating order…' : `Checkout · ${formatINR(grandTotal)} 🙏`}
          </button>

          <p className="text-center text-xs text-gray-400">
            You'll be redirected to PhonePe for secure payment
          </p>
        </motion.div>
      </div>
    </div>
  );
}
