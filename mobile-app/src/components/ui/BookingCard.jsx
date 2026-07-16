import React from 'react';
import { View, StyleSheet } from 'react-native';
import Card from './Card';
import IconContainer from './IconContainer';
import StatusBadge from '../StatusBadge';
import { CardTitle, Caption } from './Typography';
import { SPACING, COLORS } from '../../theme/tokens';
import { bookingStatusColor, formatDate } from '../../utils/helpers';

// Upcoming-puja / booking list row: icon, pooja + customer name, date and
// status. Reused by Dashboard and (later) the Bookings list screen.
export default function BookingCard({ title, subtitle, date, status, icon = 'flame', onPress }) {
  return (
    <Card onPress={onPress} padding={SPACING.md} style={styles.row} elevation="raised">
      <IconContainer name={icon} size="md" color={COLORS.primary} />
      <View style={styles.body}>
        <CardTitle numberOfLines={1}>{title}</CardTitle>
        <Caption numberOfLines={1} style={styles.subtitle}>{subtitle}</Caption>
      </View>
      <View style={styles.right}>
        {status && <StatusBadge status={status} colorMap={bookingStatusColor} small />}
        {date && <Caption style={styles.date}>{formatDate(date, 'dd MMM yyyy')}</Caption>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  body:     { flex: 1, minWidth: 0, gap: 2 },
  subtitle: { marginTop: 1 },
  right:    { alignItems: 'flex-end', gap: 4 },
  date:     { marginTop: 2 },
});
