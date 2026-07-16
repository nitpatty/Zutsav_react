import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AUTH_COLORS } from './colors';
import MandalaWatermark from './MandalaWatermark';
import Diya from './Diya';
import Bell from './Bell';

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

export default function BackgroundDecorations() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[AUTH_COLORS.bgTop, AUTH_COLORS.bgMid, AUTH_COLORS.bgBottom]}
        locations={[0, 0.55, 1]}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
});
