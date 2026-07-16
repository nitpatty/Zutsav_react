import React from 'react';
import { View, Image, Text } from 'react-native';
import { COLORS, SIZES, FONT } from '../../theme/tokens';
import { getInitials } from '../../utils/helpers';

const SIZE_MAP = { sm: SIZES.avatarSm, md: SIZES.avatarMd, lg: SIZES.avatarLg };

export default function ProfileAvatar({ uri, name, size = 'md', style }) {
  const box = SIZE_MAP[size];
  if (uri) {
    return <Image source={{ uri }} style={[{ width: box, height: box, borderRadius: box / 2 }, style]} />;
  }
  return (
    <View
      style={[
        {
          width: box, height: box, borderRadius: box / 2,
          backgroundColor: COLORS.primaryLight,
          alignItems: 'center', justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: COLORS.primaryDark, fontWeight: FONT.weight.bold, fontSize: box * 0.36 }}>
        {getInitials(name || '')}
      </Text>
    </View>
  );
}
