import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import PincodeInput from './PincodeInput';

const LABELS = ['Home', 'Office', 'Other'];

const emptyForm = { label: 'Home', address: '', pincode: '', state: '', city: '', district: '', isDefault: false };

// Add/edit address form, presented as a modal sheet.
//   visible       – bool
//   initialValues – address object to edit, or null/undefined to add
//   onSave        – (fields) => Promise<void>
//   onClose       – () => void
export default function AddressFormSheet({ visible, initialValues, onSave, onClose }) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(initialValues ? { ...emptyForm, ...initialValues } : emptyForm);
    }
  }, [visible, initialValues]);

  const set = (patch) => setForm((p) => ({ ...p, ...patch }));

  const isValid = form.address.trim().length > 0 && form.pincode.trim().length === 6;

  const handleSave = async () => {
    if (!isValid) return;
    try {
      setSaving(true);
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={[styles.sheet, { backgroundColor: C.surface }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: C.text }]}>{initialValues ? 'Edit Address' : 'Add Address'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              <View style={styles.labelPills}>
                {LABELS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.pill, { borderColor: form.label === l ? C.primary : C.border, backgroundColor: form.label === l ? C.primary : C.background }]}
                    onPress={() => set({ label: l })}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: form.label === l ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Address *</Text>
                <TextInput
                  style={[styles.input, { borderColor: C.border, color: C.text, height: 70, textAlignVertical: 'top' }]}
                  value={form.address}
                  onChangeText={(v) => set({ address: v })}
                  placeholder="House no., street, area…"
                  placeholderTextColor={C.textSecondary}
                  multiline
                />
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pincode *</Text>
                <PincodeInput
                  value={form.pincode}
                  onChange={(v) => set({ pincode: v })}
                  onFill={({ state, city, district }) => set({ state, city, district })}
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>City</Text>
                  <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={form.city} onChangeText={(v) => set({ city: v })} placeholder="City" placeholderTextColor={C.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>District</Text>
                  <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={form.district} onChangeText={(v) => set({ district: v })} placeholder="District" placeholderTextColor={C.textSecondary} />
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>State</Text>
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={form.state} onChangeText={(v) => set({ state: v })} placeholder="State" placeholderTextColor={C.textSecondary} />
              </View>

              <TouchableOpacity style={styles.defaultRow} onPress={() => set({ isDefault: !form.isDefault })} activeOpacity={0.8}>
                <Ionicons name={form.isDefault ? 'checkbox' : 'square-outline'} size={20} color={C.primary} />
                <Text style={[styles.defaultLabel, { color: C.text }]}>Set as default address</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: C.primary, opacity: isValid ? 1 : 0.5 }]}
                onPress={handleSave}
                disabled={!isValid || saving}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Address'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title:        { fontSize: 18, fontWeight: '800' },
  labelPills:   { flexDirection: 'row', gap: 8 },
  pill:         { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  fieldLabel:   { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  fieldRow:     { flexDirection: 'row', gap: 10 },
  input:        { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  defaultRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  defaultLabel: { fontSize: 13, fontWeight: '500' },
  saveBtn:      { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
