import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import { safeHttpUrl } from '../../utils/legalResources';
import { useTranslation } from '../../i18n';
import {
  loadLegalDocuments, loadFooterLinks, peekLegalCache, isLegalCacheFresh, prepareLinks,
} from '../../services/legalResourcesService';

/**
 * Legal & Resources — shared by the User and Pandit Settings (the Pandit Settings screen renders the same
 * SettingsScreen, and both navigators register this route).
 *
 *   • Legal documents  ← GET /api/documents (published ones only)
 *   • More links       ← GET /api/settings/public → footerLinks (admin-configured; URL or uploaded file)
 * Nothing here is hard-coded: titles, order and destinations all come from the server, and a change made in
 * System Configuration appears here without an app release (pull to refresh, or on return after the cache expires).
 */
const initialSection = { status: 'loading', items: [], error: false, stale: false };

export default function LegalResourcesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [docs, setDocs] = useState(initialSection);
  const [links, setLinks] = useState(initialSection);
  const [rawLinks, setRawLinks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    const [d, l] = await Promise.allSettled([loadLegalDocuments({ force }), loadFooterLinks({ force })]);
    if (!mounted.current) return;
    const cache = peekLegalCache();
    // Each section succeeds or fails on its own. After a failed refresh the last good data stays on screen.
    if (d.status === 'fulfilled') setDocs({ status: 'ready', items: d.value, error: false, stale: false });
    else setDocs({ status: cache.documents ? 'ready' : 'error', items: cache.documents || [], error: true, stale: !!cache.documents });
    if (l.status === 'fulfilled') { setRawLinks(l.value); setLinks({ status: 'ready', items: [], error: false, stale: false }); }
    else { setRawLinks(cache.links || []); setLinks({ status: cache.links ? 'ready' : 'error', items: [], error: true, stale: !!cache.links }); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Coming back to this screen: reload only if the cache has expired (never a request on every focus).
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => { if (!isLegalCacheFresh()) refresh(); });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigation, refresh]);

  const onPullRefresh = async () => { setRefreshing(true); await refresh({ force: true }); if (mounted.current) setRefreshing(false); };
  const retrySection = (setter) => { setter(initialSection); refresh({ force: true }); };

  const prepared = prepareLinks(rawLinks, docs.items);

  const openLink = async (link) => {
    const href = safeHttpUrl(link.href); // re-validated at the moment of opening
    if (!href) { Toast.show({ type: 'error', text1: t('legal.cannotOpen') }); return; }
    try { await Linking.openURL(href); } catch { Toast.show({ type: 'error', text1: t('legal.openFailedLink') }); }
  };

  const Row = ({ icon, label, onPress, hint, last }) => (
    <TouchableOpacity
      style={[styles.item, !last && { borderBottomColor: C.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Ionicons name={icon} size={20} color={C.text} />
      <Text style={[styles.itemLabel, { color: C.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
    </TouchableOpacity>
  );

  const Notice = ({ text, onRetry, testID }) => (
    <View style={styles.notice} testID={testID}>
      <Text style={[styles.noticeText, { color: C.textSecondary }]}>{text}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={[styles.retry, { borderColor: C.primary }]}>
          <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('settings.legalResources')} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={C.primary} />}
      >
        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t('legal.sectionDocs')}</Text>
          {docs.status === 'loading' && <View style={styles.notice}><ActivityIndicator color={C.primary} /></View>}
          {docs.status === 'error' && <Notice testID="docs-error" text={t('legal.docsError')} onRetry={() => retrySection(setDocs)} />}
          {docs.status === 'ready' && docs.items.length === 0 && <Notice testID="docs-empty" text={t('legal.docsEmpty')} />}
          {docs.status === 'ready' && docs.items.map((d, i) => (
            <Row
              key={d.type}
              icon="document-text-outline"
              label={d.label}
              hint={t('legal.hintOpenDoc')}
              last={i === docs.items.length - 1 && !docs.stale}
              onPress={() => navigation.navigate('LegalDocument', { source: 'fixed', type: d.type, title: d.label })}
            />
          ))}
          {docs.status === 'ready' && docs.stale && <Notice testID="docs-stale" text={t('legal.docsStale')} onRetry={() => retrySection(setDocs)} />}
        </View>

        {(links.status === 'error' || links.stale || prepared.length > 0) && (
          <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t('legal.moreLinks')}</Text>
            {links.status === 'error' && <Notice testID="links-error" text={t('legal.linksError')} onRetry={() => retrySection(setLinks)} />}
            {links.status === 'ready' && prepared.map((link, i) => (
              <Row
                key={link.id}
                icon={link.linkType === 'url' ? 'open-outline' : 'document-attach-outline'}
                label={link.label}
                hint={link.linkType === 'url' ? t('legal.hintBrowser') : t('legal.hintFile')}
                last={i === prepared.length - 1 && !links.stale}
                onPress={() => (link.linkType === 'url'
                  ? openLink(link)
                  : navigation.navigate('LegalDocument', { source: 'link', id: link.id, title: link.label }))}
              />
            ))}
            {links.status === 'ready' && links.stale && <Notice testID="links-stale" text={t('legal.linksStale')} onRetry={() => retrySection(setLinks)} />}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  section:      { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 14, paddingBottom: 6 },
  item:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemLabel:    { flex: 1, fontSize: 15, fontWeight: '500' },
  notice:       { padding: 14, gap: 10, alignItems: 'flex-start' },
  noticeText:   { fontSize: 13, lineHeight: 19 },
  retry:        { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
});
