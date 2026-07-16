import React from 'react';
import { View, ImageBackground, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, SHADOW, FONT } from '../../theme/tokens';
import { Caption, Heading, Label } from './Typography';
import { PrimaryButton } from './Button';

// The dashboard's signature earnings card. `imageSource` is optional — pass
// a require(...) or { uri } once a hero photo asset is available; without
// one it falls back to a warm gradient so the layout is never blocked on art.
export default function HeroCard({
  label = 'Total Earnings',
  value,
  period = 'This Month',
  onPeriodPress,
  deltaText,
  onViewDetails,
  imageSource,
}) {
  const Wrapper = imageSource ? ImageBackground : View;
  const wrapperProps = imageSource
    ? { source: imageSource, imageStyle: { borderRadius: RADIUS.xl } }
    : {};

  return (
    <Wrapper {...wrapperProps} style={styles.card}>
      <LinearGradient
        colors={imageSource ? [COLORS.heroOverlayFrom, COLORS.heroOverlayTo] : ['#2A2113', '#151009']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.topRow}>
        <Caption color="rgba(255,255,255,0.75)">{label}</Caption>
        <TouchableOpacity style={styles.periodChip} onPress={onPeriodPress} disabled={!onPeriodPress}>
          <Label color="#FFFFFF">{period}</Label>
          <Ionicons name="chevron-down" size={12} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Heading color="#FFFFFF" style={styles.value}>{value}</Heading>

      {deltaText ? (
        <View style={styles.deltaRow}>
          <Ionicons name="trending-up" size={14} color={COLORS.success} />
          <Caption color={COLORS.success} style={{ fontWeight: '700' }}>{deltaText}</Caption>
        </View>
      ) : null}

      <PrimaryButton
        title="View Details"
        onPress={onViewDetails}
        fullWidth={false}
        size="sm"
        style={styles.viewDetailsBtn}
      />
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    overflow: 'hidden',
    minHeight: 168,
    justifyContent: 'space-between',
    ...SHADOW.floating,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  periodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  value: { marginTop: SPACING.sm, fontSize: 28 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.xs },
  viewDetailsBtn: { alignSelf: 'flex-start', marginTop: SPACING.md },
});
