/**
 * LocationSearch (mobile) — debounced place-search backed by the
 * /api/location/autocomplete proxy. Mirrors the web component so the Pandit
 * address screen gets the same "type to find your locality" experience.
 *
 * Props:
 *   onSelect   – ({ label, lat, lng }) => void
 *   placeholder– input placeholder text
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import { autocompletePlaces } from '../../services/geocodingService';

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

export default function LocationSearch({ onSelect, placeholder = 'Search your locality, city, or address…' }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const debounceRef = useRef(null);
  const reqIdRef    = useRef(0);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = (text) => {
    setQuery(text);
    setOpen(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const reqId = ++reqIdRef.current;
      const res = await autocompletePlaces(text);
      if (reqId !== reqIdRef.current) return; // superseded by newer typing
      setLoading(false);
      setResults(res.found ? res.results : []);
      setOpen(true);
    }, DEBOUNCE_MS);
  };

  const choose = (r) => {
    setQuery(r.label);
    setOpen(false);
    setResults([]);
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
          placeholder={placeholder}
          placeholderTextColor={C.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator size="small" color={C.primary} />}
      </View>

      {open && (
        <View style={[styles.dropdown, { borderColor: C.border, backgroundColor: C.surface }]}>
          {results.length === 0 ? (
            <Text style={[styles.empty, { color: C.textSecondary }]}>
              No matching places found. Fill the fields below manually.
            </Text>
          ) : (
            results.map((r, i) => (
              <TouchableOpacity
                key={`${r.lat},${r.lng},${i}`}
                style={[styles.row, { borderTopColor: C.border }, i === 0 && styles.rowFirst]}
                onPress={() => choose(r)}
              >
                <Ionicons name="location-outline" size={14} color={C.primary} />
                <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{r.label}</Text>
              </TouchableOpacity>
            ))
          )}
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
});
