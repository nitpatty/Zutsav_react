import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { COLORS } from '../../theme/tokens';
import { formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';
import StickyActionBar, { useStickyActionBarHeight } from '../../components/pandit/StickyActionBar';

export default function PanditPoojaServicesScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const actionBarHeight = useStickyActionBarHeight();

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [poojas,  setPoojas]  = useState([]);
  const [selected, setSelected] = useState({}); // { [poojaId]: expectedCharges }
  const [approvedInfo, setApprovedInfo] = useState({}); // { [poojaId]: {approvedPrice, priceApprovalStatus} }

  const fetchPoojas = useCallback(async (q = search) => {
    try {
      const { data } = await api.get('/pandits/catalog-poojas', { params: q.trim() ? { search: q.trim() } : {} });
      setPoojas(data.poojas || []);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load pooja catalog' });
    }
  }, [search]);

  useEffect(() => {
    Promise.all([api.get('/pandits/me'), fetchPoojas('')])
      .then(([profileRes]) => {
        const p = profileRes.data.pandit;
        const sel = {};
        const approved = {};
        (p.poojaCharges || []).forEach((c) => {
          sel[c.poojaId] = String(c.expectedCharges || '');
          if (c.priceApprovalStatus === 'approved') approved[c.poojaId] = c.approvedPrice;
        });
        (p.selectedPoojas || []).forEach((id) => { if (!(id in sel)) sel[id] = ''; });
        setSelected(sel);
        setApprovedInfo(approved);
      })
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load profile' }))
      .finally(() => setLoading(false));
  }, []);

  const toggleSelect = (poojaId) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (poojaId in next) delete next[poojaId];
      else next[poojaId] = '';
      return next;
    });
  };

  const setCharge = (poojaId, val) => setSelected((prev) => ({ ...prev, [poojaId]: val.replace(/\D/g, '') }));

  const handleSave = async () => {
    try {
      setSaving(true);
      const selectedPoojas = Object.keys(selected);
      const poojaCharges = selectedPoojas.map((poojaId) => ({ poojaId, expectedCharges: Number(selected[poojaId]) || 0 }));
      await api.patch('/pandits/me/pooja-services', { selectedPoojas, poojaCharges });
      Toast.show({ type: 'success', text1: 'Pooja services saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const selectedCount = Object.keys(selected).length;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Pooja Services" />
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search poojas…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchPoojas(search)}
          />
        </View>
        <Text style={[styles.countText, { color: C.textSecondary }]}>{selectedCount} selected</Text>
      </View>

      <FlatList
        data={poojas}
        keyExtractor={(p) => p._id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: actionBarHeight }}
        ListEmptyComponent={<EmptyState icon="flame-outline" title="No poojas found" />}
        renderItem={({ item }) => {
          const isSelected = item._id in selected;
          const approvedPrice = approvedInfo[item._id];
          return (
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: isSelected ? C.primary : C.border }]}>
              <TouchableOpacity style={styles.cardTop} onPress={() => toggleSelect(item._id)} activeOpacity={0.8}>
                <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={22} color={isSelected ? C.primary : C.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.poojaName, { color: C.text }]}>{item.name}</Text>
                  {item.categoryId?.name && <Text style={[styles.poojaCat, { color: C.textSecondary }]}>{item.categoryId.name}</Text>}
                </View>
              </TouchableOpacity>
              {isSelected && (
                <View style={styles.chargeRow}>
                  <TextInput
                    style={[styles.chargeInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                    value={selected[item._id]}
                    onChangeText={(v) => setCharge(item._id, v)}
                    placeholder="Expected charge (₹)"
                    placeholderTextColor={C.textSecondary}
                    keyboardType="number-pad"
                  />
                  {approvedPrice != null && (
                    <Text style={[styles.approvedBadge, { color: '#16A34A' }]}>Admin approved: {formatCurrency(approvedPrice)}</Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      <StickyActionBar>
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </StickyActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  countText:   { fontSize: 11, fontWeight: '600' },
  card:        { borderRadius: 14, borderWidth: 1.5, padding: 12, gap: 10 },
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  poojaName:   { fontSize: 14, fontWeight: '700' },
  poojaCat:    { fontSize: 11, marginTop: 2 },
  chargeRow:   { gap: 6 },
  chargeInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  approvedBadge: { fontSize: 11, fontWeight: '700' },
  saveBtn:     { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
