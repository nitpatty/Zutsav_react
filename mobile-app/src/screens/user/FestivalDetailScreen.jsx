import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { daysUntil } from '../../utils/helpers';
import ScreenHeader from '../../components/ScreenHeader';
import { useTranslation, useFormatters } from '../../i18n';

export default function FestivalDetailScreen({ route }) {
  const { festival } = route.params || {};
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const { theme } = useThemeStore();
  const C = theme.colors;

  if (!festival) return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title={t('festivals.detailFallbackTitle')} />
    </View>
  );

  const diff = festival.date ? daysUntil(festival.date) : null;
  const countdownLabel = diff === 0 ? t('festivals.today') : diff > 0 && diff <= 14 ? t(diff === 1 ? 'festivals.inDay' : 'festivals.inDays', { n: diff }) : null;

  const rows = [
    [t('panchang.tithi'), festival.tithiDate],
    [t('panchang.title'), festival.panchang],
    [t('festivals.hinduMonth'), festival.hinduMonth],
    [t('festivals.paksha'), festival.paksha],
    [t('festivals.vrat'), festival.vrat],
  ].filter(([, v]) => v);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('festivals.detailTitle')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {festival.image ? (
          <Image source={{ uri: imageUrl(festival.image) }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.iconHero, { backgroundColor: C.primary + '18' }]}>
            <Ionicons name="flame" size={40} color={C.primary} />
          </View>
        )}

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.name, { color: C.text }]}>{festival.name || festival.tithiDate || t('panchang.title')}</Text>
          {festival.date && <Text style={[styles.date, { color: C.primary }]}>{formatDate(festival.date, 'EEEE, dd MMMM yyyy')}</Text>}
          {countdownLabel && (
            <View style={[styles.countdownBadge, { backgroundColor: diff === 0 ? '#DC2626' : C.primary }]}>
              <Text style={styles.countdownText}>{countdownLabel}</Text>
            </View>
          )}
        </View>

        {festival.description ? (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>{t('festivals.about')}</Text>
            <Text style={[styles.desc, { color: C.textSecondary }]}>{festival.description}</Text>
          </View>
        ) : null}

        {rows.length > 0 && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>{t('festivals.panchangDetails')}</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{label}</Text>
                  <Text style={[styles.rowVal, { color: C.text }]}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1 },
  image:     { width: '100%', height: 200, borderRadius: 16 },
  iconHero:  { width: '100%', height: 140, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  card:      { borderRadius: 16, borderWidth: 1, padding: 16 },
  name:      { fontSize: 20, fontWeight: '800' },
  date:      { fontSize: 14, fontWeight: '600', marginTop: 4 },
  countdownBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start', marginTop: 10 },
  countdownText:  { fontSize: 11, fontWeight: '800', color: '#fff' },
  cardTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  desc:      { fontSize: 14, lineHeight: 22, marginTop: 8 },
  row:       { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:  { fontSize: 13, flex: 1 },
  rowVal:    { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
});
