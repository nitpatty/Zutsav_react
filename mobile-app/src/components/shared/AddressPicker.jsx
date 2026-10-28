import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../../store/themeStore';
import { useTranslation } from '../../i18n';
import useAddresses from '../../hooks/useAddresses';
import AddressCard from './AddressCard';
import AddressFormSheet from './AddressFormSheet';
import PincodeInput from './PincodeInput';
import LocationSearch from './LocationSearch';
import MapPicker from './MapPicker';
import { reverseGeocodeLocation } from '../../services/geocodingService';
import {
  changesAddress, coordsFromSelection, fieldsFromSelection, formatPinLabel, hasPair, pairForSave,
} from '../../utils/locationPin';
import { PrimaryButton, OutlineButton } from './AppButton';
import { ADDRESS_LABELS as LABELS, addressLabelText } from '../../utils/addressLabels';
const NEW = '__new__';

/**
 * Shared saved-address module — the single source of address UI reused by:
 *  - Profile → Saved Addresses (mode="manager"): full CRUD, no selection.
 *  - Booking/checkout flows (mode="picker"): select a saved address, or
 *    enter a one-off address inline (optionally saving it for later).
 *
 * Props:
 *   value    – { address, pincode, state, city, district, latitude, longitude } currently selected/entered.
 *              Callers should pass latitude/longitude back in so a manual address edit can clear them.
 *   onChange – (fields) => void, called on selection or inline-field edits. A manual edit of an address field
 *              emits `latitude: null, longitude: null`: the old pin no longer matches the address (see utils/locationPin.js).
 *   allowInlineNew – if true (picker mode), shows an "enter a new address" option
 *   mode     – 'picker' | 'manager'
 */
