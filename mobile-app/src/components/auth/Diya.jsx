import React, { useEffect } from 'react';
import Svg, { Path, Ellipse, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { AUTH_COLORS } from './colors';

// Small oil-lamp illustration: clay bowl with a pointed wick-spout and a
// soft flame glow, gently floating up and down.
export default function Diya({ size = 46, style, delay = 0 }) {
  const ty = useSharedValue(0);

  useEffect(() => {
    ty.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1800 + delay, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800 + delay, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size * 1.15 }, style, floatStyle]}>
      <Svg viewBox="0 0 60 66" width={size} height={size * 1.15}>
        <Defs>
          <RadialGradient id="flameGlow" cx="50%" cy="35%" r="60%">
            <Stop offset="0%" stopColor={AUTH_COLORS.flameOuter} stopOpacity="0.55" />
            <Stop offset="100%" stopColor={AUTH_COLORS.flameOuter} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Circle cx="30" cy="24" r="20" fill="url(#flameGlow)" />

        <Path
          d="M30 10 C 34 18, 36 24, 30 32 C 24 24, 26 18, 30 10 Z"
          fill={AUTH_COLORS.flameInner}
        />
        <Path
          d="M30 14 C 32 20, 33 24, 30 29 C 27 24, 28 20, 30 14 Z"
          fill={AUTH_COLORS.flameOuter}
        />

        <Path
          d="M4 40 Q 30 30 56 40 Q 50 54 30 56 Q 10 54 4 40 Z"
          fill={AUTH_COLORS.diyaBowl}
        />
        <Path
          d="M4 40 Q 30 46 56 40"
          fill="none"
          stroke={AUTH_COLORS.diyaBowlDark}
          strokeWidth="1.5"
        />
        <Ellipse cx="30" cy="40" rx="8" ry="2.6" fill={AUTH_COLORS.diyaBowlDark} opacity="0.6" />
      </Svg>
    </Animated.View>
  );
}
