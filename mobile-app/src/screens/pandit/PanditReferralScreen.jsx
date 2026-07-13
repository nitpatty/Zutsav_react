import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, TextInput, ScrollView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { timeAgo, formatDate, daysUntil, isValidPhone, isValidEmail, referralStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import Field from '../../components/shared/FormField';

const STATUS_FILTERS = [
  { key: 'all',              label: 'All' },
  { key: 'PENDING_REMARK',   label: 'Action Required' },
  { key: 'OPENED',           label: 'Opened' },
  { key: 'BOOKED',           label: 'Booked' },
  { key: 'ASSIGNED',         label: 'Assigned' },
  { key: 'COMPLETED',        label: 'Completed' },
  { key: 'SETTLED',          label: 'Settled' },
  { key: 'EXPIRED',          label: 'Expired' },
];

export default function PanditReferralScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [referrals,  setReferrals]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState('all');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  // Create referral modal
  const [createModal,  setCreateModal]  = useState(false);
  const [poojas,        setPoojas]        = useState([]);
  const [userMobile,    setUserMobile]    = useState('');
  const [userEmail,     setUserEmail]     = useState('');
  const [poojaId,       setPoojaId]       = useState(null);
  const [preferredDate, setPreferredDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [performSelf,   setPerformSelf]   = useState(null); // true | false | null (unselected)
  const [referralReason, setReferralReason] = useState('');
  const [creating,      setCreating]      = useState(false);

  const fetchReferrals = useCallback(async (pg = 1, q = search, st = status, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 15 };
      if (q.trim()) params.search = q.trim();
      if (st !== 'all') params.status = st;
      const { data } = await api.get('/referral/my', { params });
      const list = data.data || data.referrals || [];
      setReferrals((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 15);
      setPage(pg);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load referrals' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, status]);

  useEffect(() => { fetchReferrals(1); }, [status]);

  useEffect(() => {
    api.get('/poojas', { params: { limit: 100 } })
      .then(({ data }) => setPoojas(data.data || data.poojas || []))
      .catch(() => {});
  }, []);

  const onRefresh = () => { setRefreshing(true); fetchReferrals(1, search, status, true); };
  const onEndReached = () => {
    if (hasMore && !loading && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchReferrals(page + 1, search, status, true).finally(() => { loadingMoreRef.current = false; });
    }
  };

  const resetCreateForm = () => {
    setUserMobile(''); setUserEmail(''); setPoojaId(null); setPreferredDate(null);
    setPerformSelf(null); setReferralReason('');
  };

  const handleCreate = async () => {
    if (!isValidPhone(userMobile.trim())) {
      Toast.show({ type: 'error', text1: 'Enter a valid 10-digit mobile number' });
      return;
    }
    if (userEmail.trim() && !isValidEmail(userEmail.trim())) {
      Toast.show({ type: 'error', text1: 'Enter a valid email or leave it blank' });
      return;
    }
    if (performSelf === null) {
      Toast.show({ type: 'error', text1: 'Select whether you will perform this pooja' });
      return;
    }
    if (performSelf === false && referralReason.trim().length < 5) {
      Toast.show({ type: 'error', text1: 'Reason is required (min 5 characters) when you won\'t perform it' });
      return;
    }
    try {
      setCreating(true);
      const body = {
        userMobile: userMobile.trim(),
        performByReferringPandit: performSelf,
      };
      if (userEmail.trim()) body.userEmail = userEmail.trim();
      if (poojaId) body.poojaId = poojaId;
      if (preferredDate) body.preferredDate = preferredDate.toISOString();
      if (performSelf === false) body.referralReason = referralReason.trim();

      const { data } = await api.post('/referral', body);
      const created = data.referral ? { ...data.referral, link: data.link } : null;
      Toast.show({ type: 'success', text1: 'Referral created!' });
      setCreateModal(false);
      resetCreateForm();
      fetchReferrals(1, search, status, true);
      if (created?._id) {
        navigation.navigate('PanditReferralDetail', { referral: created });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed to create referral' });
    } finally {
      setCreating(false);
    }
  };

  const renderItem = ({ item }) => {
    const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
    const expiryLabel = item.status === 'EXPIRED' || (days !== null && days < 0)
      ? 'Expired'
      : days !== null ? `${days}d left` : null;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
        onPress={() => navigation.navigate('PanditReferralDetail', { referral: item })}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.customer, { color: C.text }]}>{item.userMobile || '—'}</Text>
            {item.userEmail && <Text style={[styles.customerSub, { color: C.textSecondary }]} numberOfLines={1}>{item.userEmail}</Text>}
          </View>
          <StatusBadge status={item.status} colorMap={referralStatusColor} small />
        </View>
        <View style={styles.metaRow}>
          {item.poojaId?.name && <Text style={[styles.metaText, { color: C.textSecondary }]}>{item.poojaId.name}</Text>}
          {item.preferredDate && <Text style={[styles.metaText, { color: C.textSecondary }]}>· {formatDate(item.preferredDate)}</Text>}
        </View>
        <View style={styles.cardFooter}>
          <View style={[styles.performBadge, { backgroundColor: (item.performByReferringPandit ? '#16A34A' : '#D97706') + '18' }]}>
            <Text style={[styles.performText, { color: item.performByReferringPandit ? '#16A34A' : '#D97706' }]}>
              {item.performByReferringPandit ? 'Will Perform: Yes' : 'Will Perform: No'}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {expiryLabel && <Text style={[styles.expiry, { color: expiryLabel === 'Expired' ? '#DC2626' : C.textSecondary }]}>{expiryLabel}</Text>}
          <Text style={[styles.timeAgo, { color: C.textSecondary }]}>{timeAgo(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title="My Referrals"
        showBack={false}
        right={
          <TouchableOpacity onPress={() => setCreateModal(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle" size={26} color={C.primary} />
          </TouchableOpacity>
        }
      />

      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search mobile or email…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchReferrals(1, search, status)}
          />
        </View>
      </View>

      <View style={[styles.filterWrap, { borderBottomColor: C.border }]}>
        <FlatList
          horizontal data={STATUS_FILTERS} keyExtractor={(s) => s.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity style={[styles.chip, status === s.key && { backgroundColor: C.primary }]} onPress={() => setStatus(s.key)} activeOpacity={0.8}>
              <Text style={[styles.chipText, { color: status === s.key ? '#fff' : C.textSecondary }]}>{s.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading && page === 1 ? (
        <LoadingSpinner fullScreen />
      ) : (
        <FlatList
          data={referrals}
          keyExtractor={(r) => r._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState icon="people-outline" title="No referrals yet" subtitle="Tap + to refer a new customer" actionLabel="Create Referral" onAction={() => setCreateModal(true)} />
          }
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}

      {/* Create Referral Modal */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface, maxHeight: '88%' }]}>
            <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: C.text }]}>New Referral</Text>

              <Field label="Customer Mobile *" C={C}>
                <TextInput
                  style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                  value={userMobile}
                  onChangeText={setUserMobile}
                  placeholder="9876543210"
                  placeholderTextColor={C.textSecondary}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </Field>

              <Field label="Customer Email (optional)" C={C}>
                <TextInput
                  style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                  value={userEmail}
                  onChangeText={setUserEmail}
                  placeholder="customer@example.com"
                  placeholderTextColor={C.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </Field>

              <Field label="Recommended Pooja (optional)" C={C}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {poojas.map((p) => (
                    <TouchableOpacity
                      key={p._id}
                      style={[styles.pill, { borderColor: C.border }, poojaId === p._id && { backgroundColor: C.primary, borderColor: C.primary }]}
                      onPress={() => setPoojaId(poojaId === p._id ? null : p._id)}
                    >
                      <Text style={[styles.pillText, { color: poojaId === p._id ? '#fff' : C.text }]} numberOfLines={1}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Field>

              <Field label="Preferred Date (optional)" C={C}>
                <TouchableOpacity style={[styles.input, { borderColor: C.border, backgroundColor: C.background, justifyContent: 'center' }]} onPress={() => setShowDatePicker(true)}>
                  <Text style={{ color: preferredDate ? C.text : C.textSecondary, fontSize: 14 }}>
                    {preferredDate ? formatDate(preferredDate) : 'Select a date'}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={preferredDate || new Date()}
                    mode="date"
                    minimumDate={new Date()}
                    onChange={(event, date) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (event.type === 'set' && date) setPreferredDate(date);
                    }}
                  />
                )}
              </Field>

              <Field label="Will you perform this Pooja? *" C={C}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.segBtn, { borderColor: C.border }, performSelf === true && { backgroundColor: '#16A34A', borderColor: '#16A34A' }]}
                    onPress={() => setPerformSelf(true)}
                  >
                    <Text style={[styles.segText, { color: performSelf === true ? '#fff' : C.text }]}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segBtn, { borderColor: C.border }, performSelf === false && { backgroundColor: '#D97706', borderColor: '#D97706' }]}
                    onPress={() => setPerformSelf(false)}
                  >
                    <Text style={[styles.segText, { color: performSelf === false ? '#fff' : C.text }]}>No</Text>
                  </TouchableOpacity>
                </View>
              </Field>

              {performSelf === false && (
                <Field label="Reason (required) *" C={C}>
                  <TextInput
                    style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background, height: 80 }]}
                    value={referralReason}
                    onChangeText={setReferralReason}
                    placeholder="Why won't you personally perform this pooja?"
                    placeholderTextColor={C.textSecondary}
                    multiline
                  />
                </Field>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => { setCreateModal(false); resetCreateForm(); }}>
                  <Text style={[styles.cancelBtnText, { color: C.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: C.primary }]} onPress={handleCreate} disabled={creating} activeOpacity={0.85}>
                  <Text style={styles.submitBtnText}>{creating ? 'Creating…' : 'Create Referral'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  filterWrap:  { borderBottomWidth: StyleSheet.hairlineWidth },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipText:    { fontSize: 11, fontWeight: '600' },
  card:        { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  customer:    { fontSize: 15, fontWeight: '700' },
  customerSub: { fontSize: 12, marginTop: 2 },
  metaRow:     { flexDirection: 'row', gap: 4 },
  metaText:    { fontSize: 12 },
  cardFooter:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  performBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  performText: { fontSize: 10, fontWeight: '700' },
  expiry:      { fontSize: 11, fontWeight: '600' },
  timeAgo:     { fontSize: 11 },
  modalOverlay:{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle:  { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  input: {
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, textAlignVertical: 'top',
  },
  pill:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, maxWidth: 160 },
  pillText:    { fontSize: 12, fontWeight: '600' },
  segBtn:      { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  segText:     { fontSize: 14, fontWeight: '700' },
  modalBtns:   { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:   { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText:{ fontSize: 15, fontWeight: '600' },
  submitBtn:   { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
