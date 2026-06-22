import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, X, Search, Package, ArrowRight, Flame, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import PincodeInput from '../components/shared/PincodeInput';
import LoginModal from '../components/shared/LoginModal';

const CATEGORIES = ['all', 'samagri', 'rudraksha', 'yantra', 'incense', 'idol', 'books', 'pooja_essentials', 'other'];
const CAT_LABELS = {
  all: 'All', samagri: 'Samagri', rudraksha: 'Rudraksha',
  yantra: 'Yantra', incense: 'Incense', idol: 'Idols',
  books: 'Books', pooja_essentials: 'Pooja Essentials', other: 'Other',
};
const CAT_ICONS = {
  all: '✨', samagri: '🪔', rudraksha: '📿', yantra: '🔯',
  incense: '🌿', idol: '🛕', books: '📚', pooja_essentials: '🧿', other: '🎁',
};

const SORT_OPTIONS = [
  { value: '', label: 'Featured' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A–Z' },
];

const CART_KEY = 'zutsav_cart';

// ── Cart key helpers ──────────────────────────────────────────
const makeCartKey = (productId, variantId) => variantId ? `${productId}::${variantId}` : productId;

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    // Migrate old cart items that don't have cartKey
    return raw.map((item) => ({ ...item, cartKey: item.cartKey || item.productId }));
  } catch { return []; }
}
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
}

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [products,        setProducts]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [category,        setCategory]        = useState('all');
  const [search,          setSearch]          = useState('');
  const [sort,            setSort]            = useState('');
  const [cart,            setCart]            = useState(() => isAuthenticated ? loadCart() : []);
  const [showCart,        setShowCart]        = useState(false);
  const [showCheckout,    setShowCheckout]    = useState(false);
  const [paying,          setPaying]          = useState(false);
  const [showLogin,       setShowLogin]       = useState(false);
  const [loginMsg,        setLoginMsg]        = useState('');

  // Blinkit-style: track selected variant per product and which dropdown is open
  const [selectedVariants, setSelectedVariants] = useState({});
  const [openVariant,      setOpenVariant]      = useState(null);
  const variantRef = useRef(null);

  const [address, setAddress] = useState({ name:'', phone:'', address:'', pincode:'', state:'', city:'', district:'' });
  const setAddr = (f) => (e) => setAddress((prev) => ({ ...prev, [f]: e.target.value }));

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (search)             params.set('search', search);
    if (sort)               params.set('sort', sort);
    setError(null);
    setLoading(true);
    API.get(`/marketplace/products?${params}`)
      .then(({ data }) => setProducts(data.products ?? []))
      .catch((err)     => setError(err.message))
      .finally(()      => setLoading(false));
  }, [category, search, sort]);

  // Initialize selected variants when products load
  useEffect(() => {
    setSelectedVariants((prev) => {
      const next = { ...prev };
      products.forEach((p) => {
        if (p.variants?.length > 0 && !next[p._id]) {
          next[p._id] = p.variants[0];
        }
      });
      return next;
    });
  }, [products]);

  // Close variant dropdown on outside click
  useEffect(() => {
    if (!openVariant) return;
    const handler = (e) => {
      if (variantRef.current && !variantRef.current.contains(e.target)) setOpenVariant(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openVariant]);

  // ── Cart helpers ─────────────────────────────────────────────
  const requireAuth = (message) => { setLoginMsg(message); setShowLogin(true); return false; };

  const updateAndPersistCart = (updaterFn) => {
    setCart((prev) => {
      const next = updaterFn(prev);
      if (isAuthenticated) saveCart(next);
      return next;
    });
  };

  const addToCart = (product, selectedVariant = null) => {
    if (!isAuthenticated) { requireAuth('Please login to add items to your cart.'); return; }
    const variantId    = selectedVariant?.variantId || null;
    const variantLabel = selectedVariant?.quantity  || null;
    const price        = selectedVariant ? selectedVariant.price : (product.salePrice || product.price);
    const stock        = selectedVariant ? selectedVariant.stock  : product.stock;
    const cartKey      = makeCartKey(product._id, variantId);

    updateAndPersistCart((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey);
      if (existing) {
        if (existing.quantity >= stock) {
          toast.error(`Only ${stock} item${stock !== 1 ? 's' : ''} available`);
          return prev;
        }
        return prev.map((i) => i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        cartKey,
        productId:    product._id,
        variantId,
        variantLabel,
        name:         product.name,
        price,
        quantity:     1,
        image:        product.images?.[0],
        stock,
      }];
    });
    toast.success(`${product.name}${variantLabel ? ` (${variantLabel})` : ''} added to cart`);
  };

  const openCart = () => {
    if (!isAuthenticated) { requireAuth('Please login to view your cart.'); return; }
    setShowCart(true);
  };

  const updateQty = (cartKey, delta) => {
    updateAndPersistCart((prev) => prev.map((i) => {
      if (i.cartKey !== cartKey) return i;
      const newQty = i.quantity + delta;
      if (newQty < 1) return i;
      if (i.stock && newQty > i.stock) {
        toast.error(`Only ${i.stock} item${i.stock !== 1 ? 's' : ''} available`);
        return i;
      }
      return { ...i, quantity: newQty };
    }));
  };

  const removeFromCart = (cartKey) => updateAndPersistCart((prev) => prev.filter((i) => i.cartKey !== cartKey));
  const cartItemCount  = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal      = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── PhonePe checkout ─────────────────────────────────────────
  const handleCheckout = async () => {
    if (!isAuthenticated) { requireAuth('Please login to place your order.'); return; }
    if (!address.name || !address.phone || !address.address || !address.pincode) {
      toast.error('Please fill all address fields'); return;
    }
    setPaying(true);
    try {
      const { data } = await API.post('/marketplace/orders/create', {
        items: cart.map(({ productId, variantId, quantity }) => ({
          productId,
          quantity,
          ...(variantId ? { variantId } : {}),
        })),
        shippingAddress: address,
      });
      localStorage.removeItem(CART_KEY);
      setCart([]);
      window.location.href = data.redirectUrl;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Checkout failed');
      setPaying(false);
    }
  };

  // ── Product card renderer ─────────────────────────────────────
  const renderCard = (p) => {
    const hasVariants  = p.variants?.length > 0;
    const selVariant   = hasVariants ? (selectedVariants[p._id] || p.variants[0]) : null;
    const displayPrice = hasVariants ? (selVariant?.salePrice || selVariant?.price) : (p.salePrice || p.price);
    const slashedPrice = hasVariants
      ? (selVariant?.salePrice ? selVariant.price : null)
      : (p.salePrice ? p.price : null);
    const currentStock = hasVariants ? (selVariant?.stock ?? 0) : p.stock;
    const isOOS        = currentStock === 0 || (hasVariants && selVariant?.isActive === false);
    const discountPct  = slashedPrice ? Math.round((1 - displayPrice / slashedPrice) * 100) : 0;
    const cKey         = makeCartKey(p._id, hasVariants ? selVariant?.variantId : null);
    const qty          = cart.find((i) => i.cartKey === cKey)?.quantity || 0;

    const CounterBtn = ({ onAdd }) => (
      qty > 0 ? (
        <div className="flex items-center rounded-xl overflow-hidden shrink-0" style={{ background: 'var(--t-primary)' }}>
          <button onClick={() => updateQty(cKey, -1)} className="px-2.5 py-1.5 text-white hover:opacity-80 font-bold text-base leading-none">−</button>
          <span className="text-white text-xs font-bold min-w-[20px] text-center font-sans">{qty}</span>
          <button onClick={() => updateQty(cKey, +1)} className="px-2.5 py-1.5 text-white hover:opacity-80 font-bold text-base leading-none">+</button>
        </div>
      ) : (
        <button onClick={onAdd} disabled={isOOS}
          className={`text-xs px-3.5 py-2 rounded-xl font-semibold transition-all duration-200 shrink-0 font-sans ${
            isOOS ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-saffron-50 text-saffron-700 border border-saffron-200 hover:bg-saffron-500 hover:text-white hover:border-saffron-500'
          }`}>
          {isOOS ? 'Sold Out' : 'Add'}
        </button>
      )
    );

    return (
      <div key={p._id} className="group rounded-3xl transition-all duration-300 border relative"
        style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
        {/* Clickable image area */}
        <div className="relative overflow-hidden bg-saffron-50 rounded-t-3xl cursor-pointer"
          style={{ paddingTop: '125%' }}
          onClick={() => navigate(`/marketplace/product/${p.slug}`)}>
          <div className="absolute inset-0">
            {p.images?.[0]
              ? <img src={`http://localhost:5000/${p.images[0]}`} alt={p.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              : <div className="w-full h-full flex items-center justify-center text-6xl bg-gradient-to-br from-saffron-50 to-orange-50">🪔</div>
            }
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
          </div>
          {discountPct > 0 && (
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm font-sans">
              <Flame size={9} /> {discountPct}% OFF
            </div>
          )}
          {isOOS && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="bg-white text-gray-700 text-xs font-bold px-3 py-1.5 rounded-full font-sans">Out of Stock</span>
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4">
          <h3
            className="font-semibold text-sm line-clamp-2 leading-snug mb-2.5 font-sans cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: 'var(--t-text)' }}
            onClick={() => navigate(`/marketplace/product/${p.slug}`)}>
            {p.name}
          </h3>

          {hasVariants ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="relative mb-1.5" ref={openVariant === p._id ? variantRef : null}>
                  <button
                    onClick={() => setOpenVariant(openVariant === p._id ? null : p._id)}
                    className="flex items-center gap-1 bg-saffron-50 border border-saffron-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-saffron-700 hover:bg-saffron-100 transition-colors">
                    {selVariant?.quantity || '—'}
                    <ChevronDown size={11} className={`transition-transform ${openVariant === p._id ? 'rotate-180' : ''}`} />
                  </button>
                  {openVariant === p._id && (
                    <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[150px] overflow-hidden">
                      {p.variants.filter((v) => v.isActive !== false).map((v) => (
                        <button key={v.variantId}
                          onClick={() => { setSelectedVariants((prev) => ({ ...prev, [p._id]: v })); setOpenVariant(null); }}
                          className={`w-full text-left px-3 py-2.5 text-xs flex justify-between items-center hover:bg-saffron-50 transition-colors ${
                            selVariant?.variantId === v.variantId ? 'bg-saffron-50 font-semibold text-saffron-700' : 'text-gray-700'
                          } ${v.stock === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                          disabled={v.stock === 0}>
                          <span>{v.quantity}</span>
                          <span className="font-bold">₹{(v.salePrice || v.price).toLocaleString('en-IN')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-lg font-bold text-saffron-600">₹{displayPrice?.toLocaleString('en-IN')}</span>
                  {slashedPrice && <span className="text-xs text-gray-400 line-through font-sans">₹{slashedPrice.toLocaleString('en-IN')}</span>}
                </div>
              </div>
              <CounterBtn onAdd={() => addToCart(p, selVariant)} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-lg font-bold text-saffron-600">₹{displayPrice?.toLocaleString('en-IN')}</span>
                {slashedPrice && <span className="text-xs text-gray-400 line-through font-sans">₹{slashedPrice.toLocaleString('en-IN')}</span>}
              </div>
              <CounterBtn onAdd={() => addToCart(p)} />
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--t-bg)' }}>
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} message={loginMsg} />

      {/* ── Hero header ──────────────────────────────────── */}
      <div className="relative overflow-hidden border-b" style={{ background: 'var(--t-surface)', borderColor: 'var(--t-border)' }}>
        <div className="absolute inset-0 sacred-pattern pointer-events-none opacity-40" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div>
              <p className="section-eyebrow">Sacred Marketplace</p>
              <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', letterSpacing: '-0.025em', color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700 }}>
                Spiritual Products
              </h1>
              <p className="text-sm mt-1.5" style={{ color: 'var(--t-muted)' }}>Authentic samagri, rudraksha &amp; sacred items</p>
            </div>

            <button onClick={openCart}
              className="relative flex items-center gap-2.5 font-semibold px-5 py-3 rounded-2xl transition-all duration-200 border"
              style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
              <ShoppingCart size={18} style={{ color: 'var(--t-primary)' }} />
              <span>Cart</span>
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm" style={{ background: 'var(--t-primary)' }}>
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>

          {/* Search + sort */}
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input className="input pl-11 py-2.5 text-sm font-sans" placeholder="Search products..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select
              value={sort} onChange={(e) => setSort(e.target.value)}
              className="input py-2.5 text-sm font-sans sm:w-48 shrink-0"
              style={{ background: 'var(--t-card)', color: 'var(--t-text)', borderColor: 'var(--t-border)' }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Category grid */}
          <div className="mt-5 grid grid-cols-5 sm:grid-cols-9 gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className="flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-2xl transition-all duration-200 border"
                style={{
                  background:   category === c ? 'var(--t-primary)' : 'var(--t-card)',
                  color:        category === c ? 'var(--t-text-inv)' : 'var(--t-muted)',
                  borderColor:  category === c ? 'var(--t-primary)' : 'var(--t-border)',
                  boxShadow:    category === c ? '0 2px 8px rgba(27,31,59,0.2)' : 'none',
                }}>
                <span className="text-xl leading-none">{CAT_ICONS[c]}</span>
                <span className="text-[10px] font-semibold font-sans leading-tight text-center whitespace-nowrap">{CAT_LABELS[c] || c}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Products grid ────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {!isAuthenticated && (
          <div className="mb-8 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap border"
            style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--t-nav-active-bg)' }}>
                <ShoppingCart size={16} style={{ color: 'var(--t-primary)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>
                Login to add items to your cart and place orders
              </p>
            </div>
            <button onClick={() => requireAuth('Login to start shopping.')} className="btn-primary text-sm py-2 px-5 shrink-0">
              Login to Shop <ArrowRight size={14} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-80 skeleton rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="text-center py-28">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <Package size={36} className="text-gray-300" />
            </div>
            <p className="font-display text-xl font-bold text-gray-700 mb-1">Unable to Load Products</p>
            <p className="text-sm text-gray-400 font-sans">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-28">
            <div className="w-20 h-20 bg-saffron-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <Package size={36} className="text-saffron-300" />
            </div>
            <p className="font-display text-xl font-bold text-gray-700 mb-1">No Products Found</p>
            <p className="text-sm text-gray-400 font-sans mt-1">Try a different category or search term</p>
            <button onClick={() => { setCategory('all'); setSearch(''); }} className="btn-outline text-sm mt-5 font-sans">
              Clear Filters
            </button>
          </div>
        ) : category === 'all' ? (
          /* ── Blinkit-style: category sections ── */
          <div className="space-y-10">
            {CATEGORIES.filter((c) => c !== 'all').map((cat) => {
              const catProds = products.filter((p) => p.category === cat);
              if (catProds.length === 0) return null;
              return (
                <section key={cat}>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}>
                      <span>{CAT_ICONS[cat]}</span>{CAT_LABELS[cat]}
                    </h2>
                    <button onClick={() => setCategory(cat)}
                      className="text-xs font-semibold flex items-center gap-1 hover:underline font-sans" style={{ color: 'var(--t-primary)' }}>
                      See all <ArrowRight size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                    {catProds.map(renderCard)}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          /* ── Flat grid for filtered category ── */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map(renderCard)}
          </div>
        )}
      </div>

      {/* ── Cart Drawer ──────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="w-full max-w-sm h-full overflow-y-auto shadow-2xl flex flex-col" style={{ background: 'var(--t-card)', borderLeft: '1px solid var(--t-border)' }}>

            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="font-display font-bold text-gray-900 text-xl">Your Cart</h2>
                {cart.length > 0 && <p className="text-xs text-gray-400 font-sans">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</p>}
              </div>
              <button onClick={() => setShowCart(false)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-20 h-20 bg-saffron-50 rounded-3xl flex items-center justify-center mb-5">
                  <ShoppingCart size={32} className="text-saffron-300" />
                </div>
                <p className="font-display font-bold text-gray-700 text-xl mb-1">Cart is Empty</p>
                <p className="text-sm text-gray-400 mb-6 font-sans">Add some spiritual items to get started</p>
                <button onClick={() => setShowCart(false)} className="btn-outline text-sm font-sans">Browse Products</button>
              </div>
            ) : (
              <>
                <div className="flex-1 p-5 space-y-4">
                  {cart.map((item) => (
                    <div key={item.cartKey} className="flex gap-3 items-start bg-gray-50 rounded-2xl p-3">
                      <div className="w-14 h-14 bg-saffron-50 rounded-xl overflow-hidden shrink-0">
                        {item.image
                          ? <img src={`http://localhost:5000/${item.image}`} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-xl">🪔</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 line-clamp-1 font-sans">
                          {item.name}{item.variantLabel ? <span className="text-saffron-600"> ({item.variantLabel})</span> : ''}
                        </p>
                        <p className="font-display font-bold text-saffron-600 text-sm mt-0.5">
                          ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => updateQty(item.cartKey, -1)}
                          className="w-7 h-7 rounded-lg bg-white border border-gray-200 hover:border-saffron-300 hover:bg-saffron-50 flex items-center justify-center transition-colors">
                          <Minus size={11} />
                        </button>
                        <span className="w-7 text-center text-sm font-semibold font-sans">{item.quantity}</span>
                        <button onClick={() => updateQty(item.cartKey, +1)}
                          className="w-7 h-7 rounded-lg bg-white border border-gray-200 hover:border-saffron-300 hover:bg-saffron-50 flex items-center justify-center transition-colors">
                          <Plus size={11} />
                        </button>
                        <button onClick={() => removeFromCart(item.cartKey)}
                          className="w-7 h-7 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 flex items-center justify-center ml-0.5 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sticky bottom-0 bg-white border-t border-gray-100 p-5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-sans">Subtotal ({cartItemCount} items)</span>
                    <span className="font-display font-bold text-gray-900 text-xl">₹{cartTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <button onClick={() => { setShowCart(false); setShowCheckout(true); }}
                    className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 font-sans">
                    Proceed to Checkout <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Checkout Modal ───────────────────────────────── */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
          <div className="rounded-3xl shadow-premium w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-5 flex items-center justify-between rounded-t-3xl z-10">
              <div>
                <h2 className="font-display font-bold text-gray-900 text-2xl">Shipping Details</h2>
                <p className="text-xs text-gray-400 mt-0.5 font-sans">Where should we deliver?</p>
              </div>
              <button onClick={() => setShowCheckout(false)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full Name</label>
                  <input className="input font-sans" placeholder="Your name" value={address.name} onChange={setAddr('name')} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input font-sans" placeholder="10-digit number" value={address.phone} onChange={setAddr('phone')} />
                </div>
              </div>
              <div>
                <label className="label">Delivery Address</label>
                <textarea rows={2} className="input resize-none font-sans" placeholder="House/flat no., street, area" value={address.address} onChange={setAddr('address')} />
              </div>
              <div>
                <label className="label">Pincode</label>
                <PincodeInput
                  value={address.pincode}
                  onChange={(v) => setAddress((p) => ({ ...p, pincode: v }))}
                  onFill={({ state, city, district }) => setAddress((p) => ({ ...p, state, city, district }))}
                />
              </div>
              {address.state && (
                <div className="grid grid-cols-3 gap-2">
                  {[['state','State'],['city','City'],['district','District']].map(([f, l]) => (
                    <div key={f}>
                      <label className="label text-xs">{l}</label>
                      <input className="input text-sm bg-gray-50 font-sans" value={address[f]} onChange={setAddr(f)} />
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl p-4 flex justify-between items-center border border-saffron-100"
                style={{ background: 'linear-gradient(135deg, #fff8f0, #FAF6EE)' }}>
                <div>
                  <span className="font-semibold text-gray-700 font-sans">Order Total</span>
                  <p className="text-xs text-gray-400 font-sans mt-0.5">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</p>
                </div>
                <span className="font-display text-2xl font-bold text-saffron-600">₹{cartTotal.toLocaleString('en-IN')}</span>
              </div>

              <button onClick={handleCheckout} disabled={paying}
                className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 font-sans">
                {paying ? <>Processing <span className="animate-pulse-soft">...</span></> : <>Pay ₹{cartTotal.toLocaleString('en-IN')} <span>🙏</span></>}
              </button>

              <p className="text-xs text-center text-gray-400 font-sans">
                🔒 Secured by PhonePe · UPI, Cards, Net Banking accepted
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
