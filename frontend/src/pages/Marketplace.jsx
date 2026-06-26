import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, X, Search, Flame, ChevronDown, ArrowRight, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import LoginModal from '../components/shared/LoginModal';

const ALL_TAB = { slug: 'all', name: 'All', icon: '✨' };

const SORT_OPTIONS = [
  { value: '', label: 'Featured' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A–Z' },
];

// Cart key must match CartContext format: `${productId}::${variantId || ''}`
const makeCKey = (productId, variantId) => `${productId}::${variantId || ''}`;

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const { addProduct, productItems, updateProductQty, removeItem, cartCount } = useCart();
  const navigate = useNavigate();

  const [products,        setProducts]        = useState([]);
  const [categories,      setCategories]      = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [category,        setCategory]        = useState('all');
  const [search,          setSearch]          = useState('');
  const [sort,            setSort]            = useState('');
  const [showLogin,       setShowLogin]       = useState(false);
  const [loginMsg,        setLoginMsg]        = useState('');

  // Blinkit-style: track selected variant per product and which dropdown is open
  const [selectedVariants, setSelectedVariants] = useState({});
  const [openVariant,      setOpenVariant]      = useState(null);
  const variantRef = useRef(null);

  useEffect(() => {
    API.get('/marketplace/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

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
  const requireAuth = (message) => { setLoginMsg(message); setShowLogin(true); };

  const handleAddToCart = (product, selectedVariant = null) => {
    if (!isAuthenticated) { requireAuth('Please login to add items to your cart.'); return; }
    const variantId    = selectedVariant?.variantId || null;
    const variantLabel = selectedVariant?.quantity  || null;
    const price        = selectedVariant ? (selectedVariant.salePrice || selectedVariant.price) : undefined;
    addProduct({ product, variantId, variantLabel, price, taxRate: product.taxRate || 0 });
    toast.success(`${product.name}${variantLabel ? ` (${variantLabel})` : ''} added to cart`);
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
    const cKey      = makeCKey(p._id, hasVariants ? selVariant?.variantId : null);
    const cartItem  = productItems.find((i) => i.key === cKey);
    const qty       = cartItem?.quantity || 0;

    const CounterBtn = ({ onAdd }) => (
      qty > 0 ? (
        <div className="flex items-center rounded-xl overflow-hidden shrink-0" style={{ background: 'var(--t-primary)' }}>
          <button onClick={() => updateProductQty(cartItem.id, qty - 1)} className="px-2.5 py-1.5 text-white hover:opacity-80 font-bold text-base leading-none">−</button>
          <span className="text-white text-xs font-bold min-w-[20px] text-center font-sans">{qty}</span>
          <button onClick={() => {
            if (currentStock && qty >= currentStock) { toast.error(`Only ${currentStock} in stock`); return; }
            updateProductQty(cartItem.id, qty + 1);
          }} className="px-2.5 py-1.5 text-white hover:opacity-80 font-bold text-base leading-none">+</button>
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
              <CounterBtn onAdd={() => handleAddToCart(p, selVariant)} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-lg font-bold text-saffron-600">₹{displayPrice?.toLocaleString('en-IN')}</span>
                {slashedPrice && <span className="text-xs text-gray-400 line-through font-sans">₹{slashedPrice.toLocaleString('en-IN')}</span>}
              </div>
              <CounterBtn onAdd={() => handleAddToCart(p)} />
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

            <button onClick={() => navigate('/cart')}
              className="relative flex items-center gap-2.5 font-semibold px-5 py-3 rounded-2xl transition-all duration-200 border"
              style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
              <ShoppingCart size={18} style={{ color: 'var(--t-primary)' }} />
              <span>Cart</span>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm" style={{ background: 'var(--t-primary)' }}>
                  {cartCount}
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

          {/* Category grid — dynamic from DB */}
          <div className="mt-5 flex flex-wrap gap-2">
            {[ALL_TAB, ...categories].map((c) => (
              <button key={c.slug} onClick={() => setCategory(c.slug)}
                className="flex flex-col items-center gap-1.5 py-2.5 px-3 rounded-2xl transition-all duration-200 border"
                style={{
                  background:   category === c.slug ? 'var(--t-primary)' : 'var(--t-card)',
                  color:        category === c.slug ? 'var(--t-text-inv)' : 'var(--t-muted)',
                  borderColor:  category === c.slug ? 'var(--t-primary)' : 'var(--t-border)',
                  boxShadow:    category === c.slug ? '0 2px 8px rgba(27,31,59,0.2)' : 'none',
                }}>
                <span className="text-xl leading-none">{c.icon}</span>
                <span className="text-[10px] font-semibold font-sans leading-tight text-center whitespace-nowrap">{c.name}</span>
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
          /* ── Blinkit-style: category sections (DB-driven) ── */
          <div className="space-y-10">
            {categories.map((cat) => {
              const catProds = products.filter((p) => p.category === cat.slug);
              if (catProds.length === 0) return null;
              return (
                <section key={cat.slug}>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}>
                      <span>{cat.icon}</span>{cat.name}
                    </h2>
                    <button onClick={() => setCategory(cat.slug)}
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

    </div>
  );
}
