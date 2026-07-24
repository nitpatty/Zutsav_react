import React from 'react';
import Svg, { Rect, Line } from 'react-native-svg';
import { AUTH_COLORS } from './colors';

// Tall carved stone pillar, pinned to a screen edge, to frame the login
// content the way a temple archway would frame a courtyard view.
export default function TemplePillar({ side = 'left', height = 620, style }) {
  const width = 34;
  const flip = side === 'right';

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={[style, flip && { transform: [{ scaleX: -1 }] }]}
    >
      {/* capital */}
      <Rect x={2} y={0} width={width - 4} height={22} rx={2} fill={AUTH_COLORS.pillarStoneDark} />
      <Rect x={6} y={22} width={width - 12} height={10} fill={AUTH_COLORS.pillarStone} />

      {/* shaft */}
      <Rect x={9} y={32} width={width - 18} height={height - 96} fill={AUTH_COLORS.pillarStone} />
      {[0, 1, 2].map((i) => (
        <Line
          key={i}
          x1={12 + i * 5}
          y1={36}
          x2={12 + i * 5}
          y2={height - 68}
          stroke={AUTH_COLORS.pillarStoneDark}
          strokeWidth={1}
        />
      ))}

      {/* base */}
      <Rect x={6} y={height - 64} width={width - 12} height={10} fill={AUTH_COLORS.pillarStone} />
      <Rect x={2} y={height - 54} width={width - 4} height={22} rx={2} fill={AUTH_COLORS.pillarStoneDark} />
    </Svg>
  );
}
