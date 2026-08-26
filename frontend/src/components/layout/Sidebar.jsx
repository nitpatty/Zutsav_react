import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, CalendarDays, ShoppingBag, Flame, Store,
  Landmark, Calendar, Sun, Bot, Bell, User, Settings, LogOut,
  ChevronLeft, ChevronRight, Search, Star, Users, BarChart3,
  BookOpen, Menu, X, Shield, CreditCard, MessageSquare,
  Package, MapPin, Tv, Gift, ClipboardList,
  GraduationCap, Briefcase, IndianRupee, FileText, PenTool, Receipt, Zap, Database, Globe, Image,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeSwatchRow } from '../ui/ThemeSwitcher';
import { useNotifications } from '../../context/NotificationContext';
import { useSettings } from '../../context/SettingsContext';
import { useTranslation } from 'react-i18next';

/* ── Nav item configs per role ─────────────────────────── */
const USER_NAV = [
  { icon: LayoutDashboard, labelKey: 'sidebar.items.dashboard',      path: '/dashboard' },
  { icon: CalendarDays,    labelKey: 'sidebar.items.myBookings',     path: '/my-bookings' },
  { icon: ShoppingBag,     labelKey: 'sidebar.items.myOrders',       path: '/my-orders' },
  { icon: Users,           labelKey: 'sidebar.items.familyMembers',  path: '/family' },
  { icon: Flame,           labelKey: 'sidebar.items.browsePoojas',   path: '/poojas' },
  { icon: Store,           labelKey: 'sidebar.items.marketplace',    path: '/marketplace' },
  { icon: Landmark,        labelKey: 'sidebar.items.temples',        path: '/temples' },
  { icon: Tv,              labelKey: 'sidebar.items.livestreams',    path: '/livestreams' },
  { icon: Calendar,        labelKey: 'sidebar.items.festivals',      path: '/festivals' },
  { icon: Sun,             labelKey: 'sidebar.items.panchang',       path: '/panchang' },
  { icon: FileText,        labelKey: 'sidebar.items.blog',           path: '/blog' },
  { icon: PenTool,         labelKey: 'sidebar.items.writeBlog',      path: '/blog/write' },
  { icon: Bot,             labelKey: 'sidebar.items.aiAssistant',    path: '/ai-assistant' },
  { icon: Bell,            labelKey: 'sidebar.items.notifications',  path: '/notifications', badge: true },
];

const PANDIT_NAV = [
  { icon: LayoutDashboard, labelKey: 'sidebar.items.dashboard',       path: '/pandit/dashboard' },
  { icon: User,            labelKey: 'sidebar.items.myProfile',       path: '/pandit/profile' },
  { icon: ClipboardList,   labelKey: 'sidebar.items.requestedPoojas', path: '/pandit/requested-poojas' },
  { icon: BookOpen,        labelKey: 'sidebar.items.myBookings',      path: '/pandit/dashboard?tab=bookings' },
  { icon: Calendar,        labelKey: 'sidebar.items.availability',    path: '/pandit/dashboard?tab=availability' },
  { icon: CalendarDays,    labelKey: 'sidebar.items.festivalCalendar', path: '/pandit/dashboard?tab=festivals' },
  { icon: BarChart3,       labelKey: 'sidebar.items.earnings',        path: '/pandit/dashboard?tab=earnings' },
  { icon: Gift,            labelKey: 'sidebar.items.referrals',       path: '/pandit/dashboard?tab=referrals' },
  { icon: FileText,        labelKey: 'sidebar.items.browseBlog',      path: '/blog' },
  { icon: PenTool,         labelKey: 'sidebar.items.writeBlog',       path: '/blog/write' },
  { icon: Bell,            labelKey: 'sidebar.items.notifications',   path: '/notifications', badge: true },
  { icon: Settings,        labelKey: 'sidebar.items.settings',        path: '/settings' },
];

