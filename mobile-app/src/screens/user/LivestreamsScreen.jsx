import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { mapLivestreams } from '../../utils/livestream';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import { useLanguageStore } from '../../i18n/languageStore';
import { useTranslation } from '../../i18n';

export default function LivestreamsScreen() {
  const contentLanguage = useLanguageStore((s) => s.language); // refetch server-translated content when the UI language changes
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [streams,    setStreams]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // The endpoint already returns only active streams, newest first.
      const { data } = await api.get('/livestreams');
      setStreams(mapLivestreams(data));
    } catch { if (!silent) Toast.show({ type: 'error', text1: t('livestreams.loadFailed') }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, [contentLanguage]);

  const openStream = async (item) => {
    if (!item.url) return;
    try {
      await Linking.openURL(item.url);
    } catch {
      Toast.show({ type: 'error', text1: t('livestreams.openFailed') });
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }, !item.url && { opacity: 0.6 }]}
      onPress={() => openStream(item)}
      disabled={!item.url}
      accessibilityRole="button"
      accessibilityLabel={item.url ? t('livestreams.watchLabel', { title: item.title || t('livestreams.defaultTitle') }) : t('livestreams.unavailableLabel', { title: item.title || t('livestreams.defaultTitle') })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={styles.liveBadge}>
          <Ionicons name="logo-youtube" size={13} color="#DC2626" />
          <Text style={styles.liveText}>{item.url ? t('livestreams.watch') : t('livestreams.unavailableBadge')}</Text>
        </View>
        <Text style={[styles.title, { color: C.text }]}>{item.title || t('livestreams.defaultTitle')}</Text>
      </View>
      {item.description ? <Text style={[styles.desc, { color: C.textSecondary }]} numberOfLines={2}>{item.description}</Text> : null}
      {item.templeName ? (
        <View style={styles.meta}>
          <Ionicons name="business" size={13} color={C.textSecondary} />
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            {item.templeName}{item.templeLocation ? ` · ${item.templeLocation}` : ''}
          </Text>
        </View>
      ) : null}
      {!item.url ? <Text style={[styles.metaText, { color: C.textSecondary }]}>{t('livestreams.linkUnavailable')}</Text> : null}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('livestreams.title')} />
      {loading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={streams}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
          ListEmptyComponent={<EmptyState icon="videocam-outline" title={t('livestreams.empty')} subtitle={t('livestreams.emptyHint')} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  card:       { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTop:    { gap: 6 },
  liveBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#DC262620', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  liveDot:    { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#DC2626' },
  liveText:   { color: '#DC2626', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title:      { fontSize: 15, fontWeight: '700' },
  desc:       { fontSize: 13, lineHeight: 18 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText:   { fontSize: 12 },
});
