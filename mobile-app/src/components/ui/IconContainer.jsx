import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SIZES, ICON_SIZE } from '../../theme/tokens';

const SIZE_MAP = { sm: SIZES.iconContainerSm, md: SIZES.iconContainerMd, lg: SIZES.iconContainerLg };
const ICON_MAP = { sm: ICON_SIZE.sm, md: ICON_SIZE.md, lg: ICON_SIZE.lg };

// Consistent tinted icon "chip" used across stat tiles, action cards, list rows.
export default function IconContainer({ name, size = 'md', color = COLORS.primary, tint, shape = 'rounded', style }) {
  const box = SIZE_MAP[size];
  const iconSize = ICON_MAP[size];
  const bg = tint || color + '1A';
  return (
    <View
      style={[
        {
          width: box,
          height: box,
          borderRadius: shape === 'circle' ? box / 2 : RADIUS.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Ionicons name={name} size={iconSize} color={color} />
    </View>
  );
}