const ADMIN_NAV = [
  { icon: LayoutDashboard, labelKey: 'sidebar.items.dashboard',           path: '/admin' },
  { icon: BookOpen,        labelKey: 'sidebar.items.bookings',            path: '/admin?tab=bookings' },
  { icon: Users,           labelKey: 'sidebar.items.panditManagement',    path: '/admin?tab=pandits' },
  { icon: Star,            labelKey: 'sidebar.items.panditPoojas',        path: '/admin?tab=pandit-poojas' },
  { icon: User,            labelKey: 'sidebar.items.userManagement',      path: '/admin?tab=users' },
  { icon: ShoppingBag,     labelKey: 'sidebar.items.poojaCatalogue',      path: '/admin?tab=poojas' },
  { icon: Package,         labelKey: 'sidebar.items.marketplace',         path: '/admin?tab=marketplace' },
  { icon: ClipboardList,   labelKey: 'sidebar.items.orders',              path: '/admin?tab=orders' },
  { icon: CalendarDays,    labelKey: 'sidebar.items.festivals',           path: '/admin?tab=festivals' },
  { icon: GraduationCap,   labelKey: 'sidebar.items.educationMasters',    path: '/admin?tab=education-masters' },
  { icon: Briefcase,       labelKey: 'sidebar.items.specializations',     path: '/admin?tab=specialization-masters' },
  { icon: MapPin,          labelKey: 'sidebar.items.templeDirectory',     path: '/admin?tab=temples' },
  { icon: Image,           labelKey: 'sidebar.items.homepageCuration',    path: '/admin?tab=homepage-curation' },
  { icon: Tv,              labelKey: 'sidebar.items.livestreams',         path: '/admin?tab=livestreams' },
  { icon: IndianRupee,     labelKey: 'sidebar.items.payoutManagement',    path: '/admin?tab=payouts' },
  { icon: Gift,            labelKey: 'sidebar.items.referralStats',       path: '/admin?tab=referrals' },
  { icon: Zap,             labelKey: 'sidebar.items.notificationEngine',  path: '/admin?tab=notifications' },
  { icon: FileText,        labelKey: 'sidebar.items.blogManagement',      path: '/admin?tab=blog-management' },
  { icon: Receipt,         labelKey: 'sidebar.items.invoices',            path: '/admin?tab=invoices' },
  { icon: Database,        labelKey: 'sidebar.items.logManagement',       path: '/admin?tab=log-management' },
  { icon: Settings,        labelKey: 'sidebar.items.systemSettings',      path: '/admin?tab=system-settings' },
  { icon: Globe,           labelKey: 'sidebar.items.systemConfiguration', path: '/admin?tab=system-config' },
  { icon: Bell,            labelKey: 'sidebar.items.notifications',       path: '/notifications', badge: true },
  { icon: User,            labelKey: 'sidebar.items.myProfile',           path: '/admin/profile' },
];

// System Admin sees everything an Admin sees, plus the Admin Management
// module — inserted before the trailing "My Profile" item.
const SYSTEM_ADMIN_NAV = [
  ...ADMIN_NAV.slice(0, -1),
  { icon: Shield, labelKey: 'sidebar.items.adminManagement', path: '/admin?tab=admin-management' },
  ADMIN_NAV[ADMIN_NAV.length - 1],
];

function getNavItems(role) {
  if (role === 'system_admin') return SYSTEM_ADMIN_NAV;
  if (role === 'admin')        return ADMIN_NAV;
  if (role === 'pandit')       return PANDIT_NAV;
  return USER_NAV;
}

function getRoleLabelKey(role) {
  if (role === 'system_admin') return 'sidebar.roleSystemAdmin';
  if (role === 'admin')        return 'sidebar.roleAdmin';
  if (role === 'pandit')       return 'sidebar.rolePandit';
  return 'sidebar.roleDevotee';
}

/* ── Determine if a nav item is active, supports ?tab= paths ── */
function computeIsActive(item, location) {
  const [basePath, queryStr] = item.path.split('?');
  const itemTab = queryStr ? new URLSearchParams(queryStr).get('tab') : null;
  const currentTab = new URLSearchParams(location.search).get('tab');

  if (basePath === '/dashboard') return location.pathname === '/dashboard';

  if (basePath === '/admin' || basePath === '/pandit/dashboard') {
    if (location.pathname !== basePath) return false;
    if (!itemTab) {
      // Dashboard item (no tab) — active when no tab or tab=dashboard/overview
      return !currentTab || currentTab === 'dashboard' || currentTab === 'overview';
    }
    return currentTab === itemTab;
  }

  if (basePath === '/') return false;
  return location.pathname.startsWith(basePath);
}

