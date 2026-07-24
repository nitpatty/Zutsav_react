import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, SIZES, SHADOW } from '../../theme/tokens';

/**
 * Reusable sticky bottom action bar for the Pandit app.
 *
 * The Pandit tab bar is a floating pill (`position: 'absolute'`), so it never
 * reserves layout space — anything a screen renders at its own natural bottom
 * (a fixed footer, or the last item of a ScrollView) can end up visually
 * covered by the tab bar unless it explicitly clears the tab bar's footprint.
 * This component is the single place that computes that clearance, so no
 * screen has to hardcode a magic padding number again.
 *
 * Usage:
 *   const barHeight = useStickyActionBarHeight();
 *   <ScrollView contentContainerStyle={{ paddingBottom: barHeight + SPACING.base }}>
 *     ...
 *   </ScrollView>
 *   <StickyActionBar>
 *     <PrimaryButton title="Save" onPress={...} />
 *   </StickyActionBar>
 */

// Vertical gap between the action bar and the tab bar above it.
const BAR_TO_TAB_BAR_GAP = SPACING.sm;

/** Distance from the true screen bottom to the top of the floating tab bar. */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  return SIZES.tabBarBottomMargin + insets.bottom + SIZES.tabBarHeight;
}

/** Full height a screen must reserve (scroll padding) to clear both the tab bar and this bar. */
export function useStickyActionBarHeight(barContentHeight = SIZES.buttonHeight) {
  const tabBarClearance = useTabBarClearance();
  return tabBarClearance + BAR_TO_TAB_BAR_GAP + barContentHeight + SPACING.base * 2;
}

export default function StickyActionBar({ children, style }) {
  // `tabBarClearance` already folds in insets.bottom (the OS gesture/home-
  // indicator area), so once the bar's own `bottom` offset clears that, its
  // internal padding just needs normal, comfortable spacing — no further
  // safe-area math required here.
  const tabBarClearance = useTabBarClearance();

  return (
    <View style={[styles.bar, { bottom: tabBarClearance + BAR_TO_TAB_BAR_GAP }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', gap: SPACING.md,
    paddingHorizontal: SPACING.base, paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
    ...SHADOW.raised,
  },
});
