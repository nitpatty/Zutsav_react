import React, { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';

// A soft, wide translucent band that drifts sideways almost imperceptibly,
// standing in for low temple mist without any blur/photo asset.
export default function MistLayer({ top, height = 70, opacity = 1, duration = 26000, style }) {
  const tx = useSharedValue(0);

  useEffect(() => {
    tx.value = withRepeat(
      withSequence(
        withTiming(14, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(-14, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', top, left: -20, right: -20, height, opacity },
        style,
        driftStyle,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,251,244,0)', 'rgba(255,251,244,0.65)', 'rgba(255,251,244,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}
