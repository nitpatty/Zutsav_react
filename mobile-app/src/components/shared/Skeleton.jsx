import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';

/**
 * Shimmering placeholder block for premium loading states — generalizes the
 * opacity-loop pattern already used in PanchangScreen so every list/detail
 * screen can show the same skeleton feel instead of a bare spinner.
 */
export function SkeletonBlock({ width = '100%', height = 14, radius = 8, style, C }) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: (C && C.borderLight) || '#E5E7EB', opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ C, style }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <SkeletonBlock width="55%" height={15} C={C} />
        <SkeletonBlock width="20%" height={15} C={C} />
      </View>
      <SkeletonBlock width="40%" height={12} C={C} />
      <SkeletonBlock width="65%" height={12} C={C} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18, padding: 16, gap: 10,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
});
