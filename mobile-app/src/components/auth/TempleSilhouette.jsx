import React from 'react';
import Svg, { Rect, Circle, Path, Polygon } from 'react-native-svg';
import { AUTH_COLORS } from './colors';

// Stylised tiered gopuram silhouette (a central tower flanked by two smaller
// ones over a low base wall with a glowing doorway). Built from stacked,
// shrinking tiers rather than a photographic asset, so it reads as an
// artistic temple skyline rather than a stock photo.
function Tower({ cx, baseY, tierCount, baseWidth, tierHeight, color }) {
  const tiers = Array.from({ length: tierCount }, (_, i) => {
    const shrink = i * (baseWidth / (tierCount + 1.4));
    const width = Math.max(baseWidth - shrink, baseWidth * 0.14);
    return {
      x: cx - width / 2,
      y: baseY - (i + 1) * tierHeight,
      width,
      height: tierHeight,
    };
  });
  const topTier = tiers[tiers.length - 1];

  return (
    <>
      {tiers.map((t, i) => (
        <Rect
          key={i}
          x={t.x}
          y={t.y}
          width={t.width}
          height={t.height}
          rx={2}
          fill={color}
        />
      ))}
      <Polygon
        points={`${cx - 6},${topTier.y} ${cx + 6},${topTier.y} ${cx},${topTier.y - 14}`}
        fill={color}
      />
      <Circle cx={cx} cy={topTier.y - 18} r={3.2} fill={color} />
    </>
  );
}

export default function TempleSilhouette({ width = 400, height = 190, style }) {
  const baseY = height - 18;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      {/* low base wall connecting the towers */}
      <Rect x={width * 0.14} y={baseY - 14} width={width * 0.72} height={14} fill={AUTH_COLORS.templeFar} />

      {/* glowing doorway at the centre base */}
      <Path
        d={`M${width / 2 - 12} ${baseY} L${width / 2 - 12} ${baseY - 22} Q${width / 2} ${baseY - 34} ${width / 2 + 12} ${baseY - 22} L${width / 2 + 12} ${baseY}`}
        fill={AUTH_COLORS.templeGlow}
      />

      <Tower cx={width * 0.28} baseY={baseY} tierCount={4} baseWidth={54} tierHeight={13} color={AUTH_COLORS.templeFar} />
      <Tower cx={width * 0.72} baseY={baseY} tierCount={4} baseWidth={54} tierHeight={13} color={AUTH_COLORS.templeFar} />
      <Tower cx={width / 2} baseY={baseY} tierCount={7} baseWidth={92} tierHeight={15} color={AUTH_COLORS.templeNear} />
    </Svg>
  );
}
