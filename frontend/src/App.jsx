import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { CartProvider } from './context/CartContext';
import { AnalyticsProvider } from './context/AnalyticsContext';

import Navbar           from './components/layout/Navbar';
import Footer           from './components/layout/Footer';
import DashboardLayout  from './components/layout/DashboardLayout';

import Home             from './pages/Home';
import Login            from './pages/Login';
import ForgotPassword   from './pages/ForgotPassword';
import Register         from './pages/Register';
import PoojaCategories  from './pages/PoojaCategories';
import PoojaList        from './pages/PoojaList';
import BookingFlow      from './pages/BookingFlow';
import PanditRegistration from './pages/PanditRegistration';
import PanditDashboard  from './pages/PanditDashboard';
import PanditMyProfile  from './pages/PanditMyProfile';
import PanditMyPoojas   from './pages/PanditMyPoojas';
import PanditStatus     from './pages/PanditStatus';
import AdminDashboard   from './pages/AdminDashboard';
import Profile          from './pages/Profile';
import Festivals        from './pages/Festivals';
import Marketplace      from './pages/Marketplace';
import ProductDetail    from './pages/ProductDetail';
import BookingSuccess   from './pages/BookingSuccess';
import MyBookings       from './pages/MyBookings';
import TempleDirectory  from './pages/TempleDirectory';
import TempleDetailPage from './pages/TempleDetailPage';
import LivestreamsPage  from './pages/LivestreamsPage';
import AIAssistant      from './pages/AIAssistant';
import ZutsavAIWidget   from './components/ai/ZutsavAIWidget';
import PanchangPage     from './pages/PanchangPage';
import PaymentCallback  from './pages/PaymentCallback';
import Notifications    from './pages/Notifications';
import UserDashboard    from './pages/UserDashboard';
import MyOrders         from './pages/MyOrders';
import CartPage         from './pages/CartPage';
import InvoicePage      from './pages/InvoicePage';
import BlogHomePage     from './pages/BlogHomePage';
import BlogDetailPage   from './pages/BlogDetailPage';
import BlogEditor       from './pages/BlogEditor';
import MyBlogsPage      from './pages/MyBlogsPage';
import ReferralLanding  from './pages/ReferralLanding';
import Settings         from './pages/Settings';
import FamilyMembers    from './pages/FamilyMembers';

/* ── Auth guard ─────────────────────────────────────── */
const ProtectedRoute = ({ children, roles }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
};

/* ── Public layout (Navbar + content + Footer) ───────── */
const PublicLayout = ({ children }) => (
  <div className="min-h-screen flex flex-col" style={{ background: 'var(--t-bg)' }}>
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
    <ZutsavAIWidget />
  </div>
);

/* ── Coming soon stub ────────────────────────────────── */
const ComingSoon = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-4"
      style={{ background: 'var(--t-nav-active-bg)' }}
    >
      🪔
    </div>
    <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}>
      {title}
    </h1>
    <p className="text-sm" style={{ color: 'var(--t-muted)' }}>
      This feature is coming soon. Stay tuned!
    </p>
  </div>
);

