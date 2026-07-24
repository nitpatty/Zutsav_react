import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AUTH_COLORS } from './colors';
import MandalaWatermark from './MandalaWatermark';
import Diya from './Diya';
import Bell from './Bell';
import SunGlow from './SunGlow';
import TempleSilhouette from './TempleSilhouette';
import TemplePillar from './TemplePillar';
import MistLayer from './MistLayer';
import Lotus from './Lotus';
import Bird from './Bird';

const { height: SCREEN_H } = Dimensions.get('window');

const SPARKLES = [
  { top: '6%',  left: '12%', size: 3, opacity: 0.8 },
  { top: '10%', left: '28%', size: 2, opacity: 0.5 },
  { top: '4%',  left: '45%', size: 2, opacity: 0.6 },
  { top: '15%', left: '8%',  size: 2, opacity: 0.4 },
  { top: '18%', left: '35%', size: 3, opacity: 0.5 },
  { top: '8%',  left: '62%', size: 2, opacity: 0.45 },
  { top: '22%', left: '18%', size: 2, opacity: 0.35 },
  { top: '12%', left: '52%', size: 2, opacity: 0.4 },
  { top: '26%', left: '58%', size: 2, opacity: 0.3 },
  { top: '5%',  left: '75%', size: 2, opacity: 0.4 },
];

const BIRDS = [
  { top: '5%',  left: '20%', size: 12, opacity: 0.35 },
  { top: '8%',  left: '30%', size: 9,  opacity: 0.3 },
  { top: '4%',  left: '68%', size: 11, opacity: 0.3 },
  { top: '9%',  left: '78%', size: 8,  opacity: 0.25 },
];

// Full spiritual sunrise scene: warm sky, a distant temple skyline haloed by
// soft god-rays, drifting mist, framing stone pillars, floating diyas,
// hanging bells and lotuses at the base — all illustrated (not a stock
// photo) so it stays crisp at any density and matches the app's existing
// hand-drawn auth artwork (Diya, Bell, MandalaWatermark).
export default function BackgroundDecorations() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* sunrise sky */}
      <LinearGradient
        colors={[AUTH_COLORS.skyTop, AUTH_COLORS.skyUpper, AUTH_COLORS.skyHorizon, AUTH_COLORS.skyLow]}
        locations={[0, 0.32, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* distant birds */}
      {BIRDS.map((b, i) => (
        <Bird key={i} size={b.size} style={{ position: 'absolute', top: b.top, left: b.left, opacity: b.opacity }} />
      ))}

      {/* halo of god-rays behind the temple/logo */}
      <View style={styles.sunWrap}>
        <SunGlow size={320} />
      </View>

      {/* temple skyline */}
      <TempleSilhouette style={styles.temple} height={190} />

      {/* framing stone pillars */}
      <TemplePillar side="left" height={SCREEN_H} style={styles.pillarLeft} />
      <TemplePillar side="right" height={SCREEN_H} style={styles.pillarRight} />

      {/* drifting mist, softening the temple base into the card area */}
      <MistLayer top="24%" height={90} opacity={0.9} duration={24000} />
      <MistLayer top="34%" height={70} opacity={0.6} duration={30000} />

      {/* soft clearing so heading text + card stay crisp against the scene */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,253,247,0)', 'rgba(255,253,247,0.55)', 'rgba(255,253,247,0.82)', 'rgba(255,253,247,0.35)']}
        locations={[0, 0.22, 0.5, 0.78]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.mandalaWrap}>
        <MandalaWatermark size={280} />
      </View>

      {SPARKLES.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: '#FFFFFF',
            opacity: s.opacity,
          }}
        />
      ))}

      <Diya size={40} style={styles.diyaLeft} delay={0} />
      <Diya size={34} style={styles.diyaRight} delay={400} />

      <View style={styles.bellsWrap}>
        <Bell size={26} stringLength={16} style={styles.bellBack} gradId="bellGradA" />
        <Bell size={32} stringLength={34} style={styles.bellFront} gradId="bellGradB" />
      </View>

      {/* lotuses resting at the base of the scene */}
      <Lotus size={110} style={styles.lotusLeft} />
      <Lotus size={90} style={styles.lotusRight} />
    </View>
  );
}

const styles = StyleSheet.create({
  sunWrap: {
    position: 'absolute',
    top: '2%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  temple: {
    position: 'absolute',
    top: '6%',
    left: 0,
    right: 0,
    opacity: 0.9,
  },
  pillarLeft: { position: 'absolute', top: 0, left: -4 },
  pillarRight: { position: 'absolute', top: 0, right: -4 },
  mandalaWrap: {
    position: 'absolute',
    top: '10%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diyaLeft: { position: 'absolute', top: '20%', left: '6%' },
  diyaRight: { position: 'absolute', top: '32%', right: '10%' },
  bellsWrap: {
    position: 'absolute',
    top: 0,
    right: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  bellBack: { marginTop: 0 },
  bellFront: { marginTop: 10 },
  lotusLeft: { position: 'absolute', bottom: -6, left: -14 },
  lotusRight: { position: 'absolute', bottom: -10, right: -18 },
});
