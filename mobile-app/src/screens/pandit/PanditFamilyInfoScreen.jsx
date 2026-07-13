import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const MARITAL_STATUSES = [
  { key: 'single',   label: 'Single' },
  { key: 'married',  label: 'Married' },
  { key: 'widowed',  label: 'Widowed' },
  { key: 'divorced', label: 'Divorced' },
];

export default function PanditFamilyInfoScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [maritalStatus, setMaritalStatus] = useState('');
  const [spouseName,    setSpouseName]    = useState('');
  const [children,      setChildren]      = useState(0);
  const [members,       setMembers]       = useState([]);

  useEffect(() => {
    api.get('/pandits/me')
      .then(({ data }) => {
        const f = data.pandit.familyInfo || {};
        setMaritalStatus(f.maritalStatus || '');
        setSpouseName(f.spouseName || '');
        setChildren(f.children || 0);
        setMembers(f.members || []);
      })
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load family info' }))
      .finally(() => setLoading(false));
  }, []);

  const updateMember = (idx, field, value) => setMembers((prev) => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  const addMember = () => setMembers((prev) => [...prev, { name: '', relation: '', age: '' }]);
  const removeMember = (idx) => setMembers((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.patch('/pandits/me/family', {
        maritalStatus, spouseName: maritalStatus === 'married' ? spouseName.trim() : '',
        children: Number(children) || 0,
        members: members.filter((m) => m.name.trim()).map((m) => ({ ...m, age: Number(m.age) || 0 })),
      });
      Toast.show({ type: 'success', text1: 'Family information saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Family Information" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <View style={{ gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Marital Status</Text>
          <View style={styles.chipsWrap}>
            {MARITAL_STATUSES.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, { borderColor: C.border }, maritalStatus === s.key && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => setMaritalStatus(s.key)}
              >
                <Text style={{ color: maritalStatus === s.key ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {maritalStatus === 'married' && (
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Spouse Name</Text>
            <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={spouseName} onChangeText={setSpouseName} placeholderTextColor={C.textSecondary} />
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Number of Children</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity style={[styles.counterBtn, { borderColor: C.border }]} onPress={() => setChildren((c) => Math.max(0, c - 1))}>
              <Ionicons name="remove" size={18} color={C.text} />
            </TouchableOpacity>
            <Text style={[styles.counterVal, { color: C.text }]}>{children}</Text>
            <TouchableOpacity style={[styles.counterBtn, { borderColor: C.border }]} onPress={() => setChildren((c) => c + 1)}>
              <Ionicons name="add" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Family Members</Text>
          {members.map((m, idx) => (
            <View key={idx} style={[styles.memberCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: C.text }]}>Member {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeMember(idx)}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>
              <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]} value={m.name} onChangeText={(v) => updateMember(idx, 'name', v)} placeholder="Name" placeholderTextColor={C.textSecondary} />
              <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]} value={m.relation} onChangeText={(v) => updateMember(idx, 'relation', v)} placeholder="Relation" placeholderTextColor={C.textSecondary} />
              <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]} value={String(m.age || '')} onChangeText={(v) => updateMember(idx, 'age', v.replace(/\D/g, ''))} placeholder="Age" placeholderTextColor={C.textSecondary} keyboardType="number-pad" />
            </View>
          ))}
          <TouchableOpacity style={[styles.addBtn, { borderColor: C.primary }]} onPress={addMember}>
            <Ionicons name="add" size={16} color={C.primary} />
            <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Add Family Member</Text>
          </TouchableOpacity>
        </View>

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
  chipsWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  counterBtn: { width: 40, height: 40, borderWidth: 1.5, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  counterVal: { fontSize: 20, fontWeight: '800', minWidth: 30, textAlign: 'center' },
  memberCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle:  { fontSize: 13, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, borderStyle: 'dashed',
  },
  saveBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
