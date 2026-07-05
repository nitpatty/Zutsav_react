import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Label + content wrapper used throughout the form-heavy pandit profile/
// referral/blog screens — extracted after the identical local definition
// was found duplicated verbatim across 4 files.
export default function FormField({ label, C, children }) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { gap: 6 },
  label: { fontSize: 12, fontWeight: '600' },
});
