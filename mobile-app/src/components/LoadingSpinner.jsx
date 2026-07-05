import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../store/themeStore';

export default function LoadingSpinner({ text, fullScreen = false }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  if (fullScreen) {
    return (
      <View style={[styles.full, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.primary} />
        {text ? <Text style={[styles.text, { color: C.textSecondary }]}>{text}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <ActivityIndicator size="small" color={C.primary} />
      {text ? <Text style={[styles.text, { color: C.textSecondary }]}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full:   { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  inline: { padding: 24, alignItems: 'center', gap: 8 },
  text:   { fontSize: 14, marginTop: 4 },
});
