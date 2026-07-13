import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';

// Placeholder for drawer destinations not yet built in the current phase of
// the Admin Operations App rollout — explicit "not yet implemented", not a
// silent dead-end tap.
export default function ComingSoonScreen({ route }) {
  const { title } = route?.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={title || 'Coming Soon'} />
      <View style={styles.center}>
        <Ionicons name="construct-outline" size={48} color={C.textSecondary} />
        <Text style={[styles.text, { color: C.textSecondary }]}>This section is coming in a future update.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  text:   { fontSize: 14, textAlign: 'center' },
});
