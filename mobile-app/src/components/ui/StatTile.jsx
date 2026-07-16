import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../theme/tokens';
import { StatValue, Label } from './Typography';
import Card from './Card';

// The 3-column stat grid on the dashboard. `deltaText` renders a small
// green/red trend line under the value when provided.
export default function StatTile({ icon, value, label, deltaText, deltaPositive = true, onPress }) {
  return (
    <Card onPress={onPress} padding={SPACING.md} style={styles.tile}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <StatValue style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</StatValue>
      <Label style={styles.label} numberOfLines={1}>{label}</Label>
      {deltaText ? (
        <Label color={deltaPositive ? COLORS.success : COLORS.error} style={styles.delta}>
          {deltaText}
        </Label>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile:  { alignItems: 'center', gap: 6 },
  value: { marginTop: 2, textAlign: 'center' },
  label: { textAlign: 'center' },
  delta: { fontWeight: '700', marginTop: -2 },
});
