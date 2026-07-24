import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  RefreshControl, StatusBar, Image, Animated
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, daysUntil, bookingStatusColor, formatStatus, getInitials } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import NotificationBell from '../../components/NotificationBell';

// ── Static content config (no business logic — presentational only) ──
const QUICK_ACTIONS = [
  { key: 'pooja',    label: 'Book Pooja',  sub: 'Find & Book',      icon: 'flame',           tone: 'primary',   nav: 'PoojaList' },
  { key: 'panchang', label: 'Panchang',    sub: 'Check Tithi',      icon: 'calendar',        tone: 'info',      nav: 'Panchang' },
  { key: 'temples',  label: 'Temples',     sub: 'Explore Temples',  emoji: '🛕',             tone: 'success',   nav: 'Temples' },
  { key: 'shop',     label: 'Marketplace', sub: 'Samagri & Kits',   icon: 'storefront',      tone: 'warning',   nav: 'ShopTab' },
  { key: 'orders',   label: 'Orders',      sub: 'My Purchases',     icon: 'receipt',         tone: 'secondary', nav: 'ShopTab', params: { screen: 'Orders' } },
  { key: 'ai',       label: 'AI Guru',     sub: 'Ask Anything',     icon: 'sparkles',        tone: 'accent',    nav: 'AIAssistant' },
];

const FEST_GRADIENTS = [
  ['#7C2D12', '#EA580C'],
  ['#4C1D95', '#7C3AED'],
  ['#134E4A', '#0D9488'],
  ['#78350F', '#D97706'],
  ['#831843', '#DB2777'],
];

// ── Small reusable staggered fade/slide-in wrapper ─────────────
function FadeInView({ delay = 0, style, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 480, delay, useNativeDriver: true }).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: anim, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ── Subtle mandala line-art for the hero background ────────────
function MandalaPattern({ size = 240, opacity = 0.14 }) {
  const r = size / 2;
  const spokes = Array.from({ length: 12 });
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ opacity }}>
      <G stroke="#FFFFFF" fill="none" strokeWidth={1}>
        <Circle cx={r} cy={r} r={r - 4} />
        <Circle cx={r} cy={r} r={r * 0.72} />
        <Circle cx={r} cy={r} r={r * 0.46} />
        <Circle cx={r} cy={r} r={r * 0.2} />
        {spokes.map((_, i) => {
          const angle = (i * Math.PI * 2) / spokes.length;
          const x1 = r + Math.cos(angle) * (r * 0.2);
          const y1 = r + Math.sin(angle) * (r * 0.2);
          const x2 = r + Math.cos(angle) * (r - 4);
          const y2 = r + Math.sin(angle) * (r - 4);
          return <Path key={i} d={`M${x1},${y1} L${x2},${y2}`} />;
        })}
      </G>
    </Svg>
  );
}

const PARTICLES = [
  { top: 22, left: '18%', size: 4, o: 0.55 },
  { top: 64, left: '82%', size: 3, o: 0.4 },
  { top: 108, left: '46%', size: 5, o: 0.3 },
  { top: 40, left: '62%', size: 3, o: 0.45 },
  { top: 130, left: '12%', size: 3, o: 0.35 },
];

function Particles() {
  return PARTICLES.map((d, i) => (
    <View
      key={i}
      pointerEvents="none"
      style={{
        position: 'absolute', top: d.top, left: d.left,
        width: d.size, height: d.size, borderRadius: d.size / 2,
        backgroundColor: '#fff', opacity: d.o,
      }}
    />
  ));
}

