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

const CURRENT_YEAR = new Date().getFullYear();
const emptyQualification = () => ({ category: '', customName: '', description: '', certificationDetails: '', institution: '', passingYear: '' });

export default function PanditEducationScreen() {
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [masters, setMasters] = useState([]);
  const [qualifications, setQualifications] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/pandits/me'), api.get('/masters/education-masters')])
      .then(([profileRes, mastersRes]) => {
        const list = profileRes.data.pandit.qualifications || [];
        setQualifications(list.length ? list : [emptyQualification()]);
        setMasters((mastersRes.data.masters || []).filter((m) => m.isActive !== false));
      })
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load education info' }))
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (idx, field, value) => {
    setQualifications((prev) => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };
  const addRow = () => setQualifications((prev) => [...prev, emptyQualification()]);
  const removeRow = (idx) => setQualifications((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const cleaned = qualifications
      .filter((q) => q.category.trim())
      .map((q) => ({ ...q, passingYear: q.passingYear ? Number(q.passingYear) : undefined }));
    try {
      setSaving(true);
      await api.patch('/pandits/me/qualifications', { qualifications: cleaned });
      Toast.show({ type: 'success', text1: 'Education details saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Education" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: tabBarClearance + 24 }}>
        {qualifications.map((q, idx) => {
          const selectedMaster = masters.find((m) => m.name === q.category);
          return (
            <View key={idx} style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: C.text }]}>Qualification {idx + 1}</Text>
                {qualifications.length > 1 && (
                  <TouchableOpacity onPress={() => removeRow(idx)}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {masters.map((m) => (
                  <TouchableOpacity
                    key={m._id}
                    style={[styles.pill, { borderColor: C.border }, q.category === m.name && { backgroundColor: C.primary, borderColor: C.primary }]}
                    onPress={() => updateRow(idx, 'category', m.name)}
                  >
                    <Text style={{ color: q.category === m.name ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {selectedMaster?.allowCustom && (
                <TextInput
                  style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                  value={q.customName}
                  onChangeText={(v) => updateRow(idx, 'customName', v)}
                  placeholder="Specify qualification name…"
                  placeholderTextColor={C.textSecondary}
                />
              )}

              <TextInput
                style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                value={q.institution}
                onChangeText={(v) => updateRow(idx, 'institution', v)}
                placeholder="Institution / University"
                placeholderTextColor={C.textSecondary}
              />
              <TextInput
                style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                value={String(q.passingYear || '')}
                onChangeText={(v) => updateRow(idx, 'passingYear', v.replace(/\D/g, '').slice(0, 4))}
                placeholder="Passing Year"
                placeholderTextColor={C.textSecondary}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background, height: 70, textAlignVertical: 'top' }]}
                value={q.description}
                onChangeText={(v) => updateRow(idx, 'description', v)}
                placeholder="Description (optional)"
                placeholderTextColor={C.textSecondary}
                multiline
              />
            </View>
          );
        })}

        <TouchableOpacity style={[styles.addBtn, { borderColor: C.primary }]} onPress={addRow}>
          <Ionicons name="add" size={16} color={C.primary} />
          <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Add Another Qualification</Text>
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
  card:       { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle:  { fontSize: 14, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  pill:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, borderStyle: 'dashed',
  },
  saveBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
