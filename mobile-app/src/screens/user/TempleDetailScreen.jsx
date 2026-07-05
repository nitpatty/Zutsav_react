import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function TempleDetailScreen({ route }) {
  const { templeId, temple: templeParam } = route.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [temple, setTemple] = useState(templeParam || null);
  const [loading, setLoading] = useState(!templeParam);

  useEffect(() => {
    if (!templeParam && templeId) {
      api.get(`/temples/${templeId}`)
        .then(({ data }) => setTemple(data.data || data.temple))
        .catch(() => Toast.show({ type: 'error', text1: 'Could not load temple' }))
        .finally(() => setLoading(false));
    }
  }, [templeId]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!temple) return null;

  const infoItems = [
    { icon: 'location',       label: 'Location',   value: [temple.street, temple.city, temple.state, temple.pincode].filter(Boolean).join(', ') },
    { icon: 'time',           label: 'Timings',    value: temple.timings },
    { icon: 'star',           label: 'Deity',      value: temple.deity },
    { icon: 'call',           label: 'Phone',      value: temple.phone },
    { icon: 'globe',          label: 'Website',    value: temple.website },
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
          {temple.deity && <Text style={[styles.deity, { color: C.primary }]}>{temple.deity}</Text>}
        </View>

        {temple.description && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>About</Text>
            <Text style={[styles.desc, { color: C.textSecondary }]}>{temple.description}</Text>
          </View>
        )}

        {infoItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Information</Text>
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
