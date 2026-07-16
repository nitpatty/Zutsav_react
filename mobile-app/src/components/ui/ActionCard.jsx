import React from 'react';
import { StyleSheet } from 'react-native';
import Card from './Card';
import IconContainer from './IconContainer';
import { Label } from './Typography';
import { SPACING, COLORS } from '../../theme/tokens';

// Quick-action grid tile — icon over label, used in the dashboard's
// "Quick Actions" row and reusable anywhere a shortcut grid is needed.
export default function ActionCard({ icon, label, onPress }) {
  return (
    <Card onPress={onPress} padding={SPACING.md} style={styles.tile} elevation="raised">
      <IconContainer name={icon} size="md" color={COLORS.primary} />
      <Label style={styles.label} numberOfLines={1}>{label}</Label>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile:  { alignItems: 'center', gap: SPACING.sm },
  label: { textAlign: 'center' },
});
