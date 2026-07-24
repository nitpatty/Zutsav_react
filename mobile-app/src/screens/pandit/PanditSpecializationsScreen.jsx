import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';
import { COLORS } from '../../theme/tokens';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function PanditSpecializationsScreen() {
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [masters, setMasters] = useState([]);
  const [experience, setExperience] = useState('');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/pandits/me'), api.get('/masters/specialization-masters')])
      .then(([profileRes, mastersRes]) => {
        const p = profileRes.data.pandit;
        setExperience(String(p.experience || ''));
        setRows((p.specializations || []).length ? p.specializations : [{ name: '', yearsOfExperience: '' }]);
        setMasters((mastersRes.data.masters || []).filter((m) => m.isActive !== false));
      })
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load specializations' }))
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (idx, field, value) => setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  const addRow = () => setRows((prev) => [...prev, { name: '', yearsOfExperience: '' }]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const availableFor = (idx) => masters.filter((m) => !rows.some((r, i) => i !== idx && r.name === m.name));

  const handleSave = async () => {
    const cleaned = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name, yearsOfExperience: Number(r.yearsOfExperience) || 0 }));
    if (cleaned.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one specialization' });
      return;
    }
    try {
      setSaving(true);
      await api.patch('/pandits/me/specializations', { specializations: cleaned, experience: Number(experience) || 0 });
      Toast.show({ type: 'success', text1: 'Specializations saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Experience & Specializations" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: tabBarClearance + 24 }}>
        <View style={{ gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Overall Experience (years)</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]}
            value={experience}
            onChangeText={(v) => setExperience(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholderTextColor={C.textSecondary}
          />
        </View>

        {rows.map((r, idx) => (
          <View key={idx} style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Specialization {idx + 1}</Text>
              {rows.length > 1 && (
                <TouchableOpacity onPress={() => removeRow(idx)}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {availableFor(idx).map((m) => (
                <TouchableOpacity
                  key={m._id}
                  style={[styles.pill, { borderColor: C.border }, r.name === m.name && { backgroundColor: C.primary, borderColor: C.primary }]}
                  onPress={() => updateRow(idx, 'name', m.name)}
                >
                  <Text style={{ color: r.name === m.name ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              value={String(r.yearsOfExperience || '')}
              onChangeText={(v) => updateRow(idx, 'yearsOfExperience', v.replace(/\D/g, ''))}
              placeholder="Years of experience"
              placeholderTextColor={C.textSecondary}
              keyboardType="number-pad"
            />
          </View>
        ))}

        <TouchableOpacity style={[styles.addBtn, { borderColor: C.primary }]} onPress={addRow}>
          <Ionicons name="add" size={16} color={C.primary} />
          <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Add Another Specialization</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  card:       { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle:  { fontSize: 14, fontWeight: '700' },
  pill:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, borderStyle: 'dashed',
  },
  saveBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
