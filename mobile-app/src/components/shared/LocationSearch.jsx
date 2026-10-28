/**
 * LocationSearch (mobile) — debounced place-search backed by the
 * /api/location/autocomplete proxy. Mirrors the web component so the Pandit
 * address screen gets the same "type to find your locality" experience.
 *
 * Props:
 *   onSelect   – ({ label, lat, lng, placeId, components }) => void  — the complete normalized suggestion
 *   placeholder– input placeholder text
 *
 * States: suggestions · "no matching places" (the search worked, nothing matched) · "temporarily unavailable" with
 * a retry (network/provider failure). A 401 is handled by the shared API client's session logic; the dropdown just closes.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import { autocompletePlaces } from '../../services/geocodingService';
import { useTranslation } from '../../i18n';

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

export default function LocationSearch({ onSelect, placeholder }) {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus]   = useState('idle'); // 'idle' | 'results' | 'empty' | 'unavailable'
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const debounceRef = useRef(null);
  const reqIdRef    = useRef(0);
  const mountedRef  = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const search = async (text) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    const res = await autocompletePlaces(text);
    if (!mountedRef.current || reqId !== reqIdRef.current) return; // superseded by newer typing / unmounted
    setLoading(false);
    if (res.sessionExpired) { setResults([]); setStatus('idle'); setOpen(false); return; }
    if (res.found) { setResults(res.results); setStatus('results'); }
    else { setResults([]); setStatus(res.unavailable ? 'unavailable' : 'empty'); }
    setOpen(true);
  };

  const handleChange = (text) => {
    setQuery(text);
    setOpen(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqIdRef.current += 1; // any request already in flight is now stale, including when the text got too short

    if (text.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setStatus('idle');
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(text), DEBOUNCE_MS);
  };

  const choose = (r) => {
    setQuery(r.label);
    setOpen(false);
    setResults([]);
    setStatus('idle');
    onSelect && onSelect(r);
  };

  return (
    <View>
      <View style={[styles.box, { borderColor: C.border, backgroundColor: C.surface }]}>
        <Ionicons name="search" size={16} color={C.textSecondary} />
        <TextInput
          style={[styles.input, { color: C.text }]}
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder ?? t('location.searchPlaceholder')}
          placeholderTextColor={C.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator size="small" color={C.primary} />}
      </View>

      {open && (
        <View style={[styles.dropdown, { borderColor: C.border, backgroundColor: C.surface }]}>
          {status === 'unavailable' && (
            <View style={styles.unavailable} testID="place-search-unavailable">
              <Text style={[styles.empty, { color: C.textSecondary, padding: 0 }]}>
                {t('location.unavailable')}
              </Text>
              <TouchableOpacity
                style={[styles.retry, { borderColor: C.primary }]}
                onPress={() => search(query)}
                accessibilityRole="button"
                accessibilityLabel={t('location.tryAgainLabel')}
              >
                <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>{t('location.tryAgain')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {status === 'empty' && (
            <Text style={[styles.empty, { color: C.textSecondary }]}>
              {t('location.noResults')}
            </Text>
          )}
          {status === 'results' && results.map((r, i) => (
            <TouchableOpacity
              key={`${r.placeId || ''}${r.lat},${r.lng},${i}`}
              style={[styles.row, { borderTopColor: C.border }, i === 0 && styles.rowFirst]}
              onPress={() => choose(r)}
            >
              <Ionicons name="location-outline" size={14} color={C.primary} />
              <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  input:    { flex: 1, fontSize: 14, padding: 0 },
  dropdown: { borderWidth: 1.5, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  rowFirst: { borderTopWidth: 0 },
  empty:    { paddingHorizontal: 12, paddingVertical: 12, fontSize: 13 },
  unavailable: { padding: 12, gap: 10, alignItems: 'flex-start' },
  retry:    { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
});
