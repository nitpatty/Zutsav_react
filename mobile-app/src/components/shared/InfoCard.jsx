import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Bordered card + label/value row pair used throughout the pandit booking/
// referral detail screens — extracted after the identical local definitions
// were found duplicated across 2 files.
export function InfoCard({ title, children, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.cardTitle, { color: C.text }]}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function Row({ label, value, C, highlight = false }) {
  return (
    <View style={styles.rowItem}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowVal, { color: highlight ? C.primary : C.text }, highlight && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card:      { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardBody:  { gap: 8, marginTop: 8 },
  rowItem:   { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:  { fontSize: 13, flex: 1 },
  rowVal:    { fontSize: 13, fontWeight: '600', flex: 1.3, textAlign: 'right' },
});
