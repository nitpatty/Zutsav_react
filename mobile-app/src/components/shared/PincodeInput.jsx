import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import usePincodeLookup from '../../hooks/usePincodeLookup';

// RN port of the website's PincodeInput — same props contract:
//   value    – current pincode string
//   onChange – (pincode) => void
//   onFill   – ({ state, city, district }) => void
//   error    – string | null (external validation error)
export default function PincodeInput({ value, onChange, onFill, error }) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { loading, data, error: apiError } = usePincodeLookup(value);
  const onFillRef = useRef(onFill);
  onFillRef.current = onFill;

  useEffect(() => {
    if (data && onFillRef.current) onFillRef.current(data);
  }, [data]);

  useEffect(() => {
    if (apiError && onFillRef.current) onFillRef.current({ state: '', city: '', district: '' });
  }, [apiError]);

  const showError = error || apiError;

  return (
    <View>
      <View style={[styles.row, { borderColor: showError ? C.error : C.border }]}>
        <Ionicons name="location-outline" size={16} color={C.textSecondary} />
        <TextInput
          style={[styles.input, { color: C.text }]}
          value={value}
          onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
          placeholder="Enter 6-digit pincode"
          placeholderTextColor={C.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
        />
        {loading && <ActivityIndicator size="small" color={C.primary} />}
      </View>

      {showError ? <Text style={[styles.errorText, { color: C.error }]}>{showError}</Text> : null}

      {data ? (
        <View style={styles.chipRow}>
          {[
            ['District', data.district],
            ['City', data.city],
            ['State', data.state],
          ].filter(([, v]) => v).map(([label, v]) => (
            <View key={label} style={[styles.chip, { backgroundColor: C.primary + '15', borderColor: C.primary + '40' }]}>
              <Text style={[styles.chipText, { color: C.primary }]}>{label}: {v}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  input:     { flex: 1, fontSize: 14 },
  errorText: { fontSize: 11, marginTop: 4 },
  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  chipText:  { fontSize: 11, fontWeight: '600' },
});
