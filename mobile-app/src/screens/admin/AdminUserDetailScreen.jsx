import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatDateTime } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function AdminUserDetailScreen({ navigation, route }) {
  const { userId } = route.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [user,      setUser]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [acting,    setActing]    = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/admin/users/${userId}`);
      setUser(data.data || data.user);
    } catch { Toast.show({ type: 'error', text1: 'Could not load user' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, [userId]);

  const handleCancelDeletion = async () => {
    Alert.alert('Cancel Deletion', `Restore ${user?.name}'s account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore', onPress: async () => {
          try {
            setActing(true);
            await api.patch(`/admin/users/${userId}/cancel-deletion`);
            Toast.show({ type: 'success', text1: 'Account restored' });
            fetch(true);
          } catch (err) {
            Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
          } finally { setActing(false); }
        }
      }
    ]);
  };

  const handleDeleteNow = async () => {
    Alert.alert('Delete Now', `Permanently delete ${user?.name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            setActing(true);
            await api.delete(`/admin/users/${userId}`);
            Toast.show({ type: 'success', text1: 'User deleted' });
            navigation.goBack();
          } catch (err) {
            Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
            setActing(false);
          }
        }
      }
    ]);
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!user) return null;

  const isDeletionPending = user.accountStatus === 'deletion_pending';

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={user.name} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        {/* Profile */}
        <View style={[styles.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[styles.avatar, { backgroundColor: C.primary + '20' }]}>
            <Text style={[styles.avatarText, { color: C.primary }]}>{user.name?.charAt(0)?.toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: C.text }]}>{user.name}</Text>
          <Text style={[styles.phone, { color: C.textSecondary }]}>{user.phone}</Text>
          {user.email && <Text style={[styles.email, { color: C.textSecondary }]}>{user.email}</Text>}
          <View style={[styles.roleBadge, { backgroundColor: C.primary + '20' }]}>
            <Text style={[styles.roleText, { color: C.primary }]}>{user.role}</Text>
          </View>
        </View>

        {isDeletionPending && (
          <View style={[styles.deletionCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Ionicons name="warning" size={20} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.deletionTitle}>Deletion Scheduled</Text>
              <Text style={styles.deletionSub}>Requested: {formatDate(user.deletionRequestedAt)}</Text>
              <Text style={styles.deletionSub}>Permanent deletion: {formatDate(user.scheduledDeletionDate)}</Text>
            </View>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Account Info</Text>
          <Row label="Joined"   value={formatDate(user.createdAt)} C={C} />
          <Row label="Status"   value={user.accountStatus === 'deletion_pending' ? 'Deletion Pending' : 'Active'} C={C} />
          <Row label="Role"     value={user.role} C={C} />
        </View>

        {isDeletionPending && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.restoreBtn, { borderColor: '#16A34A' }]} onPress={handleCancelDeletion} disabled={acting} activeOpacity={0.85}>
              <Ionicons name="refresh" size={18} color="#16A34A" />
              <Text style={[styles.restoreBtnText, { color: '#16A34A' }]}>{acting ? '…' : 'Cancel Deletion'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: '#DC2626' }]} onPress={handleDeleteNow} disabled={acting} activeOpacity={0.85}>
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={styles.deleteBtnText}>{acting ? '…' : 'Delete Now'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, C }) {
  return (
    <View style={styles.rowItem}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowVal, { color: C.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  profileCard:   { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', gap: 6 },
  avatar:        { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  avatarText:    { fontSize: 24, fontWeight: '800' },
  name:          { fontSize: 18, fontWeight: '800' },
  phone:         { fontSize: 14 },
  email:         { fontSize: 13 },
  roleBadge:     { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  roleText:      { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  deletionCard:  { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  deletionTitle: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  deletionSub:   { fontSize: 12, color: '#7F1D1D', marginTop: 2 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle:     { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowItem:       { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:      { fontSize: 13, flex: 1 },
  rowVal:        { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right', textTransform: 'capitalize' },
  actions:       { flexDirection: 'row', gap: 10 },
  restoreBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13 },
  restoreBtnText:{ fontWeight: '700', fontSize: 14 },
  deleteBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
