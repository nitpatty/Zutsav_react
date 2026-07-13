import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function TemplesScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [temples,    setTemples]   = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [search,     setSearch]    = useState('');

  const fetch = async (q = '', silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = { limit: 50 };
      if (q.trim()) params.search = q.trim();
      const { data } = await api.get('/temples', { params });
      setTemples(data.data || data.temples || []);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load temples' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('TempleDetail', { templeId: item._id, temple: item })}
      activeOpacity={0.85}
    >
      <View style={[styles.iconWrap, { backgroundColor: C.primary + '18' }]}>
        <Ionicons name="business" size={22} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: C.text }]}>{item.name}</Text>
        {item.city && <Text style={[styles.location, { color: C.textSecondary }]}><Ionicons name="location" size={12} /> {item.city}{item.state ? `, ${item.state}` : ''}</Text>}
        {item.deity && <Text style={[styles.deity, { color: C.primary }]}>{item.deity}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Temples" />
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={18} color={C.textSecondary} />
          <TextInput style={[styles.searchInput, { color: C.text }]} value={search} onChangeText={setSearch} placeholder="Search temples…" placeholderTextColor={C.textSecondary} returnKeyType="search" onSubmitEditing={() => fetch(search)} />
          {search ? <TouchableOpacity onPress={() => { setSearch(''); fetch(''); }}><Ionicons name="close-circle" size={18} color={C.textSecondary} /></TouchableOpacity> : null}
        </View>
      </View>
      {loading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={temples}
          keyExtractor={(t) => t._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(search, true); }} tintColor={C.primary} />}
          ListEmptyComponent={<EmptyState icon="business-outline" title="No temples found" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  card:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  iconWrap:    { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  name:        { fontSize: 15, fontWeight: '700' },
  location:    { fontSize: 12, marginTop: 2 },
  deity:       { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
