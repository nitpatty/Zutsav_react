import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';

export default function EmptyState({ icon = 'file-tray', title, subtitle, actionLabel, onAction }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={56} color={C.border} />
      {title    ? <Text style={[styles.title,    { color: C.text }]}>{title}</Text>    : null}
      {subtitle ? <Text style={[styles.subtitle, { color: C.textSecondary }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  title:     { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn:       { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
});
