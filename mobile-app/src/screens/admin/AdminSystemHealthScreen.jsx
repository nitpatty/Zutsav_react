import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const STATUS_OK = ['online', 'configured'];

export default function AdminSystemHealthScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [services,   setServices]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/admin/system-health');
      setServices(data.services || []);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load system health' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="System Health" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHealth(true); }} tintColor={C.primary} />}
      >
        {services.map((s) => {
          const ok = STATUS_OK.includes(s.status);
          const color = ok ? '#16A34A' : '#DC2626';
          return (
            <View key={s.key} style={[styles.row, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[styles.label, { color: C.text }]}>{s.label}</Text>
              <View style={[styles.badge, { backgroundColor: color + '18' }]}>
                <Text style={[styles.badgeText, { color }]}>
                  {s.status === 'online' ? 'Online' : s.status === 'offline' ? 'Offline' : s.status === 'configured' ? 'Configured' : 'Not Configured'}
                </Text>
              </View>
            </View>
          );
        })}
        <Text style={[styles.caption, { color: C.textSecondary }]}>
          "Configured" reflects whether credentials are set up for that service, not a live connectivity check — Database status is the only live check.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 14,
  },
  dot:   { width: 10, height: 10, borderRadius: 5 },
  label: { flex: 1, fontSize: 14, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  caption: { fontSize: 11, marginTop: 4, lineHeight: 16, textAlign: 'center' },
});
