import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDateTime } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function LivestreamsScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [streams,    setStreams]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/livestreams?status=live&sort=-createdAt');
      setStreams(data.data || data.livestreams || []);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load livestreams' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => item.streamUrl && Linking.openURL(item.streamUrl)}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={[styles.title, { color: C.text }]}>{item.title}</Text>
      </View>
      {item.description && <Text style={[styles.desc, { color: C.textSecondary }]} numberOfLines={2}>{item.description}</Text>}
      <View style={styles.meta}>
        <Ionicons name="person" size={13} color={C.textSecondary} />
        <Text style={[styles.metaText, { color: C.textSecondary }]}>{item.panditName || item.hostedBy || 'Pandit'}</Text>
        {item.viewers > 0 && (
          <>
            <Ionicons name="eye" size={13} color={C.textSecondary} />
            <Text style={[styles.metaText, { color: C.textSecondary }]}>{item.viewers} watching</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Live Poojas" />
      {loading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={streams}
          keyExtractor={(s) => s._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
          ListEmptyComponent={<EmptyState icon="videocam-outline" title="No live streams right now" subtitle="Check back later for live poojas" />}
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
