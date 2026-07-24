import React, { useEffect } from 'react';
import Svg, { Circle, Polygon, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { AUTH_COLORS } from './colors';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);
const RAY_COUNT = 10;

// Soft radiant sun with faint god-rays behind the temple skyline. The rays
// rotate extremely slowly — a barely-perceptible drift, not a spin.
export default function SunGlow({ size = 320, style }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 90000, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const cx = size / 2;
  const cy = size / 2;
  const rays = Array.from({ length: RAY_COUNT }, (_, i) => (360 / RAY_COUNT) * i);

  return (
    <Animated.View style={[{ width: size, height: size }, style, spinStyle]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="sunCoreGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={AUTH_COLORS.sunCore} stopOpacity="0.9" />
            <Stop offset="45%" stopColor={AUTH_COLORS.sunGlow} stopOpacity="0.35" />
            <Stop offset="100%" stopColor={AUTH_COLORS.sunGlow} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {rays.map((angle) => (
          <Polygon
            key={angle}
            points={`${cx - 4},${cy} ${cx + 4},${cy} ${cx},${0}`}
            fill={AUTH_COLORS.godRay}
            transform={`rotate(${angle} ${cx} ${cy})`}
          />
        ))}

        <Circle cx={cx} cy={cy} r={size * 0.5} fill="url(#sunCoreGrad)" />
      </Svg>
    </Animated.View>
  );
}
