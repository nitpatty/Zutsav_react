import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../theme/tokens';
import { SectionHeading, Label } from './Typography';

export default function SectionHeader({ title, onSeeAll, seeAllLabel = 'View All', style }) {
  return (
    <View style={[styles.row, style]}>
      <SectionHeading>{title}</SectionHeading>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Label color={COLORS.primaryDark} style={{ fontWeight: '700' }}>{seeAllLabel}</Label>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
});
