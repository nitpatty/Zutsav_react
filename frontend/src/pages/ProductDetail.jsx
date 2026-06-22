import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Minus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import LoginModal from '../components/shared/LoginModal';

const CART_KEY = 'zutsav_cart';
const makeCartKey = (productId, variantId) => variantId ? `${productId}::${variantId}` : productId;

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* noop */ }
}

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [product,  setProduct]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [selVariant, setSelVariant] = useState(null);
  const [qty,      setQty]      = useState(1);
  const [mainImg,  setMainImg]  = useState(0);
  const [cart,     setCart]     = useState(() => loadCart());
  const [showLogin, setShowLogin] = useState(false);
  const [loginMsg,  setLoginMsg]  = useState('');

  useEffect(() => {
    setLoading(true);
    API.get(`/marketplace/products/${slug}`)
      .then(({ data }) => {
        setProduct(data.product);
        const firstActive = data.product.variants?.find((v) => v.isActive !== false);
        if (firstActive) setSelVariant(firstActive);
      })
      .catch(() => { toast.error('Product not found'); navigate('/marketplace'); })
      .finally(() => setLoading(false));
  }, [slug, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--t-bg)' }}>
        <div className="w-10 h-10 border-4 border-saffron-200 border-t-saffron-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) return null;

  const hasVariants  = product.variants?.length > 0;
  const displayPrice = hasVariants ? (selVariant?.salePrice || selVariant?.price) : (product.salePrice || product.price);
  const slashedPrice = hasVariants
    ? (selVariant?.salePrice ? selVariant.price : null)
    : (product.salePrice ? product.price : null);
  const currentStock = hasVariants ? (selVariant?.stock ?? 0) : product.stock;
  const isOOS        = currentStock === 0 || (hasVariants && selVariant?.isActive === false);
  const cKey         = makeCartKey(product._id, hasVariants ? selVariant?.variantId : null);
  const cartQty      = cart.find((i) => i.cartKey === cKey)?.quantity || 0;
  const discountPct  = slashedPrice ? Math.round((1 - displayPrice / slashedPrice) * 100) : 0;

  const updateAndPersist = (fn) => {
    const next = fn(cart);
    setCart(next);
    if (isAuthenticated) saveCart(next);
  };

  const addToCart = () => {
    if (!isAuthenticated) { setLoginMsg('Please login to add items to your cart.'); setShowLogin(true); return; }
    if (isOOS) return;
    updateAndPersist((prev) => {
      const existing = prev.find((i) => i.cartKey === cKey);
      const addQty   = qty;
      if (existing) {
        if (existing.quantity + addQty > currentStock) {
          toast.error(`Only ${currentStock} available`); return prev;
        }
        return prev.map((i) => i.cartKey === cKey ? { ...i, quantity: i.quantity + addQty } : i);
      }
      if (addQty > currentStock) { toast.error(`Only ${currentStock} available`); return prev; }
      return [...prev, {
        cartKey:      cKey,
        productId:    product._id,
        variantId:    hasVariants ? selVariant?.variantId : null,
        variantLabel: hasVariants ? selVariant?.quantity  : null,
        name:         product.name,
        price:        displayPrice,
        quantity:     addQty,
        image:        product.images?.[0],
        stock:        currentStock,
      }];
    });
    toast.success(`${product.name}${selVariant ? ` (${selVariant.quantity})` : ''} added to cart`);
  };

  const updateCartQty = (delta) => {
    updateAndPersist((prev) => {
      const item = prev.find((i) => i.cartKey === cKey);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty < 1) return prev.filter((i) => i.cartKey !== cKey);
      if (item.stock && newQty > item.stock) { toast.error(`Only ${item.stock} available`); return prev; }
      return prev.map((i) => i.cartKey === cKey ? { ...i, quantity: newQty } : i);
    });
  };

  const images = product.images?.length ? product.images : [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--t-bg)' }}>
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} message={loginMsg} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <button onClick={() => navigate('/marketplace')}
          className="flex items-center gap-2 text-sm font-semibold mb-8 hover:opacity-70 transition-opacity font-sans"
          style={{ color: 'var(--t-muted)' }}>
          <ArrowLeft size={16} /> Back to Marketplace
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* ── Image gallery ── */}
          <div>
            <div className="rounded-3xl overflow-hidden border aspect-square bg-saffron-50 mb-4"
              style={{ borderColor: 'var(--t-border)' }}>
              {images[mainImg]
                ? <img src={`http://localhost:5000/${images[mainImg]}`} alt={product.name}
                    className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-9xl">🪔</div>
              }
            </div>
            {images.length > 1 && (
              <div className="flex gap-3 flex-wrap">
                {images.map((img, i) => (
                  <button key={i} onClick={() => setMainImg(i)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                      i === mainImg ? 'border-saffron-500' : 'border-transparent'
                    }`}>
                    <img src={`http://localhost:5000/${img}`} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Product info ── */}
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2 font-sans" style={{ color: 'var(--t-primary)' }}>
                {product.category?.replace('_', ' ')}
              </p>
              <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}>
                {product.name}
              </h1>
              {product.description && (
                <p className="text-sm leading-relaxed font-sans" style={{ color: 'var(--t-muted)' }}>{product.description}</p>
              )}
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-saffron-600" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                ₹{displayPrice?.toLocaleString('en-IN')}
              </span>
              {slashedPrice && (
                <span className="text-xl text-gray-400 line-through font-sans">₹{slashedPrice.toLocaleString('en-IN')}</span>
              )}
              {discountPct > 0 && (
                <span className="text-sm font-bold text-green-600 bg-green-50 px-2.5 py-0.5 rounded-full font-sans">{discountPct}% OFF</span>
              )}
            </div>

            {/* Variant chips */}
            {hasVariants && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2.5 uppercase tracking-wide font-sans">Select Quantity</p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.filter((v) => v.isActive !== false).map((v) => {
                    const isSel = selVariant?.variantId === v.variantId;
                    return (
                      <button key={v.variantId}
                        onClick={() => { setSelVariant(v); setQty(1); }}
                        disabled={v.stock === 0}
                        className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all font-sans ${
                          isSel
                            ? 'border-saffron-500 bg-saffron-50 text-saffron-700'
                            : v.stock === 0
                              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                              : 'border-gray-200 text-gray-700 hover:border-saffron-300'
                        }`}>
                        {v.quantity}
                        {v.stock === 0 && <span className="ml-1 text-xs">(OOS)</span>}
                      </button>
                    );
                  })}
                </div>
                {selVariant?.stock > 0 && selVariant.stock <= 10 && (
                  <p className="text-xs text-orange-600 mt-2 font-sans">Only {selVariant.stock} left in stock</p>
                )}
              </div>
            )}

            {!hasVariants && product.stock > 0 && product.stock <= 10 && (
              <p className="text-xs text-orange-600 font-sans">Only {product.stock} left in stock</p>
            )}

            {/* Qty selector + Add to Cart */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Quantity picker */}
              <div className="flex items-center gap-2 border rounded-xl px-1 py-1" style={{ borderColor: 'var(--t-border)', background: 'var(--t-card)' }}>
                <button onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <Minus size={14} />
                </button>
                <span className="min-w-[32px] text-center font-semibold font-sans" style={{ color: 'var(--t-text)' }}>{qty}</span>
                <button onClick={() => setQty((q) => Math.min(currentStock || 99, q + 1))}
                  disabled={qty >= (currentStock || 99)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <Plus size={14} />
                </button>
              </div>

              {/* Add to Cart / counter */}
              {isOOS ? (
                <button disabled className="btn-primary px-8 py-3 opacity-50 cursor-not-allowed flex-1 sm:flex-none">
                  Out of Stock
                </button>
              ) : cartQty > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'var(--t-primary)' }}>
                    <button onClick={() => updateCartQty(-1)} className="px-4 py-3 text-white hover:opacity-80 font-bold text-lg">−</button>
                    <span className="text-white font-bold px-2 font-sans">{cartQty}</span>
                    <button onClick={() => updateCartQty(+1)} className="px-4 py-3 text-white hover:opacity-80 font-bold text-lg">+</button>
                  </div>
                  <button onClick={() => navigate('/marketplace')}
                    className="flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl border transition-colors font-sans"
                    style={{ borderColor: 'var(--t-primary)', color: 'var(--t-primary)' }}>
                    <ShoppingCart size={16} /> View Cart
                  </button>
                </div>
              ) : (
                <button onClick={addToCart}
                  className="btn-primary flex-1 sm:flex-none px-8 py-3 flex items-center justify-center gap-2 font-sans">
                  <ShoppingCart size={18} /> Add to Cart
                </button>
              )}
            </div>

            {/* Tags */}
            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {product.tags.map((t) => (
                  <span key={t} className="text-xs px-3 py-1 rounded-full font-sans"
                    style={{ background: 'var(--t-surface)', color: 'var(--t-muted)', border: '1px solid var(--t-border)' }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