/* ── Single nav item ───────────────────────────────────── */
function NavItem({ item, collapsed, isActive, onClick }) {
  const { unreadCount } = useNotifications();
  const { t } = useTranslation();
  const badgeCount = item.badge ? unreadCount : 0;

  return (
    <motion.div
      whileHover={{ x: collapsed ? 0 : 3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <Link
        to={item.path}
        onClick={onClick}
        className={`nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
        title={collapsed ? t(item.labelKey) : undefined}
      >
        {/* Active left bar */}
        {isActive && (
          <motion.div
            layoutId="nav-active-bar"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full"
            style={{ background: 'var(--t-primary)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}

        {/* Icon */}
        <div className="relative flex-shrink-0">
          <item.icon
            size={18}
            className={`transition-colors duration-200 ${isActive ? 'text-[var(--t-primary)]' : 'text-[var(--t-muted)]'}`}
          />
          {badgeCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
              style={{ background: 'var(--t-primary)' }}
            >
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </div>

        {/* Label */}
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="text-sm font-medium truncate"
            >
              {t(item.labelKey)}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </motion.div>
  );
}

/* ── Main Sidebar ──────────────────────────────────────── */
export default function Sidebar({ mobileOpen, onMobileClose }) {
  const { user, logout } = useAuth();
  const { currentTheme } = useTheme();
  const { logoUrl, platformName } = useSettings();
  const { t } = useTranslation();
  const location  = useLocation();
  const navigate  = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch]       = useState('');
  const searchRef = useRef(null);

  const navItems   = getNavItems(user?.role);
  const roleLabel  = t(getRoleLabelKey(user?.role));
  const initials   = user?.name ? user.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() : 'Z';

  const filtered = search
    ? navItems.filter(i => t(i.labelKey).toLowerCase().includes(search.toLowerCase()))
    : navItems;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  /* Collapsed sidebar doesn't show search */
  useEffect(() => {
    if (collapsed) setSearch('');
  }, [collapsed]);

  const sidebarContent = (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--t-sidebar)' }}
    >
      {/* ── Header ──────────────────────────────────────── */}
      <div
        className="flex items-center px-4 h-16 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--t-sidebar-border)' }}
      >
        <Link to="/" className={`flex items-center min-w-0 flex-1 ${collapsed ? 'justify-center' : ''}`}>
          <AnimatePresence>
            {logoUrl ? (
              collapsed ? (
                <motion.img
                  key="collapsed-logo"
                  src={logoUrl}
                  alt={platformName}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-7 w-7 object-contain flex-shrink-0"
                />
              ) : (
                <motion.img
                  key="expanded-logo"
                  src={logoUrl}
                  alt={platformName}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="h-8 w-auto object-contain"
                />
              )
            ) : (
              <motion.span
                key="text-logo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`font-serif font-bold text-[var(--t-primary)] ${collapsed ? 'text-xl' : 'text-lg'}`}
              >
                {collapsed ? platformName?.[0] || 'Z' : (platformName || 'Zutsav')}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex w-6 h-6 rounded-lg items-center justify-center transition-colors flex-shrink-0"
          style={{ color: 'var(--t-muted)' }}
        >
          <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.25 }}>
            <ChevronLeft size={14} />
          </motion.div>
        </button>
      </div>

      {/* ── Search ──────────────────────────────────────── */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pt-3"
          >
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--t-muted)' }}
              />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('sidebar.searchNavigation')}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border transition-all duration-200 focus:outline-none"
                style={{
                  background: 'var(--t-input-bg)',
                  color: 'var(--t-text)',
                  borderColor: 'var(--t-border)',
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nav items ───────────────────────────────────── */}
      <nav className={`flex-1 overflow-y-auto py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        <div className="space-y-0.5">
          {!collapsed && (
            <p
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-2"
              style={{ color: 'var(--t-muted)', opacity: 0.6 }}
            >
              {t('sidebar.menu')}
            </p>
          )}
          {filtered.map(item => (
            <NavItem
              key={item.path + item.labelKey}
              item={item}
              collapsed={collapsed}
              isActive={computeIsActive(item, location)}
              onClick={onMobileClose}
            />
          ))}
        </div>
      </nav>

      {/* ── Bottom section ──────────────────────────────── */}
      <div
        className="flex-shrink-0 border-t p-3 space-y-3"
        style={{ borderColor: 'var(--t-sidebar-border)' }}
      >
        {/* Theme switcher */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-1"
            >
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: 'var(--t-muted)', opacity: 0.6 }}
              >
                {t('sidebar.theme')}
              </p>
              <ThemeSwatchRow />
            </motion.div>
          )}
        </AnimatePresence>

        {/* User profile */}
        <div
          className={`flex items-center gap-3 p-2 rounded-xl transition-colors duration-200 ${collapsed ? 'justify-center' : ''}`}
          style={{ background: 'var(--t-nav-active-bg)' }}
        >
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: 'var(--t-primary)' }}
          >
            {initials}
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="min-w-0 flex-1"
              >
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--t-text)' }}>
                  {user?.name || t('sidebar.user')}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--t-muted)' }}>
                  {roleLabel}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className={`flex gap-1 ${collapsed ? 'flex-col items-center' : ''}`}>
          {user?.role === 'user' && (
            <Link
              to="/profile"
              onClick={onMobileClose}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 flex-1 justify-center"
              style={{ color: 'var(--t-muted)' }}
              title={t('sidebar.profile')}
            >
              <User size={14} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {t('sidebar.profile')}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 flex-1 justify-center"
            style={{ color: 'var(--t-muted)' }}
            title={t('sidebar.logout')}
          >
            <LogOut size={14} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {t('sidebar.logout')}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 280 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="hidden lg:flex flex-col flex-shrink-0 h-screen sticky top-0 overflow-hidden shadow-sidebar"
        style={{
          background: 'var(--t-sidebar)',
          borderRight: '1px solid var(--t-sidebar-border)',
        }}
      >
        {sidebarContent}
      </motion.aside>

      {/* ── Mobile drawer ───────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: 'var(--t-overlay)' }}
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-72 lg:hidden overflow-hidden"
              style={{
                background: 'var(--t-sidebar)',
                borderRight: '1px solid var(--t-sidebar-border)',
              }}
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
