import React from 'react';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { AUTH_COLORS } from './colors';

// Small hanging temple bell: string + dome + rim + clapper.
export default function Bell({ size = 34, stringLength = 26, style, gradId }) {
  const id = gradId || 'bellGrad';
  const h = size * 1.05 + stringLength;
  return (
    <Svg viewBox={`0 0 40 ${26 + stringLength}`} width={size} height={h} style={style}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#F3D386" />
          <Stop offset="100%" stopColor={AUTH_COLORS.bellGoldDark} />
        </LinearGradient>
      </Defs>

      <Line x1="20" y1="0" x2="20" y2={stringLength} stroke={AUTH_COLORS.bellString} strokeWidth="1.2" />

      <Circle cx="20" cy={stringLength + 2} r="2.4" fill="none" stroke={AUTH_COLORS.bellGoldDark} strokeWidth="1.4" />

      <Path
        d={`M10 ${stringLength + 10} Q10 ${stringLength - 2} 20 ${stringLength - 2} Q30 ${stringLength - 2} 30 ${stringLength + 10} Z`}
        fill={`url(#${id})`}
        stroke={AUTH_COLORS.bellGoldDark}
        strokeWidth="1"
      />
      <Path
        d={`M8 ${stringLength + 10} Q20 ${stringLength + 15} 32 ${stringLength + 10}`}
        fill="none"
        stroke={AUTH_COLORS.bellGoldDark}
        strokeWidth="1.4"
      />

      <Line x1="20" y1={stringLength + 12} x2="20" y2={stringLength + 19} stroke={AUTH_COLORS.bellGoldDark} strokeWidth="1.2" />
      <Circle cx="20" cy={stringLength + 21} r="2.2" fill={AUTH_COLORS.bellGoldDark} />
    </Svg>
  );
}
