import React from 'react';
import { Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';

// Official Zutsav lockup — six-ring mark stacked above the "ZUTSAV" wordmark
// — rendered verbatim from the approved brand asset
// (zutsav_rings_lockup_stacked.svg), so ring layout, per-letter colours and
// their relative spacing/proportions all match exactly. The only change from
// the source file is the wordmark's font-family: the original references a
// web font via @import (not loadable in React Native) as a multi-value CSS
// stack, which RN's font resolver warns on (single real font name only) —
// swapped for a per-platform equivalent serif, same as elsewhere in the app.
const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const LOCKUP_XML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 170">
  <g transform="translate(75,6) scale(0.9)">
    <g fill="none" stroke-width="3.2">
      <circle cx="50" cy="22" r="12" stroke="#F26419"/>
      <circle cx="74.25" cy="36" r="12" stroke="#F9A825"/>
      <circle cx="74.25" cy="64" r="12" stroke="#1E9E54"/>
      <circle cx="50" cy="78" r="12" stroke="#1565C0"/>
      <circle cx="25.75" cy="64" r="12" stroke="#7B1FA2"/>
      <circle cx="25.75" cy="36" r="12" stroke="#D32027"/>
    </g>
    <circle cx="50" cy="50" r="12.5" fill="#D32027"/>
    <g transform="translate(42.647 57.250) scale(0.01081 -0.01081)">
      <path d="M98 114 840 1235H600Q373 1235 280 1215L249 1004H160V1341H1196V1235L449 104H729Q843 104 953.5 115.0Q1064 126 1113 137L1172 393H1262L1235 0H98Z" fill="#FFFFFF"/>
    </g>
  </g>
  <text y="150" text-anchor="middle" font-family="${SERIF_FONT}" font-weight="700" font-size="40">
    <tspan x="35"  fill="#F26419">Z</tspan><tspan x="73"  fill="#F9A825">U</tspan><tspan x="111" fill="#1E9E54">T</tspan><tspan x="149" fill="#1565C0">S</tspan><tspan x="187" fill="#7B1FA2">A</tspan><tspan x="222" fill="#D32027">V</tspan>
  </text>
</svg>
`;

// Native aspect ratio of the source asset (250x170) — callers should size by
// width only and derive height from this so the lockup never distorts.
export const LOCKUP_ASPECT = 170 / 250;

// Fraction of the lockup's own box occupied by the ring cluster (derived
// from the source file's coordinates: outer translate(75,6) scale(0.9)
// maps the inner ring cluster's centre/radius into the 250x170 box) — lets a
// caller draw a halo ring that frames just the rings, not the wordmark below.
export const RING_CLUSTER = { cx: 120 / 250, cy: 51 / 170, r: 36 / 250 };

export default function ZutsavLockupLogo({ width = 250, height }) {
  const h = height ?? width * LOCKUP_ASPECT;
  return <SvgXml xml={LOCKUP_XML} width={width} height={h} />;
}
