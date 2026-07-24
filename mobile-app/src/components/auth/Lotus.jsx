import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { AUTH_COLORS } from './colors';

function petalPath(cx, baseY, len, halfWidth) {
  return `M${cx} ${baseY} `
    + `C${cx - halfWidth} ${baseY - len * 0.35} ${cx - halfWidth * 0.7} ${baseY - len * 0.85} ${cx} ${baseY - len} `
    + `C${cx + halfWidth * 0.7} ${baseY - len * 0.85} ${cx + halfWidth} ${baseY - len * 0.35} ${cx} ${baseY} Z`;
}

// Open lotus flower resting on the bottom edge of the screen, built from two
// layered rows of full, rounded petals (not spikes) fanning up from the base.
export default function Lotus({ size = 100, style }) {
  const cx = size / 2;
  const baseY = size;

  const backCount = 5;
  const backSpread = 130;
  const backLen = size * 0.46;
  const backAngles = Array.from({ length: backCount }, (_, i) => (
    -backSpread / 2 + (backSpread / (backCount - 1)) * i
  ));

  const frontCount = 4;
  const frontSpread = 78;
  const frontLen = size * 0.34;
  const frontAngles = Array.from({ length: frontCount }, (_, i) => (
    -frontSpread / 2 + (frontSpread / (frontCount - 1)) * i
  ));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style}>
      {backAngles.map((angle, i) => (
        <Path
          key={`b${i}`}
          d={petalPath(cx, baseY, backLen, backLen * 0.34)}
          fill={AUTH_COLORS.lotusPetalDark}
          transform={`rotate(${angle} ${cx} ${baseY})`}
        />
      ))}
      {frontAngles.map((angle, i) => (
        <Path
          key={`f${i}`}
          d={petalPath(cx, baseY, frontLen, frontLen * 0.4)}
          fill={AUTH_COLORS.lotusPetal}
          transform={`rotate(${angle} ${cx} ${baseY})`}
        />
      ))}
      <Circle cx={cx} cy={baseY - frontLen * 0.18} r={size * 0.07} fill={AUTH_COLORS.lotusCenter} />
    </Svg>
  );
}
