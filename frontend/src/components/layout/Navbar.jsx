import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, User, LogOut, LayoutDashboard, BookOpen, ShoppingBag,
  Bell, Moon, Sparkles, Home, CalendarDays, MapPin, Tv,
  ChevronDown, Package, Users, Settings, Star, Flame, ShoppingCart,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useCart } from '../../context/CartContext';
import { useSettings } from '../../context/SettingsContext';
import ThemeToggle from '../ui/ThemeSwitcher';
import { getImageUrl } from '../../config';
import { isAdminRole } from '../../utils/roleUtils';

// Single source of truth for primary navigation — identical for guests and
// logged-in users (split around Temples, which renders as a dropdown via
// TEMPLE_SUBMENU below rather than a plain link, but sits at this position
// in the display order: Home, Poojas, Festivals, Marketplace, Temples,
// Panchang, Blog, AI Guide).
// AI Guide is a fully public discovery feature (backend: optionalAuth on
// /api/ai/chat and /api/ai/guided-recommend; frontend: /ai-assistant route
// has no auth guard) — it belongs in this shared list, not a logged-in-only one.
const NAV_LINKS_MAIN = [
  { to: '/',             label: 'Home',        icon: Home,         i18nKey: 'nav.home' },
  { to: '/poojas',       label: 'Poojas',      icon: Flame,        i18nKey: 'nav.poojas' },
  { to: '/festivals',    label: 'Festivals',   icon: CalendarDays, i18nKey: 'nav.festivals' },
  { to: '/marketplace',  label: 'Marketplace', icon: ShoppingBag,  i18nKey: 'nav.marketplace' },
];
const NAV_LINKS_TAIL = [
  { to: '/panchang',     label: 'Panchang',    icon: Moon,         i18nKey: 'nav.panchang' },
  { to: '/blog',         label: 'Blog',        icon: FileText,     i18nKey: 'nav.blog' },
  { to: '/ai-assistant', label: 'AI Guide',    icon: Sparkles,     i18nKey: 'nav.aiGuide' },
];

const TEMPLE_SUBMENU = [
  { to: '/temples',             label: 'Temple Directory',   i18nKey: 'nav.templeDirectory' },
  { to: '/temples/livestreams', label: 'Temple Livestreams', i18nKey: 'nav.templeLivestreams' },
  { to: '/temples/details',     label: 'Temple Details',     i18nKey: 'nav.templeDetails' },
  { to: '/temples/location',    label: 'Temple Location',    i18nKey: 'nav.templeLocation' },
  { to: '/temples/info',        label: 'Temple Information', i18nKey: 'nav.templeInfo' },
];

function getProfilePath(role) {
  if (isAdminRole(role)) return '/admin/profile';
  if (role === 'pandit') return '/pandit/profile';
  return '/profile';
}

const PROFILE_MENU_BASE = [
  { to: '/my-bookings',   label: 'My Bookings',    icon: BookOpen,  i18nKey: 'nav.myBookings' },
  { to: '/my-orders',     label: 'My Orders',      icon: Package,   i18nKey: 'nav.myOrders' },
  { to: '/family',        label: 'Family Members', icon: Users,     i18nKey: 'nav.familyMembers' },
  { to: '/kundli',        label: 'Kundli',         icon: Star,      i18nKey: 'nav.kundli' },
  { to: '/notifications', label: 'Notifications',  icon: Bell,      i18nKey: 'nav.notifications' },
  { to: '/settings',      label: 'Settings',       icon: Settings,  i18nKey: 'nav.settings' },
];

function getProfileMenu(role) {
  return [
    { to: getProfilePath(role), label: 'My Profile', icon: User, i18nKey: 'nav.myProfile' },
    ...PROFILE_MENU_BASE,
  ];
}

function useClickOutside(ref, handler) {
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) handler(); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [ref, handler]);
}

