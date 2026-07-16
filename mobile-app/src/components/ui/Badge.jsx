import React from 'react';
import { View, Text } from 'react-native';
import { COLORS, RADIUS, FONT } from '../../theme/tokens';

const VARIANTS = {
  primary: { bg: COLORS.primary + '1A', fg: COLORS.primaryDark },
  success: { bg: COLORS.successBg, fg: COLORS.success },
  warning: { bg: COLORS.warningBg, fg: COLORS.warning },
  error:   { bg: COLORS.errorBg,   fg: COLORS.error },
  info:    { bg: COLORS.infoBg,    fg: COLORS.info },
  neutral: { bg: COLORS.border,    fg: COLORS.textSecondary },
};

// Small pill badge for status/delta labels. Distinct from the shared
// StatusBadge (which reads app-wide status color maps) — this one is for
// the Pandit design system's own semantic variants.
export default function Badge({ label, variant = 'neutral', icon, style }) {
  const v = VARIANTS[variant] || VARIANTS.neutral;
  return (
    <View
      style={[
        {
          flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: v.bg,
          borderRadius: RADIUS.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icon}
      <Text style={{ color: v.fg, fontSize: FONT.size.label, fontWeight: FONT.weight.bold }}>{label}</Text>
    </View>
  );
}
