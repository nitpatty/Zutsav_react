import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import ImageGallery from '../../components/shared/ImageGallery';
import { mapTemple } from '../../utils/temple';
import { useTranslation } from '../../i18n';
import { useLanguageStore } from '../../i18n/languageStore';

export default function TempleDetailScreen({ route }) {
  const { templeId, temple: templeParam } = route.params || {};
  const { t } = useTranslation();
  const contentLanguage = useLanguageStore((s) => s.language);
  const openedInLanguage = useRef(contentLanguage);   // the language the item passed through navigation was fetched in
  const requestRef = useRef(0);
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [rawTemple, setTemple] = useState(templeParam || null);
  const [loading, setLoading] = useState(!templeParam);

  // Opened from the list with the item in hand: it is used as-is, with no request (unchanged). Opened by id only: fetched
  // once. If the UI language changes while the screen is open, the entity is fetched again (same endpoint and id, the
  // client adds ?lang=) so old-language text is not left on screen. A response for a superseded request is ignored.
  const entityId = templeId || templeParam?._id;
  useEffect(() => {
    if (!entityId) return undefined;
    if (templeParam && contentLanguage === openedInLanguage.current) return undefined;
    const request = ++requestRef.current;
    api.get(`/temples/${entityId}`)
      .then(({ data }) => { if (request === requestRef.current) setTemple((prev) => data.data || data.temple || prev); })
      .catch(() => { if (request === requestRef.current) Toast.show({ type: 'error', text1: t('temples.detailLoadFailed') }); })
      .finally(() => { if (request === requestRef.current) setLoading(false); });
    return () => { requestRef.current += 1; };
  }, [entityId, contentLanguage]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!rawTemple) return null;
  const temple = mapTemple(rawTemple);

  const infoItems = [
    { icon: 'location',       label: t('temples.address'),      value: temple.fullAddress },
    { icon: 'time',           label: t('temples.openingHours'), value: temple.openingHours },
    { icon: 'star',           label: t('temples.primaryDeity'), value: temple.primaryDeity },
    { icon: 'pricetag',       label: t('temples.category'),     value: temple.category },
  ].filter((i) => i.value);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={temple.name} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={[styles.header, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: C.primary + '18' }]}>
            <Ionicons name="business" size={32} color={C.primary} />
          </View>
          <Text style={[styles.name, { color: C.text }]}>{temple.name}</Text>
          {temple.primaryDeity ? <Text style={[styles.deity, { color: C.primary }]}>{temple.primaryDeity}</Text> : null}
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>{t('temples.gallery')}</Text>
          <ImageGallery images={temple.images} />
        </View>

        {temple.description ? (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>{t('temples.about')}</Text>
            <Text style={[styles.desc, { color: C.textSecondary }]}>{temple.description}</Text>
          </View>
        ) : null}

        {infoItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>{t('temples.information')}</Text>
            {infoItems.map((item) => (
              <View key={item.label} style={styles.infoRow}>
                <Ionicons name={item.icon} size={16} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: C.textSecondary }]}>{item.label}</Text>
                  <Text style={[styles.infoVal, { color: C.text }]}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1 },
  header:    { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8 },
  iconWrap:  { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  name:      { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  deity:     { fontSize: 14, fontWeight: '600' },
  card:      { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  desc:      { fontSize: 14, lineHeight: 22 },
  infoRow:   { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingTop: 4 },
  infoLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  infoVal:   { fontSize: 14, marginTop: 1 },
});
