import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, StatusBar, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAuthStore } from '../../store/authStore';
import { AUTH_COLORS } from '../../components/auth/colors';
import ZutsavLockupLogo, { LOCKUP_ASPECT, RING_CLUSTER } from '../../components/auth/ZutsavLockupLogo';
import SunGlow from '../../components/auth/SunGlow';
import TempleSilhouette from '../../components/auth/TempleSilhouette';
import MistLayer from '../../components/auth/MistLayer';
import Lotus from '../../components/auth/Lotus';

const SPARKLES = [
  { top: '8%',  left: '14%', size: 3, opacity: 0.7 },
  { top: '13%', left: '82%', size: 2, opacity: 0.5 },
  { top: '20%', left: '22%', size: 2, opacity: 0.4 },
  { top: '6%',  left: '68%', size: 2, opacity: 0.55 },
  { top: '24%', left: '75%', size: 3, opacity: 0.35 },
  { top: '30%', left: '12%', size: 2, opacity: 0.3 },
  { top: '17%', left: '48%', size: 2, opacity: 0.4 },
];

// Small line-art lotus glyph for the divider — deliberately minimal (a few
// thin gold strokes), distinct from the filled corner Lotus silhouettes.
function LotusGlyph({ size = 16, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 21c-3-2-5-5-5-8 2 0 4 1.2 5 3 1-1.8 3-3 5-3 0 3-2 6-5 8Z"
        fill="none" stroke={color} strokeWidth={1.2}
      />
      <Path
        d="M12 16c-1.6-1.6-2.6-3.6-2.6-5.6C11 10.4 12 11.6 12 13c0-1.4 1-2.6 2.6-2.6 0 2-1 4-2.6 5.6Z"
        fill="none" stroke={color} strokeWidth={1.1}
      />
    </Svg>
  );
}

// Thin gold ring "portal" behind the logo, with a few bright accent points
// along its circumference — echoes the approved reference's glowing halo
// without a heavy asset.
function HaloRing({ size, color }) {
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const accents = [-40, 25, 150, 200];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={1} opacity={0.55} fill="none" />
      <Circle cx={cx} cy={cy} r={r - 6} stroke={color} strokeWidth={0.75} opacity={0.3} fill="none" />
      {accents.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <Circle
            key={i}
            cx={cx + r * Math.cos(rad)}
            cy={cy + r * Math.sin(rad)}
            r={i % 2 === 0 ? 2 : 1.4}
            fill={color}
            opacity={0.8}
          />
        );
      })}
    </Svg>
  );
}

// Slow indeterminate sweep — a soft highlight glides across a static gold
// track, rather than a percentage bar (this splash has no real progress
// signal to report, matching the original screen's behaviour).
function LoadingSweep({ width, color, trackColor }) {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const sweepWidth = width * 0.34;
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-sweepWidth, width] });

  return (
    <View style={[styles.loadingTrack, { width, backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          styles.loadingSweep,
          { width: sweepWidth, backgroundColor: color, transform: [{ translateX }] },
        ]}
      />
    </View>
  );
}

export default function SplashScreen({ navigation }) {
  const { ready, user } = useAuthStore();
  const { width, height } = useWindowDimensions();

  // Timing/navigation logic is unchanged from the original screen — only the
  // visuals below were redesigned.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (user) {
        // RootNavigator handles role-based routing
      } else {
        navigation.replace('Login');
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [ready, user]);

  const isTablet = width >= 768;
  // Sized so the wordmark reads at roughly the same physical size the
  // previous custom-drawn text did — the ring cluster comes along at
  // whatever proportion the official lockup asset gives it.
  const lockupWidth = Math.min(width * 0.68, isTablet ? 420 : 370);
  const lockupHeight = lockupWidth * LOCKUP_ASPECT;
  const haloSize = RING_CLUSTER.r * 2 * lockupWidth * 1.35;
  const haloLeft = RING_CLUSTER.cx * lockupWidth - haloSize / 2;
  const haloTop = RING_CLUSTER.cy * lockupHeight - haloSize / 2;
  const barWidth = Math.min(width * 0.42, 220);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.bgTop} />

      <LinearGradient
        colors={[AUTH_COLORS.bgTop, AUTH_COLORS.bgMid, AUTH_COLORS.bgBottom]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* light rays pouring down from above the frame */}
      <View pointerEvents="none" style={[styles.sunWrap, { top: -width * 0.55 }]}>
        <SunGlow size={width * 1.4} />
      </View>

      {/* corner lotus line ornaments */}
      <Lotus size={isTablet ? 110 : 84} style={[styles.lotusCorner, { top: -18, left: -18, transform: [{ rotate: '180deg' }] }]} />
      <Lotus size={isTablet ? 110 : 84} style={[styles.lotusCorner, { top: -18, right: -18, transform: [{ rotate: '180deg' }] }]} />
      <Lotus size={isTablet ? 130 : 96} style={[styles.lotusCorner, { bottom: -20, left: -20 }]} />
      <Lotus size={isTablet ? 130 : 96} style={[styles.lotusCorner, { bottom: -20, right: -20 }]} />

      {SPARKLES.map((s, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute', top: s.top, left: s.left,
            width: s.size, height: s.size, borderRadius: s.size / 2,
            backgroundColor: '#FFFFFF', opacity: s.opacity,
          }}
        />
      ))}

      {/* centred lockup */}
      <View style={styles.center}>
        <View style={{ width: lockupWidth, height: lockupHeight }}>
          <View style={{ position: 'absolute', left: haloLeft, top: haloTop }}>
            <HaloRing size={haloSize} color="#C7963F" />
          </View>
          <ZutsavLockupLogo width={lockupWidth} height={lockupHeight} />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <LotusGlyph size={16} color="#B8863B" />
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.tagline}>SACRED RITUALS. MODERN CONVENIENCE.</Text>
      </View>

      {/* distant temple, softly reflected, fading into mist */}
      <View style={[styles.templeWrap, { bottom: height * 0.14 }]} pointerEvents="none">
        <TempleSilhouette width={340} height={150} />
        <TempleSilhouette width={340} height={150} style={{ opacity: 0.28, transform: [{ scaleY: -1 }], marginTop: -4 }} />
        <MistLayer top={70} height={60} opacity={0.85} duration={22000} />
      </View>

      {/* loading indicator */}
      <View style={[styles.loadingWrap, { bottom: Math.max(height * 0.05, 28) }]}>
        <LoadingSweep width={barWidth} color="#D4AF37" trackColor="rgba(184,134,59,0.18)" />
        <Text style={styles.loadingLabel}>LOADING...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sunWrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  lotusCorner: { position: 'absolute', opacity: 0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  dividerLine: { width: 42, height: 1, backgroundColor: '#B8863B', opacity: 0.5 },
  tagline: {
    marginTop: 14, fontSize: 12.5, color: AUTH_COLORS.subtitle,
    letterSpacing: 2, fontWeight: '600', textAlign: 'center',
  },
  templeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  loadingWrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 10 },
  loadingTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  loadingSweep: { position: 'absolute', top: 0, bottom: 0, borderRadius: 1 },
  loadingLabel: { fontSize: 11, letterSpacing: 2, color: '#9C6B1F', fontWeight: '600' },
});
