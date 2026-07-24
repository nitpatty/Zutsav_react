import React, { useRef } from 'react';
import { Text, Pressable, Animated, ActivityIndicator, StyleSheet } from 'react-native';

/**
 * Shared Devotee button system — mirrors the Dashboard's press micro-interaction
 * (spring scale) and shadow/radius language. Variants: primary | outline | danger.
 * All colors come from the caller's theme `C` (useThemeStore), matching every
 * other screen's convention rather than hardcoding a palette.
 */
export default function AppButton({
  title, onPress, icon, loading, disabled,
  variant = 'primary', size = 'md', fullWidth = false, C, style, textStyle, tone: toneOverride,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  const isDisabled = disabled || loading;
  const tone = toneOverride || (variant === 'danger' ? (C.error || '#DC2626') : C.primary);

  const variantStyle = {
    primary: { backgroundColor: tone, borderWidth: 0 },
    danger:  { backgroundColor: tone, borderWidth: 0 },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: tone },
  }[variant];

  const textColor = variant === 'outline' ? tone : '#fff';

  return (
    <Animated.View style={[fullWidth && { width: '100%' }, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={onPress}
        disabled={isDisabled}
        android_ripple={{ color: variant === 'outline' ? tone + '22' : 'rgba(255,255,255,0.25)' }}
        style={[
          styles.base,
          size === 'sm' ? styles.sm : styles.md,
          variantStyle,
          isDisabled && { opacity: 0.55 },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <>
            {icon}
            {title ? <Text style={[styles.text, { color: textColor }, size === 'sm' && styles.textSm, textStyle]}>{title}</Text> : null}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

export const PrimaryButton = (props) => <AppButton {...props} variant="primary" />;
export const OutlineButton = (props) => <AppButton {...props} variant="outline" />;
export const DangerButton  = (props) => <AppButton {...props} variant="danger" />;

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14 },
  md:   { minHeight: 48, paddingHorizontal: 20 },
  sm:   { minHeight: 38, paddingHorizontal: 14, borderRadius: 12 },
  text:   { fontSize: 14.5, fontWeight: '700' },
  textSm: { fontSize: 12.5 },
});
