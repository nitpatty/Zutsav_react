import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { AUTH_COLORS } from './colors';

// Tiny distant bird — a single double-curve stroke, no fill.
export default function Bird({ size = 14, style }) {
  return (
    <Svg width={size} height={size * 0.5} viewBox="0 0 20 10" style={style}>
      <Path
        d="M0 8 Q5 0 10 8 Q15 0 20 8"
        fill="none"
        stroke={AUTH_COLORS.bird}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}