/* ── All routes ──────────────────────────────────────── */
const AppRoutes = () => {
  const { user } = useAuth();
  return (
    <AnalyticsProvider>
    <ThemeProvider user={user}>
      <NotificationProvider user={user}>
        <Routes>
          {/* Public pages */}
          <Route path="/"          element={<PublicLayout><Home /></PublicLayout>} />
          <Route path="/login"     element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/register"  element={<Register />} />
          <Route path="/poojas"    element={<PublicLayout><PoojaCategories /></PublicLayout>} />
          <Route path="/poojas/:categorySlug" element={<PublicLayout><PoojaList /></PublicLayout>} />
          <Route path="/festivals"   element={<PublicLayout><Festivals /></PublicLayout>} />
          <Route path="/marketplace" element={<PublicLayout><Marketplace /></PublicLayout>} />
          <Route path="/marketplace/product/:slug" element={<PublicLayout><ProductDetail /></PublicLayout>} />
          <Route path="/temples"     element={<PublicLayout><TempleDirectory /></PublicLayout>} />
          <Route path="/temples/livestreams" element={<PublicLayout><ComingSoon title="Temple Livestreams" /></PublicLayout>} />
          {/* Legacy nav link — temple details now live on /temples/:id, reached from the directory */}
          <Route path="/temples/details" element={<Navigate to="/temples" replace />} />
          <Route path="/temples/location"    element={<PublicLayout><ComingSoon title="Temple Location" /></PublicLayout>} />
          <Route path="/temples/info"        element={<PublicLayout><ComingSoon title="Temple Information" /></PublicLayout>} />
          {/* Temple detail — placed AFTER the static /temples/* paths so :id never swallows them */}
          <Route path="/temples/:id" element={<PublicLayout><TempleDetailPage /></PublicLayout>} />
          <Route path="/panchang" element={<PublicLayout><PanchangPage /></PublicLayout>} />

          {/* Booking flow (uses public layout) — guest-accessible; login is only
              required at the "Pay" checkpoint inside BookingFlow itself
              (useCheckoutAuthGuard), not to view/configure the booking. */}
          <Route path="/book/:poojaSlug" element={
            <PublicLayout><BookingFlow /></PublicLayout>
          } />
          <Route path="/booking-success" element={
            <ProtectedRoute><PublicLayout><BookingSuccess /></PublicLayout></ProtectedRoute>
          } />
          <Route path="/payment-callback/:merchantTransactionId" element={
            <ProtectedRoute><PaymentCallback /></ProtectedRoute>
          } />
          <Route path="/invoice/view/:invoiceNumber" element={
            <ProtectedRoute><InvoicePage /></ProtectedRoute>
          } />
          <Route path="/invoice/:bookingId" element={
            <ProtectedRoute><InvoicePage /></ProtectedRoute>
          } />

          {/* Cart */}
          <Route path="/cart" element={
            <ProtectedRoute><PublicLayout><CartPage /></PublicLayout></ProtectedRoute>
          } />

          {/* User dashboard pages (sidebar layout) */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardLayout><UserDashboard /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-bookings" element={
            <ProtectedRoute>
              <DashboardLayout><MyBookings /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-orders" element={
            <ProtectedRoute>
              <DashboardLayout><MyOrders /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute roles={['user']}>
              <DashboardLayout><Profile /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/livestreams" element={
            <ProtectedRoute>
              <DashboardLayout><LivestreamsPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          {/* AI Guide is a fully public discovery feature — no auth guard,
              same PublicLayout/Navbar as every other discovery page. */}
          <Route path="/ai-assistant" element={
            <PublicLayout><AIAssistant /></PublicLayout>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute>
              <DashboardLayout><Notifications /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/family" element={
            <ProtectedRoute>
              <DashboardLayout><FamilyMembers /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/kundli" element={
            <ProtectedRoute>
              <DashboardLayout><ComingSoon title="Kundli" /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <DashboardLayout><Settings /></DashboardLayout>
            </ProtectedRoute>
          } />

          {/* Pandit routes */}
          <Route path="/pandit/register" element={<Navigate to="/register" replace />} />
          <Route path="/pandit/dashboard" element={
            <ProtectedRoute roles={['pandit', 'admin']}>
              <DashboardLayout><PanditDashboard /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/pandit/profile" element={
            <ProtectedRoute roles={['pandit']}>
              <DashboardLayout><PanditMyProfile /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/pandit/status" element={
            <ProtectedRoute roles={['pandit']}>
              <DashboardLayout><PanditStatus /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/pandit/requested-poojas" element={
            <ProtectedRoute roles={['pandit']}>
              <DashboardLayout><PanditMyPoojas /></DashboardLayout>
            </ProtectedRoute>
          } />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin', 'system_admin']}>
              <DashboardLayout><AdminDashboard /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/profile" element={
            <ProtectedRoute roles={['admin', 'system_admin']}>
              <DashboardLayout><Profile /></DashboardLayout>
            </ProtectedRoute>
          } />

          {/* Referral landing — public, no auth required */}
          <Route path="/r/:token"      element={<ReferralLanding />} />

          {/* Blog routes — public listing and detail, authenticated editor */}
          <Route path="/blog"          element={<PublicLayout><BlogHomePage /></PublicLayout>} />
          <Route path="/blog/:slug"    element={<PublicLayout><BlogDetailPage /></PublicLayout>} />
          <Route path="/blog/write"    element={
            <ProtectedRoute><BlogEditor /></ProtectedRoute>
          } />
          <Route path="/blog/edit/:id" element={
            <ProtectedRoute><BlogEditor /></ProtectedRoute>
          } />
          <Route path="/my-blogs"      element={
            <ProtectedRoute><MyBlogsPage /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

      </NotificationProvider>
    </ThemeProvider>
    </AnalyticsProvider>
  );
};

// Session-level cache for translated content (see hooks/useTranslatedBlog.js).
// staleTime keeps a (slug, lang) pair served from memory on repeated language
// switches within the session, without a network round-trip.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
        <CartProvider>
        <SettingsProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--t-card)',
              color: 'var(--t-text)',
              border: '1px solid var(--t-border)',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: '500',
            },
          }}
        />
        <AppRoutes />
        </SettingsProvider>
        </CartProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
  );
}
