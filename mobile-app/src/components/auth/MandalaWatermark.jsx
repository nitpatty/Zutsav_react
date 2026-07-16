import React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import { AUTH_COLORS } from './colors';

// Faint radial mandala behind the logo — concentric rings plus a sunburst
// of short ticks, all in one low-opacity tan tone.
export default function MandalaWatermark({ size = 260 }) {
  const cx = size / 2;
  const cy = size / 2;
  const ticks = Array.from({ length: 24 }, (_, i) => (360 / 24) * i);

  return (
    <Svg width={size} height={size} style={{ opacity: 0.16 }}>
      <Circle cx={cx} cy={cy} r={size * 0.48} fill="none" stroke={AUTH_COLORS.mandala} strokeWidth="1" />
      <Circle cx={cx} cy={cy} r={size * 0.38} fill="none" stroke={AUTH_COLORS.mandala} strokeWidth="1" strokeDasharray="4 6" />
      <Circle cx={cx} cy={cy} r={size * 0.28} fill="none" stroke={AUTH_COLORS.mandala} strokeWidth="1" />
      {ticks.map((angle, i) => (
        <Line
          key={i}
          x1={cx}
          y1={cy - size * 0.48}
          x2={cx}
          y2={cy - size * 0.44}
          stroke={AUTH_COLORS.mandala}
          strokeWidth="1.4"
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
    </Svg>
  );
}
