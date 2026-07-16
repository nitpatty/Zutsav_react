import React from 'react';
import { Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { COLORS, RADIUS, SPACING, SHADOW, FONT, SIZES } from '../../theme/tokens';

const HEIGHT = { md: SIZES.buttonHeight, sm: SIZES.buttonHeightSm };

// Core button. Prefer the PrimaryButton / SecondaryButton / OutlinedButton
// presets below for consistent usage across the app.
export default function Button({
  title, onPress, icon, loading, disabled,
  variant = 'primary', size = 'md', fullWidth = true, style,
}) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => { scale.value = withTiming(0.97, { duration: 100 }); };
  const handlePressOut = () => { scale.value = withTiming(1, { duration: 120 }); };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.();
  };

  const height = HEIGHT[size] || HEIGHT.md;
  const content = loading
    ? <ActivityIndicator color={variant === 'primary' ? COLORS.onPrimary : COLORS.primary} />
    : (
      <>
        {icon}
        <Text style={[styles.text, textStyleFor(variant), size === 'sm' && { fontSize: FONT.size.caption }]}>{title}</Text>
      </>
    );

  return (
    <Animated.View style={[pressStyle, fullWidth && { width: '100%' }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          variant === 'primary' && styles.shadowWrap,
          pressed && { opacity: 0.95 },
          (disabled || loading) && { opacity: 0.6 },
          style,
        ]}
      >
        {variant === 'primary' ? (
          <LinearGradient
            colors={[COLORS.primaryLight, COLORS.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { height, borderRadius: RADIUS.pill }]}
          >
            {content}
          </LinearGradient>
        ) : (
          <Animated.View
            style={[
              styles.button,
              { height, borderRadius: RADIUS.pill },
              variant === 'secondary' && { backgroundColor: COLORS.primary + '1A' },
              variant === 'outlined' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.primary },
            ]}
          >
            {content}
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function textStyleFor(variant) {
  if (variant === 'primary') return { color: COLORS.onPrimary };
  return { color: COLORS.primaryDark };
}

export const PrimaryButton  = (props) => <Button {...props} variant="primary" />;
export const SecondaryButton = (props) => <Button {...props} variant="secondary" />;
export const OutlinedButton = (props) => <Button {...props} variant="outlined" />;

const styles = StyleSheet.create({
  shadowWrap: { borderRadius: RADIUS.pill, ...SHADOW.button },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  text: {
    fontSize: FONT.size.button,
    fontWeight: FONT.weight.bold,
    letterSpacing: 0.3,
  },
});