// ── Quick action card with press micro-interaction ─────────────
function ActionCard({ item, C, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  const tone = C[item.tone] || C.primary;

  return (
    <Animated.View style={[styles.actionCardWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={onPress}
        android_ripple={{ color: tone + '22' }}
        style={[styles.actionCard, { backgroundColor: C.surface, borderColor: C.borderLight, shadowColor: C.shadow || '#000' }]}
      >
        <View style={[styles.actionIconWrap, { backgroundColor: tone + '17' }]}>
          {item.emoji ? (
            <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
          ) : (
            <Ionicons name={item.icon} size={22} color={tone} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.actionLabel, { color: C.text }]} numberOfLines={1}>{item.label}</Text>
          <Text style={[styles.actionSub, { color: C.textSecondary }]} numberOfLines={1}>{item.sub}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Section({ title, onSeeAll, children, C }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: C.text }]}>{title}</Text>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.seeAllBtn}>
            <Text style={[styles.seeAll, { color: C.primary }]}>See all</Text>
            <Ionicons name="chevron-forward" size={13} color={C.primary} />
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function FestivalCard({ f, index, C, onPress }) {
  const diff = f.date ? daysUntil(f.date) : null;
  const showCountdown = diff !== null && diff >= 0 && diff <= 14;
  const colors = FEST_GRADIENTS[index % FEST_GRADIENTS.length];

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.festCardWrap}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.festCard}>
        <View style={styles.festGlow} />
        <View style={styles.festIconWrap}>
          <Text style={{ fontSize: 26 }}>🪔</Text>
        </View>
        {showCountdown && (
          <View style={[styles.festCountdown, diff === 0 && { backgroundColor: '#DC2626' }]}>
            <Text style={styles.festCountdownText}>{diff === 0 ? 'Today!' : `${diff}d left`}</Text>
          </View>
        )}
        <View style={{ marginTop: 'auto' }}>
          <Text style={styles.festName} numberOfLines={2}>{f.name}</Text>
          <View style={styles.festDateChip}>
            <Ionicons name="calendar-outline" size={11} color="#fff" />
            <Text style={styles.festDateText}>
              {f.date ? new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function PoojaCard({ p, C, onPress }) {
  const [liked, setLiked] = useState(false);
  const price = p.salePrice || p.price || 0;
  const mrp = p.mrp && p.mrp > price ? p.mrp : null;

  return (
    <View style={[styles.poojaCard, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
      <Pressable onPress={onPress}>
        <View style={styles.poojaImgWrap}>
          {p.image ? (
            <Image source={{ uri: imageUrl(p.image) }} style={styles.poojaImg} />
          ) : (
            <View style={[styles.poojaImgPlaceholder, { backgroundColor: C.primary + '20' }]}>
              <Ionicons name="flame" size={30} color={C.primary} />
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={styles.poojaImgOverlay} pointerEvents="none" />
          {p.rating > 0 && (
            <View style={styles.ratingChip}>
              <Ionicons name="star" size={10} color="#FBBF24" />
              <Text style={styles.ratingText}>{p.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </Pressable>

      <TouchableOpacity
        onPress={() => setLiked((v) => !v)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.wishlistBtn}
      >
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? '#EF4444' : '#fff'} />
      </TouchableOpacity>

      <Pressable onPress={onPress} style={styles.poojaInfo}>
        <Text style={[styles.poojaName, { color: C.text }]} numberOfLines={1}>{p.name}</Text>
        {p.shortDesc ? (
          <Text style={[styles.poojaDesc, { color: C.textSecondary }]} numberOfLines={2}>{p.shortDesc}</Text>
        ) : null}
        <View style={styles.poojaFooterRow}>
          <View>
            {mrp && <Text style={[styles.poojaMrp, { color: C.textLight }]}>{formatCurrency(mrp)}</Text>}
            <Text style={[styles.poojaPrice, { color: C.primary }]}>{formatCurrency(price)}</Text>
          </View>
          <TouchableOpacity style={[styles.bookNowBtn, { backgroundColor: C.primary }]} onPress={onPress} activeOpacity={0.85}>
            <Text style={styles.bookNowText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </View>
  );
}

function BookingRow({ b, C, onPress }) {
  const status = b.status || 'pending_payment';
  const color = bookingStatusColor[status] || C.primary;

  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.bookingRow, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]} onPress={onPress}>
      <View style={[styles.bookingAccent, { backgroundColor: color }]} />
      {b.poojaId?.image ? (
        <Image source={{ uri: imageUrl(b.poojaId.image) }} style={styles.bookingImg} />
      ) : (
        <View style={[styles.bookingImgPlaceholder, { backgroundColor: C.primary + '18' }]}>
          <Ionicons name="flame" size={18} color={C.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.bookingPuja, { color: C.text }]} numberOfLines={1}>{b.poojaId?.name || 'Pooja'}</Text>
        <View style={styles.bookingDateRow}>
          <Ionicons name="calendar-outline" size={11} color={C.textSecondary} />
          <Text style={[styles.bookingDate, { color: C.textSecondary }]} numberOfLines={1}>
            {b.scheduledDate ? new Date(b.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
            {b.scheduledTime ? ` · ${b.scheduledTime}` : ''}
          </Text>
        </View>
      </View>
      <View style={[styles.statusPill, { backgroundColor: color + '1A' }]}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={[styles.statusText, { color }]} numberOfLines={1}>{formatStatus(status)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textLight} />
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [poojas, bookingsRes, festRes] = await Promise.all([
        api.get('/poojas?limit=6&isActive=true'),
        api.get('/bookings/my?limit=3&sort=-createdAt'),
        api.get('/festivals?limit=5&upcoming=true'),
      ]);
      setData({
        poojas:    poojas.data.data    || poojas.data.poojas    || [],
        bookings:  bookingsRes.data.data || bookingsRes.data.bookings || [],
        festivals: festRes.data.data   || festRes.data.festivals  || [],
      });
    } catch (err) {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load dashboard' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchDashboard(true); };

  if (loading) return <LoadingSpinner fullScreen text="Loading…" />;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = user?.name?.split(' ')[0] || 'Devotee';

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.primaryDark} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        {/* ── Hero ─────────────────────────────────────────────── */}
        <LinearGradient
          colors={[C.primary, C.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 14 }]}
        >
          <View style={styles.mandalaWrap} pointerEvents="none">
            <MandalaPattern />
          </View>
          <Particles />

          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroGreeting}>{greeting()},</Text>
              <Text style={styles.heroName} numberOfLines={1}>{firstName} 👋</Text>
              <Text style={styles.heroDate}>{todayStr}</Text>
            </View>
            <View style={styles.heroActions}>
              <View style={styles.heroIconCircle}>
                <NotificationBell color="#fff" notifScreen="Notifications" />
              </View>
              <TouchableOpacity
                style={[styles.heroIconCircle, styles.heroAvatar]}
                onPress={() => navigation.navigate('ProfileTab')}
                activeOpacity={0.85}
              >
                <Text style={styles.heroAvatarText}>{getInitials(user?.name || 'D') || '🙏'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        {/* ── Quick actions ────────────────────────────────────── */}
        <FadeInView delay={60} style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((item) => (
            <ActionCard
              key={item.key}
              item={item}
              C={C}
              onPress={() => navigation.navigate(item.nav, item.params)}
            />
          ))}
        </FadeInView>

        {/* ── Upcoming festivals ───────────────────────────────── */}
        {data?.festivals?.length > 0 && (
          <FadeInView delay={140}>
            <Section title="Upcoming Festivals" onSeeAll={() => navigation.navigate('Festivals')} C={C}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {data.festivals.map((f, i) => (
                  <FestivalCard key={f._id} f={f} index={i} C={C} onPress={() => navigation.navigate('FestivalDetail', { festival: f })} />
                ))}
              </ScrollView>
            </Section>
          </FadeInView>
        )}

        {/* ── Available poojas ─────────────────────────────────── */}
        {data?.poojas?.length > 0 && (
          <FadeInView delay={200}>
            <Section title="Available Poojas" onSeeAll={() => navigation.navigate('PoojaList')} C={C}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
                {data.poojas.map((p) => (
                  <PoojaCard key={p._id} p={p} C={C} onPress={() => navigation.navigate('BookingFlow', { poojaId: p._id, pooja: p })} />
                ))}
              </ScrollView>
            </Section>
          </FadeInView>
        )}

        {/* ── Recent bookings ──────────────────────────────────── */}
        {data?.bookings?.length > 0 && (
          <FadeInView delay={260}>
            <Section title="Recent Bookings" onSeeAll={() => navigation.navigate('BookingsTab')} C={C}>
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {data.bookings.map((b) => (
                  <BookingRow key={b._id} b={b} C={C} onPress={() => navigation.navigate('BookingDetail', { bookingId: b._id })} />
                ))}
              </View>
            </Section>
          </FadeInView>
        )}

        {/* ── Blog teaser ──────────────────────────────────────── */}
        <FadeInView delay={320} style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.blogTeaser, { backgroundColor: C.surface, borderColor: C.borderLight }]}
            onPress={() => navigation.navigate('Blogs')}
            activeOpacity={0.88}
          >
            <View style={[styles.blogIconWrap, { backgroundColor: C.accent + '18' }]}>
              <Ionicons name="newspaper-outline" size={20} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.blogTitle, { color: C.text }]}>Stories & Spiritual Wisdom</Text>
              <Text style={[styles.blogSub, { color: C.textSecondary }]}>Read our latest devotional articles</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={C.textLight} />
          </TouchableOpacity>
        </FadeInView>

        {/* ── Trust section ────────────────────────────────────── */}
        <FadeInView delay={380} style={{ paddingHorizontal: 16, marginTop: 18 }}>
          <LinearGradient colors={[C.primary, C.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.trustCard}>
            <View style={styles.trustGlow} pointerEvents="none" />
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>100% Trusted & Secure</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                {[
                  { icon: 'shield-checkmark', label: 'Verified Pandits' },
                  { icon: 'lock-closed',      label: 'Secure Payments' },
                  { icon: 'headset',          label: '24×7 Support' },
                ].map((f) => (
                  <View key={f.label} style={styles.trustFeatureRow}>
                    <View style={styles.trustIconWrap}>
                      <Ionicons name={f.icon} size={12} color="#fff" />
                    </View>
                    <Text style={styles.trustFeatureText}>{f.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={styles.trustEmoji}>🛕</Text>
          </LinearGradient>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // ── Hero ─────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: 20, paddingBottom: 26,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  mandalaWrap: { position: 'absolute', top: -60, right: -60 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  heroName:     { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 2 },
  heroDate:     { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6, fontWeight: '600' },
  heroActions:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIconCircle: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroAvatar:     { backgroundColor: 'rgba(255,255,255,0.28)' },
  heroAvatarText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },

  // ── Quick actions ────────────────────────────────────────────
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 12, paddingHorizontal: 16, marginTop: -18,
  },
  actionCardWrap: { minWidth: '46.5%', flexGrow: 1 },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 18, borderWidth: 1,
    minHeight: 76,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
  },
  actionIconWrap: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 13.5, fontWeight: '700' },
  actionSub:   { fontSize: 11, marginTop: 2 },

  // ── Sections ─────────────────────────────────────────────────
  section:       { marginTop: 22 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  sectionTitle:  { fontSize: 17, fontWeight: '800' },
  seeAllBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAll:        { fontSize: 13, fontWeight: '700' },

  // ── Festivals ────────────────────────────────────────────────
  festCardWrap: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 5,
    borderRadius: 20,
  },
  festCard: { width: 152, height: 174, borderRadius: 20, padding: 14, overflow: 'hidden' },
  festGlow: {
    position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  festIconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  festCountdown: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  festCountdownText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  festName: { color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 18 },
  festDateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  festDateText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  // ── Poojas ───────────────────────────────────────────────────
  poojaCard: {
    width: 200, borderRadius: 20, overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4,
  },
  poojaImgWrap: { width: '100%', height: 120 },
  poojaImg:            { width: '100%', height: '100%', resizeMode: 'cover' },
  poojaImgPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  poojaImgOverlay:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 46 },
  wishlistBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'center', alignItems: 'center',
  },
  ratingChip: {
    position: 'absolute', bottom: 8, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  ratingText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  poojaInfo: { padding: 12, gap: 4 },
  poojaName: { fontSize: 14.5, fontWeight: '700' },
  poojaDesc: { fontSize: 11.5, lineHeight: 16 },
  poojaFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
  poojaMrp:   { fontSize: 11, textDecorationLine: 'line-through' },
  poojaPrice: { fontSize: 16, fontWeight: '800' },
  bookNowBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  bookNowText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // ── Bookings ─────────────────────────────────────────────────
  bookingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingRight: 14, paddingLeft: 0,
    borderRadius: 16, overflow: 'hidden', position: 'relative',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  bookingAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
  bookingImg:          { width: 46, height: 46, borderRadius: 12, marginLeft: 10 },
  bookingImgPlaceholder: { width: 46, height: 46, borderRadius: 12, marginLeft: 10, justifyContent: 'center', alignItems: 'center' },
  bookingPuja:     { fontSize: 14, fontWeight: '700' },
  bookingDateRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  bookingDate:     { fontSize: 11.5 },
  statusPill:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, maxWidth: 118 },
  statusDot:       { width: 6, height: 6, borderRadius: 3 },
  statusText:      { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  // ── Blog teaser ──────────────────────────────────────────────
  blogTeaser: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 18, borderWidth: 1,
  },
  blogIconWrap: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  blogTitle: { fontSize: 13.5, fontWeight: '700' },
  blogSub:   { fontSize: 11.5, marginTop: 2 },

  // ── Trust card ───────────────────────────────────────────────
  trustCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 22, padding: 20, overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 5,
  },
  trustGlow: {
    position: 'absolute', bottom: -40, right: -20, width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  trustTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  trustFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustIconWrap: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  trustFeatureText: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: '600' },
  trustEmoji: { fontSize: 44, marginLeft: 8 },
});
