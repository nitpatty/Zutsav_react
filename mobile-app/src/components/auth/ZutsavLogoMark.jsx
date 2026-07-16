import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { AUTH_COLORS } from './colors';

// Same six-ring recipe used by the web app's ZutsavLoader, redrawn in
// react-native-svg so the mark is pixel-identical across platforms.
function Rings({ size }) {
  const r = AUTH_COLORS.ring;
  return (
    <Svg viewBox="0 0 120 120" width={size} height={size}>
      <Circle cx="60" cy="22" r="14" fill="none" stroke={r.orange} strokeWidth="6.5" strokeLinecap="round" />
      <Circle cx="27" cy="41" r="14" fill="none" stroke={r.red} strokeWidth="6.5" strokeLinecap="round" />
      <Circle cx="93" cy="41" r="14" fill="none" stroke={r.gold} strokeWidth="6.5" strokeLinecap="round" />
      <Circle cx="27" cy="79" r="14" fill="none" stroke={r.purple} strokeWidth="6.5" strokeLinecap="round" />
      <Circle cx="93" cy="79" r="14" fill="none" stroke={r.green} strokeWidth="6.5" strokeLinecap="round" />
      <Circle cx="60" cy="98" r="14" fill="none" stroke={r.blue} strokeWidth="6.5" strokeLinecap="round" />
      <Circle cx="60" cy="60" r="14" fill={r.red} />
      <SvgText
        x="60" y="66"
        textAnchor="middle"
        fill="white"
        fontSize="18"
        fontWeight="bold"
        fontFamily={Platform.select({ ios: 'Helvetica', android: 'sans-serif', default: 'Arial' })}
      >
        Z
      </SvgText>
    </Svg>
  );
}

const WORDMARK = [
  { char: 'Z', color: AUTH_COLORS.ring.red },
  { char: 'U', color: AUTH_COLORS.ring.orange },
  { char: 'T', color: AUTH_COLORS.ring.gold },
  { char: 'S', color: AUTH_COLORS.ring.green },
  { char: 'A', color: AUTH_COLORS.ring.blue },
  { char: 'V', color: AUTH_COLORS.ring.purple },
];

export default function ZutsavLogoMark({ ringSize = 92, wordmarkSize = 30 }) {
  return (
    <View style={styles.wrap}>
      <Rings size={ringSize} />
      <Text style={[styles.wordmark, { fontSize: wordmarkSize }]}>
        {WORDMARK.map(({ char, color }, i) => (
          <Text key={i} style={{ color }}>{char}</Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  wordmark: {
    fontWeight: '800',
    letterSpacing: 6,
    marginTop: 6,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
});
