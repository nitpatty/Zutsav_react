import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../../store/themeStore';
import useAddresses from '../../hooks/useAddresses';
import AddressCard from './AddressCard';
import AddressFormSheet from './AddressFormSheet';
import PincodeInput from './PincodeInput';
import { PrimaryButton, OutlineButton } from './AppButton';

const LABELS = ['Home', 'Office', 'Other'];
const NEW = '__new__';

/**
 * Shared saved-address module — the single source of address UI reused by:
 *  - Profile → Saved Addresses (mode="manager"): full CRUD, no selection.
 *  - Booking/checkout flows (mode="picker"): select a saved address, or
 *    enter a one-off address inline (optionally saving it for later).
 *
 * Props:
 *   value    – { address, pincode, state, city, district } currently selected/entered
 *   onChange – (fields) => void, called on selection or inline-field edits
 *   allowInlineNew – if true (picker mode), shows an "enter a new address" option
 *   mode     – 'picker' | 'manager'
 */
export default function AddressPicker({ value = {}, onChange, allowInlineNew = false, mode = 'picker' }) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { addresses, loading, addAddress, updateAddress, deleteAddress } = useAddresses();

  const [selectedId, setSelectedId] = useState(mode === 'picker' && allowInlineNew ? NEW : null);
  const [saveNew, setSaveNew] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Home');
  const [savingNew, setSavingNew] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);

  const autoSelectedRef = useRef(false);

  // Picker mode: auto-select the default saved address the first time the
  // list loads, mirroring the previous inline behavior in BookingFlowScreen.
  useEffect(() => {
    if (mode !== 'picker' || autoSelectedRef.current || loading) return;
    if (addresses.length === 0) return;
    const def = addresses.find((a) => a.isDefault) || addresses[0];
    autoSelectedRef.current = true;
    setSelectedId(def._id);
    onChange({ address: def.address || '', pincode: def.pincode || '', state: def.state || '', city: def.city || '', district: def.district || '' });
  }, [addresses, loading, mode]);

  const selectSaved = (addr) => {
    setSelectedId(addr._id);
    onChange({ address: addr.address || '', pincode: addr.pincode || '', state: addr.state || '', city: addr.city || '', district: addr.district || '' });
  };

  const selectNew = () => {
    setSelectedId(NEW);
    onChange({ address: '', pincode: '', state: '', city: '', district: '' });
  };

  const handleSaveInlineAddress = async () => {
    if (!value.address || !value.pincode) {
      Toast.show({ type: 'error', text1: 'Enter address and pincode first' });
      return;
    }
    try {
      setSavingNew(true);
      const updated = await addAddress({
        label: saveLabel, address: value.address, pincode: value.pincode,
        state: value.state, city: value.city, district: value.district, isDefault: false,
      });
      const created = updated[updated.length - 1];
      if (created) selectSaved(created);
      setSaveNew(false);
      Toast.show({ type: 'success', text1: 'Address saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not save address' });
    } finally {
      setSavingNew(false);
    }
  };

  const openAdd = () => { setEditingAddr(null); setSheetVisible(true); };
  const openEdit = (addr) => { setEditingAddr(addr); setSheetVisible(true); };

  const handleSheetSave = async (fields) => {
    try {
      if (editingAddr) {
        await updateAddress(editingAddr._id, fields);
        Toast.show({ type: 'success', text1: 'Address updated' });
      } else {
        await addAddress(fields);
        Toast.show({ type: 'success', text1: 'Address added' });
      }
      setSheetVisible(false);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not save address' });
    }
  };

  const handleDelete = (addr) => {
    Alert.alert('Delete Address', `Remove "${addr.label}" address?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteAddress(addr._id);
            if (selectedId === addr._id) setSelectedId(null);
          } catch (err) {
            Toast.show({ type: 'error', text1: 'Could not delete address' });
          }
        },
      },
    ]);
  };

  if (loading) return <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />;

  return (
    <View style={{ gap: 10 }}>
      {mode === 'manager' && addresses.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 28, gap: 10 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="location-outline" size={28} color={C.primary} />
          </View>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>No saved addresses yet</Text>
          <Text style={{ color: C.textSecondary, fontSize: 12, textAlign: 'center' }}>Add an address to speed up future bookings</Text>
        </View>
      )}

      {addresses.map((addr) => (
        <AddressCard
          key={addr._id}
          address={addr}
          selected={mode === 'picker' && selectedId === addr._id}
          onSelect={mode === 'picker' ? () => selectSaved(addr) : undefined}
          onEdit={mode === 'manager' ? () => openEdit(addr) : undefined}
          onDelete={mode === 'manager' ? () => handleDelete(addr) : undefined}
        />
      ))}

      {mode === 'picker' && allowInlineNew && (
        <TouchableOpacity
          style={[
            styles.newRow,
            { borderColor: selectedId === NEW ? C.primary : C.borderLight, backgroundColor: selectedId === NEW ? C.primary + '0D' : C.surface },
          ]}
          onPress={selectNew}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={18} color={C.textSecondary} />
          <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '600' }}>Enter a new address</Text>
        </TouchableOpacity>
      )}

      {mode === 'picker' && selectedId === NEW && (
        <View style={[styles.formCard, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <View>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Address *</Text>
            <TextInput
              style={[styles.input, { borderColor: C.borderLight, backgroundColor: C.background, color: C.text, height: 70, textAlignVertical: 'top' }]}
              value={value.address}
              onChangeText={(v) => onChange({ ...value, address: v })}
              placeholder="House no., street, area…"
              placeholderTextColor={C.textSecondary}
              multiline
            />
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pincode *</Text>
            <PincodeInput
              value={value.pincode}
              onChange={(v) => onChange({ ...value, pincode: v })}
              onFill={({ state, city, district }) => onChange({ ...value, state, city, district })}
            />
          </View>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>City</Text>
              <TextInput style={[styles.input, { borderColor: C.borderLight, backgroundColor: C.background, color: C.text }]} value={value.city} onChangeText={(v) => onChange({ ...value, city: v })} placeholder="City" placeholderTextColor={C.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>State</Text>
              <TextInput style={[styles.input, { borderColor: C.borderLight, backgroundColor: C.background, color: C.text }]} value={value.state} onChangeText={(v) => onChange({ ...value, state: v })} placeholder="State" placeholderTextColor={C.textSecondary} />
            </View>
          </View>

          <TouchableOpacity style={styles.saveToggleRow} onPress={() => setSaveNew(!saveNew)} activeOpacity={0.8}>
            <Ionicons name={saveNew ? 'checkbox' : 'square-outline'} size={20} color={C.primary} />
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '500' }}>Save this address for future bookings</Text>
          </TouchableOpacity>

          {saveNew && (
            <View style={{ gap: 10 }}>
              <View style={styles.labelPills}>
                {LABELS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.pill, { borderColor: saveLabel === l ? C.primary : C.borderLight, backgroundColor: saveLabel === l ? C.primary : C.background }]}
                    onPress={() => setSaveLabel(l)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: saveLabel === l ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <PrimaryButton title={savingNew ? 'Saving…' : 'Save Address'} onPress={handleSaveInlineAddress} loading={savingNew} disabled={savingNew} C={C} fullWidth />
            </View>
          )}
        </View>
      )}

      {mode === 'manager' && (
        <OutlineButton
          title="Add New Address"
          icon={<Ionicons name="add" size={18} color={C.primary} />}
          onPress={openAdd}
          C={C}
          fullWidth
        />
      )}

      <AddressFormSheet
        visible={sheetVisible}
        initialValues={editingAddr}
        onSave={handleSheetSave}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  newRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, padding: 14 },
  formCard: {
    borderRadius: 18, padding: 16, gap: 12,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  fieldLabel:    { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  fieldRow:      { flexDirection: 'row', gap: 10 },
  input:         { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  saveToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  labelPills:    { flexDirection: 'row', gap: 8 },
  pill:          { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
});
