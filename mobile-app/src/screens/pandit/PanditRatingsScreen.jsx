import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { timeAgo } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function PanditRatingsScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data: res } = await api.get('/pandits/me/ratings');
      setData(res.data || res);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load ratings' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, []);

  const renderItem = ({ item }) => (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.top}>
        <Text style={[styles.userName, { color: C.text }]}>{item.userId?.name || 'User'}</Text>
        <View style={styles.stars}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Ionicons key={i} name={i < item.rating ? 'star' : 'star-outline'} size={14} color="#D97706" />
          ))}
        </View>
      </View>
      {item.comment && <Text style={[styles.comment, { color: C.textSecondary }]}>{item.comment}</Text>}
      <Text style={[styles.time, { color: C.textSecondary }]}>{timeAgo(item.createdAt)}</Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Ratings & Reviews" />
      {loading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          ListHeaderComponent={data?.averageRating ? (
            <View style={[styles.avgCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.avgVal, { color: C.primary }]}>{data.averageRating.toFixed(1)}</Text>
              <View style={styles.stars}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Ionicons key={i} name={i < Math.round(data.averageRating) ? 'star' : 'star-outline'} size={22} color="#D97706" />
                ))}
              </View>
              <Text style={[styles.totalRatings, { color: C.textSecondary }]}>{data.totalRatings || 0} reviews</Text>
            </View>
          ) : null}
          data={data?.reviews || []}
          keyExtractor={(r) => r._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
          ListEmptyComponent={<EmptyState icon="star-outline" title="No reviews yet" subtitle="Complete bookings to receive ratings" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  avgCard: {
    borderRadius: 16, borderWidth: 1, padding: 20,
    alignItems: 'center', gap: 8, marginBottom: 16,
  },
  avgVal:       { fontSize: 48, fontWeight: '900' },
  stars:        { flexDirection: 'row', gap: 3 },
  totalRatings: { fontSize: 13 },
  card:         { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  top:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName:     { fontSize: 14, fontWeight: '700' },
  comment:      { fontSize: 13, lineHeight: 20 },
  time:         { fontSize: 11 },
});
