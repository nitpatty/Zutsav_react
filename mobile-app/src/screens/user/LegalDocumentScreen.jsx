import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import {
  isLegalDocumentType, isValidLinkId, describeFixedDocument, describeFooterFile, formatFileSize,
} from '../../utils/legalResources';
import { useTranslation, useFormatters } from '../../i18n';

/**
 * One document, fixed or admin-uploaded.
 *   route.params: { source: 'fixed', type, title? }  → GET /api/documents/:type
 *                 { source: 'link',  id,   title? }  → GET /api/footer-links/:id
 * The file itself is never fetched by the app's API client or parsed here:
 *   • a safe raster image (server `kind: 'image'`) is shown in the app;
 *   • PDFs and everything else are handed to the device (external viewer / browser / download manager) through the
 *     documented public file routes — nothing uploaded is rendered or executed inside the app.
 * Unpublished / disabled / deleted files and unknown ids show an "unavailable" state, never a broken viewer.
 */
export default function LegalDocumentScreen({ route }) {
  const { source, type, id, title: titleParam } = route.params || {};
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [state, setState] = useState({ status: 'loading', doc: null });
  const [imageFailed, setImageFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    setState({ status: 'loading', doc: null });
    setImageFailed(false);
    // Only whitelisted types / well-formed ids ever reach the API — nothing else can be requested from here.
    const valid = source === 'fixed' ? isLegalDocumentType(type) : source === 'link' ? isValidLinkId(id) : false;
    if (!valid) { setState({ status: 'unavailable', doc: null }); return; }
    try {
      const { data } = source === 'fixed' ? await api.get(`/documents/${type}`) : await api.get(`/footer-links/${id}`);
      if (!mounted.current) return;
      const doc = source === 'fixed' ? describeFixedDocument(type, data) : describeFooterFile(id, data);
      setState(doc ? { status: 'ready', doc } : { status: 'unavailable', doc: null });
    } catch (err) {
      if (!mounted.current) return;
      // 404 / 400 → the document does not exist; anything else (offline, timeout, 5xx) is retryable.
      const gone = err?.response?.status === 404 || err?.response?.status === 400;
      setState({ status: gone ? 'unavailable' : 'error', doc: null });
    }
  }, [source, type, id]);

  useEffect(() => { load(); }, [load, attempt]);

  const open = async (url) => {
    if (!url) return;
    try { await Linking.openURL(url); }
    catch { Toast.show({ type: 'error', text1: t('legal.openFileFailed') }); }
  };

  const { doc } = state;
  const heading = doc?.title || titleParam || t('legal.documentFallback');
  const meta = doc ? [doc.fileName, formatFileSize(doc.size), doc.updatedAt ? t('legal.updatedOn', { date: formatDate(doc.updatedAt) }) : ''].filter(Boolean) : [];

  const Button = ({ label, icon, onPress, outline }) => (
    <TouchableOpacity
      style={[styles.btn, outline ? { borderColor: C.primary, borderWidth: 1.5 } : { backgroundColor: C.primary }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={outline ? C.primary : '#fff'} />
      <Text style={[styles.btnText, { color: outline ? C.primary : '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={heading} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        {state.status === 'loading' && <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>}

        {state.status === 'error' && (
          <View style={styles.center} testID="doc-error">
            <Ionicons name="cloud-offline-outline" size={44} color={C.border} />
            <Text style={[styles.msg, { color: C.text }]}>{t('legal.docLoadFailed')}</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{t('legal.checkConnection')}</Text>
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={() => setAttempt((n) => n + 1)} accessibilityRole="button">
              <Text style={[styles.btnText, { color: '#fff' }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state.status === 'unavailable' && (
          <View style={styles.center} testID="doc-unavailable">
            <Ionicons name="document-outline" size={44} color={C.border} />
            <Text style={[styles.msg, { color: C.text }]}>{t('legal.unavailable')}</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{t('legal.unavailableSub')}</Text>
          </View>
        )}

        {state.status === 'ready' && doc && (
          <>
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.title, { color: C.text }]}>{doc.title}</Text>
              {meta.map((m) => <Text key={m} style={[styles.sub, { color: C.textSecondary }]}>{m}</Text>)}
            </View>

            {doc.mode === 'image' && !imageFailed && (
              <Image
                source={{ uri: doc.imageUrl }}
                style={[styles.image, { backgroundColor: C.surface }]}
                resizeMode="contain"
                onError={() => setImageFailed(true)}
                accessibilityLabel={doc.title}
              />
            )}
            {doc.mode === 'image' && imageFailed && (
              <Text style={[styles.sub, { color: C.textSecondary }]} testID="image-failed">{t('legal.imageFailed')}</Text>
            )}

            {doc.mode === 'external' && (
              <Button
                icon={doc.isPdf ? 'document-text-outline' : 'download-outline'}
                label={doc.isPdf ? t('legal.openDocument') : t('legal.downloadDocument')}
                onPress={() => open(doc.openUrl)}
              />
            )}
            {doc.mode === 'pdf' && <Button icon="document-text-outline" label={t('legal.openPdf')} onPress={() => open(doc.openUrl)} />}
            {(doc.mode === 'image' || doc.mode === 'pdf') && <Button outline icon="download-outline" label={t('legal.download')} onPress={() => open(doc.downloadUrl)} />}
            {doc.mode === 'download' && (
              <>
                <Button icon="download-outline" label={t('legal.downloadFile')} onPress={() => open(doc.downloadUrl)} />
                <Text style={[styles.sub, { color: C.textSecondary }]}>{t('legal.noPreview')}</Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  center:  { alignItems: 'center', gap: 10, padding: 24 },
  card:    { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  title:   { fontSize: 17, fontWeight: '800' },
  msg:     { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  sub:     { fontSize: 13, lineHeight: 19 },
  image:   { width: '100%', height: 380, borderRadius: 12 },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  btnText: { fontSize: 15, fontWeight: '700' },
});
