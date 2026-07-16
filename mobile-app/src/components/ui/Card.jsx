import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../../theme/tokens';

// Base floating card — every card-family component (StatTile, ActionCard,
// BookingCard, HeroCard) wraps this so radius/shadow/padding stay uniform.
export default function Card({ children, onPress, padding = SPACING.base, style, elevation = 'raised' }) {
  const content = (
    <View
      style={[
        {
          backgroundColor: COLORS.card,
          borderRadius: RADIUS.lg,
          padding,
          ...SHADOW[elevation],
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      {content}
    </TouchableOpacity>
  );
}