export default function Navbar() {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { cartCount } = useCart();
  const { logoUrl, platformName } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [templeOpen,  setTempleOpen]  = useState(false);
  const [scrolled,    setScrolled]    = useState(false);

  const profileRef = useRef(null);
  const templeRef  = useRef(null);

  useClickOutside(profileRef, () => setProfileOpen(false));
  useClickOutside(templeRef,  () => setTempleOpen(false));

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    logout(); navigate('/');
    setProfileOpen(false); setMobileOpen(false);
  };

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(path + '/');

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'Z';

  return (
    <>
      <nav className="sticky top-0 z-50 px-3 pt-3 pb-2 sm:px-4">
        <div
          className="max-w-7xl mx-auto rounded-full transition-all duration-300"
          style={{
            background: scrolled
              ? 'rgba(var(--t-card, 255,255,255), 0.92)'
              : 'rgba(var(--t-card, 255,255,255), 0.75)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: `1px solid var(--t-border)`,
            boxShadow: scrolled ? '0 10px 30px rgba(0,0,0,0.08)' : '0 4px 18px rgba(0,0,0,0.05)',
          }}
        >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`flex items-center justify-between gap-4 transition-all duration-300 ${scrolled ? 'h-14' : 'h-16'}`}>

            {/* ── Logo ─────────────────────────────────────────── */}
            <Link to="/" className="flex items-center shrink-0 group">
              <img
                src={logoUrl || 'https://zutsav.com/storage/settings/admin_logo_1778665731.png'}
                alt={platformName || 'Zutsav'}
                className="h-9 w-auto object-contain group-hover:opacity-90 transition-opacity duration-200"
              />
            </Link>

            {/* ── Desktop navigation — identical for guests and logged-in users ── */}
            <div className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
              {NAV_LINKS_MAIN.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                  style={{
                    color: isActive(l.to) ? 'var(--t-primary)' : 'var(--t-muted)',
                    background: isActive(l.to) ? 'var(--t-nav-active-bg)' : 'transparent',
                  }}
                >
                  {l.i18nKey ? t(l.i18nKey, l.label) : l.label}
                </Link>
              ))}

              {/* Temples dropdown — always rendered, regardless of auth state */}
              <div className="relative" ref={templeRef}>
                <button
                  onClick={() => setTempleOpen(!templeOpen)}
                  className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                  style={{
                    color: location.pathname.startsWith('/temples') ? 'var(--t-primary)' : 'var(--t-muted)',
                    background: location.pathname.startsWith('/temples') ? 'var(--t-nav-active-bg)' : 'transparent',
                  }}
                >
                  {t('nav.temples', 'Temples')}
                  <motion.div animate={{ rotate: templeOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={13} />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {templeOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="absolute top-full left-0 mt-2 w-52 rounded-2xl shadow-float py-2 z-50"
                      style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}
                    >
                      {TEMPLE_SUBMENU.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setTempleOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-150"
                          style={{ color: 'var(--t-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--t-nav-active-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <MapPin size={12} style={{ color: 'var(--t-primary)' }} className="shrink-0" />
                          {t(item.i18nKey, item.label)}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {NAV_LINKS_TAIL.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                  style={{
                    color: isActive(l.to) ? 'var(--t-primary)' : 'var(--t-muted)',
                    background: isActive(l.to) ? 'var(--t-nav-active-bg)' : 'transparent',
                  }}
                >
                  {l.i18nKey ? t(l.i18nKey, l.label) : l.label}
                </Link>
              ))}
            </div>

            {/* ── Desktop right area ───────────────────────────── */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {/* Theme toggle */}
              <ThemeToggle />

              {isAuthenticated ? (
                <>
                  {/* Notification bell */}
                  <Link
                    to="/notifications"
                    className="relative p-2 rounded-xl transition-all duration-200"
                    style={{ color: 'var(--t-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--t-nav-active-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1"
                        style={{ background: 'var(--t-primary)' }}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </motion.span>
                    )}
                  </Link>

                  {/* Cart */}
                  <Link
                    to="/cart"
                    className="relative p-2 rounded-xl transition-all duration-200"
                    style={{ color: 'var(--t-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--t-nav-active-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <ShoppingCart size={18} />
                    {cartCount > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1"
                        style={{ background: '#D4AF37' }}
                      >
                        {cartCount > 99 ? '99+' : cartCount}
                      </motion.span>
                    )}
                  </Link>

                  {/* Profile dropdown */}
                  <div className="relative" ref={profileRef}>
                    <button
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-xl border transition-all duration-200"
                      style={{
                        borderColor: profileOpen ? 'var(--t-primary)' : 'var(--t-border)',
                        background: 'var(--t-card)',
                        boxShadow: profileOpen ? '0 0 0 3px var(--t-ring)' : 'none',
                      }}
                    >
                      {user?.profilePhoto ? (
                        <img
                          src={getImageUrl(user.profilePhoto)}
                          alt="avatar"
                          className="w-7 h-7 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: 'var(--t-primary)' }}
                        >
                          {initials}
                        </div>
                      )}
                      <span className="text-sm font-medium max-w-[80px] truncate" style={{ color: 'var(--t-text)' }}>
                        {user?.name?.split(' ')[0]}
                      </span>
                      <motion.div animate={{ rotate: profileOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown size={13} style={{ color: 'var(--t-muted)' }} />
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {profileOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96, y: -6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, y: -6 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          className="absolute right-0 mt-2 w-64 rounded-2xl shadow-float py-2 z-50 overflow-hidden"
                          style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}
                        >
                          {/* Profile header */}
                          <div
                            className="px-4 py-3 mb-1 border-b"
                            style={{
                              background: 'var(--t-nav-active-bg)',
                              borderColor: 'var(--t-border)',
                            }}
                          >
                            <div className="flex items-center gap-3">
                              {user?.profilePhoto ? (
                                <img
                                  src={getImageUrl(user.profilePhoto)}
                                  alt="avatar"
                                  className="w-10 h-10 rounded-xl object-cover shrink-0"
                                />
                              ) : (
                                <div
                                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                                  style={{ background: 'var(--t-primary)' }}
                                >
                                  {initials}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate" style={{ color: 'var(--t-text)' }}>{user?.name}</p>
                                <p className="text-xs capitalize font-medium" style={{ color: 'var(--t-primary)' }}>{user?.role}</p>
                              </div>
                            </div>
                          </div>

                          {/* Dashboard link */}
                          {user?.role === 'pandit' && (
                            <Link
                              to="/pandit/dashboard"
                              onClick={() => setProfileOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150"
                              style={{ color: 'var(--t-muted)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--t-nav-active-bg)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <LayoutDashboard size={14} style={{ color: 'var(--t-primary)' }} />
                              {t('nav.panditDashboard', 'Pandit Dashboard')}
                            </Link>
                          )}
                          {isAdminRole(user?.role) && (
                            <Link
                              to="/admin"
                              onClick={() => setProfileOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150"
                              style={{ color: 'var(--t-muted)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--t-nav-active-bg)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <LayoutDashboard size={14} style={{ color: 'var(--t-primary)' }} />
                              {t('nav.adminPanel', 'Admin Panel')}
                            </Link>
                          )}

                          {getProfileMenu(user?.role).map(({ to, label, icon: Icon, i18nKey }) => (
                            <Link
                              key={to}
                              to={to}
                              onClick={() => setProfileOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150"
                              style={{ color: 'var(--t-muted)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--t-nav-active-bg)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <Icon size={14} style={{ color: 'var(--t-muted)', opacity: 0.7 }} className="shrink-0" />
                              <span className="flex-1" style={{ color: 'var(--t-text)' }}>{t(i18nKey, label)}</span>
                              {to === '/notifications' && unreadCount > 0 && (
                                <span
                                  className="text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1"
                                  style={{ background: 'var(--t-primary)' }}
                                >
                                  {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                              )}
                            </Link>
                          ))}

                          <div className="border-t mt-1 pt-1" style={{ borderColor: 'var(--t-border)' }}>
                            <button
                              onClick={handleLogout}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors duration-150"
                            >
                              <LogOut size={14} /> {t('nav.signOut', 'Sign Out')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-ghost text-sm">{t('auth.login', 'Login')}</Link>
                  <Link to="/register" className="btn-primary text-sm">{t('auth.getStarted', 'Get Started')}</Link>
                </>
              )}
            </div>

            {/* ── Mobile hamburger ─────────────────────────────── */}
            <button
              className="lg:hidden p-2 rounded-xl transition-colors duration-200 shrink-0"
              style={{ color: 'var(--t-muted)' }}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        </div>
      </nav>

      {/* ── Mobile drawer ───────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40"
              style={{ background: 'var(--t-overlay)' }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed top-0 left-0 h-full w-72 z-50 flex flex-col overflow-hidden"
              style={{ background: 'var(--t-sidebar)', borderRight: '1px solid var(--t-sidebar-border)' }}
            >
              {/* Drawer header */}
              <div
                className="flex items-center justify-between px-5 h-16 border-b flex-shrink-0"
                style={{ borderColor: 'var(--t-sidebar-border)' }}
              >
                <Link to="/" className="flex items-center">
                  <img
                    src="https://zutsav.com/storage/settings/admin_logo_1778665731.png"
                    alt="Zutsav"
                    className="h-9 w-auto object-contain"
                  />
                </Link>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-xl transition-colors"
                  style={{ color: 'var(--t-muted)' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer body — nav links identical for guests and logged-in users;
                  only the user-info card and Account section are conditional. */}
              <div className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                {isAuthenticated && (
                  <div
                    className="flex items-center gap-3 px-3 py-3 rounded-2xl mb-4"
                    style={{ background: 'var(--t-nav-active-bg)' }}
                  >
                    {user?.profilePhoto ? (
                      <img src={getImageUrl(user.profilePhoto)} alt="avatar"
                        className="w-10 h-10 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                        style={{ background: 'var(--t-primary)' }}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--t-text)' }}>{user?.name}</p>
                      <p className="text-xs capitalize font-medium" style={{ color: 'var(--t-primary)' }}>{user?.role}</p>
                    </div>
                  </div>
                )}

                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t-muted)', opacity: 0.6 }}>{t('nav.sectionNavigation', 'Navigation')}</p>

                {[...NAV_LINKS_MAIN, { to: '/temples', label: 'Temples', icon: MapPin, i18nKey: 'nav.temples' }, ...NAV_LINKS_TAIL].map(({ to, label, icon: Icon, i18nKey }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-150"
                    style={{
                      color: isActive(to) ? 'var(--t-primary)' : 'var(--t-muted)',
                      background: isActive(to) ? 'var(--t-nav-active-bg)' : 'transparent',
                    }}
                  >
                    <Icon size={16} style={{ color: isActive(to) ? 'var(--t-primary)' : 'var(--t-muted)' }} />
                    {t(i18nKey, label)}
                  </Link>
                ))}

                {isAuthenticated && (
                  <>
                    {user?.role === 'pandit' && (
                      <Link
                        to="/pandit/dashboard"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                        style={{ color: 'var(--t-muted)' }}
                      >
                        <LayoutDashboard size={16} /> {t('nav.panditDashboard', 'Pandit Dashboard')}
                      </Link>
                    )}
                    {isAdminRole(user?.role) && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                        style={{ color: 'var(--t-muted)' }}
                      >
                        <LayoutDashboard size={16} /> {t('nav.adminPanel', 'Admin Panel')}
                      </Link>
                    )}

                    {/* Cart link in mobile */}
                    <Link
                      to="/cart"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-150"
                      style={{
                        color: isActive('/cart') ? 'var(--t-primary)' : 'var(--t-muted)',
                        background: isActive('/cart') ? 'var(--t-nav-active-bg)' : 'transparent',
                      }}
                    >
                      <ShoppingCart size={16} style={{ color: isActive('/cart') ? 'var(--t-primary)' : 'var(--t-muted)' }} />
                      <span className="flex-1" style={{ color: 'var(--t-text)' }}>{t('nav.myCart', 'My Cart')}</span>
                      {cartCount > 0 && (
                        <span
                          className="text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1"
                          style={{ background: '#D4AF37' }}
                        >
                          {cartCount > 99 ? '99+' : cartCount}
                        </span>
                      )}
                    </Link>

                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest mt-2" style={{ color: 'var(--t-muted)', opacity: 0.6 }}>{t('nav.sectionAccount', 'Account')}</p>

                    {getProfileMenu(user?.role).map(({ to, label, icon: Icon, i18nKey }) => (
                      <Link
                        key={to}
                        to={to}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors duration-150"
                        style={{ color: 'var(--t-muted)' }}
                      >
                        <Icon size={16} style={{ color: 'var(--t-muted)', opacity: 0.7 }} />
                        <span className="flex-1" style={{ color: 'var(--t-text)' }}>{t(i18nKey, label)}</span>
                        {to === '/notifications' && unreadCount > 0 && (
                          <span
                            className="text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1"
                            style={{ background: 'var(--t-primary)' }}
                          >
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </Link>
                    ))}
                  </>
                )}
              </div>

              {/* Drawer footer */}
              <div
                className="border-t p-4 flex-shrink-0"
                style={{ borderColor: 'var(--t-sidebar-border)' }}
              >
                {isAuthenticated ? (
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-colors font-medium"
                  >
                    <LogOut size={16} /> {t('nav.signOut', 'Sign Out')}
                  </button>
                ) : (
                  <div className="flex gap-2.5">
                    <Link to="/login"    className="flex-1 btn-secondary text-center text-sm py-2.5">{t('auth.login', 'Login')}</Link>
                    <Link to="/register" className="flex-1 btn-primary text-center text-sm py-2.5">{t('auth.getStarted', 'Get Started')}</Link>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