export default function AddressPicker({ value = {}, onChange, allowInlineNew = false, mode = 'picker' }) {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { addresses, loading, addAddress, updateAddress, deleteAddress } = useAddresses();

  const [selectedId, setSelectedId] = useState(mode === 'picker' && allowInlineNew ? NEW : null);
  const [saveNew, setSaveNew] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Home');
  const [savingNew, setSavingNew] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);
  const [mapVisible, setMapVisible] = useState(false);
  // UI only — the data itself lives in `value`. Where the current pin came from, and whether an edit just cleared it.
  const [pinSource, setPinSource] = useState(null);
  const [pinCleared, setPinCleared] = useState(false);

  const autoSelectedRef = useRef(false);

  const fieldsOf = (addr) => ({
    address: addr.address || '', pincode: addr.pincode || '', state: addr.state || '', city: addr.city || '', district: addr.district || '',
    ...pairForSave(addr),
  });

  // Picker mode: auto-select the default saved address the first time the
  // list loads, mirroring the previous inline behavior in BookingFlowScreen.
  useEffect(() => {
    if (mode !== 'picker' || autoSelectedRef.current || loading) return;
    if (addresses.length === 0) return;
    const def = addresses.find((a) => a.isDefault) || addresses[0];
    autoSelectedRef.current = true;
    setSelectedId(def._id);
    setPinSource('saved');
    setPinCleared(false);
    onChange(fieldsOf(def));
  }, [addresses, loading, mode]);

  const selectSaved = (addr) => {
    setSelectedId(addr._id);
    setPinSource('saved');
    setPinCleared(false);
    onChange(fieldsOf(addr));
  };

  const selectNew = () => {
    setSelectedId(NEW);
    setPinSource(null);
    setPinCleared(false);
    onChange({ address: '', pincode: '', state: '', city: '', district: '', latitude: null, longitude: null });
  };

  // Manual edits of an address field. Programmatic fills (pincode lookup → onFill, search → handlePlaceSelected)
  // do not go through here, so they can never invalidate the pin they belong to.
  const edit = (patch) => {
    const addressChanged = changesAddress(value, patch);
    onChange({ ...value, ...patch, ...(addressChanged ? { latitude: null, longitude: null } : {}) });
    if (addressChanged && hasPair(value)) setPinCleared(true);
  };

  const handlePlaceSelected = (selection) => {
    const coords = coordsFromSelection(selection);
    if (!coords) return; // never attach an invalid point
    onChange({ ...value, ...fieldsFromSelection(selection, value.address), latitude: coords.latitude, longitude: coords.longitude });
    setPinSource('search');
    setPinCleared(false);
  };

  const handleSaveInlineAddress = async () => {
    if (!value.address || !value.pincode) {
      Toast.show({ type: 'error', text1: t('address.enterAddressFirst') });
      return;
    }
    try {
      setSavingNew(true);
      const updated = await addAddress({
        label: saveLabel, address: value.address, pincode: value.pincode,
        state: value.state, city: value.city, district: value.district,
        ...pairForSave(value), // both coordinates or neither
        isDefault: false,
      });
      const created = updated[updated.length - 1];
      if (created) selectSaved(created);
      setSaveNew(false);
      Toast.show({ type: 'success', text1: t('address.saved') });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || t('address.saveFailed') });
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
        Toast.show({ type: 'success', text1: t('address.updated') });
      } else {
        await addAddress(fields);
        Toast.show({ type: 'success', text1: t('address.added') });
      }
      setSheetVisible(false);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || t('address.saveFailed') });
    }
  };

  const handleDelete = (addr) => {
    Alert.alert(t('address.deleteTitle'), t('address.deleteConfirm', { label: addressLabelText(addr.label, t) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('address.delete'), style: 'destructive', onPress: async () => {
          try {
            await deleteAddress(addr._id);
            if (selectedId === addr._id) setSelectedId(null);
          } catch (err) {
            Toast.show({ type: 'error', text1: t('address.deleteFailed') });
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
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{t('address.emptyTitle')}</Text>
          <Text style={{ color: C.textSecondary, fontSize: 12, textAlign: 'center' }}>{t('address.emptyHint')}</Text>
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
          <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('address.enterNew')}</Text>
        </TouchableOpacity>
      )}

      {mode === 'picker' && selectedId === NEW && (
        <View style={[styles.formCard, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('location.searchLabel')}</Text>
          <LocationSearch onSelect={handlePlaceSelected} />
        </View>

        <TouchableOpacity style={[styles.mapBtn, { borderColor: C.borderLight, backgroundColor: C.background }]} onPress={() => setMapVisible(true)} activeOpacity={0.85} accessibilityRole="button">
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
            {formatPinLabel({ latitude: value.latitude, longitude: value.longitude }, pinSource || 'saved', t)}
          </Text>
        </TouchableOpacity>
        {pinCleared && !hasPair(value) && (
          <Text style={{ color: '#B45309', fontSize: 12 }} testID="stale-pin-notice">{t('location.stalePinNotice')}</Text>
        )}

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.addressRequired')}</Text>
          <TextInput
            style={[styles.input, { borderColor: C.borderLight, backgroundColor: C.background, color: C.text, height: 70, textAlignVertical: 'top' }]}
            value={value.address}
            onChangeText={(v) => edit({ address: v })}
            placeholder={t('address.placeholder')}
            placeholderTextColor={C.textSecondary}
            multiline
          />
        </View>
          <View>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.pincodeRequired')}</Text>
            <PincodeInput
              value={value.pincode}
              onChange={(v) => edit({ pincode: v })}
              onFill={({ state, city, district }) => onChange({ ...value, state, city, district })}
            />
          </View>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.city')}</Text>
              <TextInput style={[styles.input, { borderColor: C.borderLight, backgroundColor: C.background, color: C.text }]} value={value.city} onChangeText={(v) => edit({ city: v })} placeholder={t('address.city')} placeholderTextColor={C.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.state')}</Text>
              <TextInput style={[styles.input, { borderColor: C.borderLight, backgroundColor: C.background, color: C.text }]} value={value.state} onChangeText={(v) => edit({ state: v })} placeholder={t('address.state')} placeholderTextColor={C.textSecondary} />
            </View>
          </View>

          <TouchableOpacity style={styles.saveToggleRow} onPress={() => setSaveNew(!saveNew)} activeOpacity={0.8}>
            <Ionicons name={saveNew ? 'checkbox' : 'square-outline'} size={20} color={C.primary} />
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '500' }}>{t('address.saveForLater')}</Text>
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
                    <Text style={{ color: saveLabel === l ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{addressLabelText(l, t)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <PrimaryButton title={savingNew ? t('address.saving') : t('address.save')} onPress={handleSaveInlineAddress} loading={savingNew} disabled={savingNew} C={C} fullWidth />
            </View>
          )}
        </View>
      )}

      {mode === 'manager' && (
        <OutlineButton
          title={t('address.addNew')}
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

      <MapPicker
        visible={mapVisible}
        initialCoords={hasPair(value) ? { latitude: value.latitude, longitude: value.longitude } : null}
        onConfirm={async (c, meta) => {
          onChange({ ...value, latitude: c.latitude, longitude: c.longitude });
          setPinSource(meta?.source === 'gps' ? 'gps' : 'map');
          setPinCleared(false);
          setMapVisible(false);
          if (!value.address?.trim()) {
            const { displayName } = await reverseGeocodeLocation(c.latitude, c.longitude);
            if (displayName) onChange({ ...value, address: displayName, latitude: c.latitude, longitude: c.longitude });
          }
        }}
        onClose={() => setMapVisible(false)}
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
  mapBtn:       { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  labelPills:    { flexDirection: 'row', gap: 8 },
  pill:          { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
});
