import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import PincodeInput from './PincodeInput';
import LocationSearch from './LocationSearch';
import MapPicker from './MapPicker';
import { reverseGeocodeLocation } from '../../services/geocodingService';
import useLocationPin from '../../hooks/useLocationPin';
import { changesAddress, coordsFromSelection, fieldsFromSelection, formatPinLabel } from '../../utils/locationPin';
import { useTranslation } from '../../i18n';
import { ADDRESS_LABELS as LABELS, addressLabelText } from '../../utils/addressLabels';

// Coordinates are not form fields: they live in the pin state (see utils/locationPin.js) and are attached on save.
const emptyForm = { label: 'Home', address: '', pincode: '', state: '', city: '', district: '', isDefault: false };

// Add/edit address form, presented as a modal sheet.
//   visible       – bool
//   initialValues – address object to edit, or null/undefined to add
//   onSave        – (fields) => Promise<void>
//   onClose       – () => void
export default function AddressFormSheet({ visible, initialValues, onSave, onClose }) {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const pin = useLocationPin(null);
  const resetPin = pin.reset;

  useEffect(() => {
    if (visible) {
      // Opening (or switching to another address) starts from THAT address's own saved pin, never stale.
      const { label, address, pincode, state, city, district, isDefault } = initialValues || {};
      setForm(initialValues ? { ...emptyForm, label: label || emptyForm.label, address: address || '', pincode: pincode || '', state: state || '', city: city || '', district: district || '', isDefault: !!isDefault } : emptyForm);
      resetPin(initialValues ? { latitude: initialValues.latitude, longitude: initialValues.longitude } : null);
    }
  }, [visible, initialValues, resetPin]);

  // `set`: label / default toggle / programmatic fills (pincode lookup, search suggestion) — never touches the pin.
  // `edit`: fields the user types in — marks the pin stale when an address field actually changes.
  const set = (patch) => setForm((p) => ({ ...p, ...patch }));
  const edit = (patch) => {
    if (changesAddress(form, patch)) pin.markStale();
    set(patch);
  };

  const handlePlaceSelected = (selection) => {
    const coords = coordsFromSelection(selection);
    if (!coords) return; // never attach an invalid point
    pin.select(coords, 'search');
    setForm((p) => ({ ...p, ...fieldsFromSelection(selection, p.address) }));
  };

  const isValid = form.address.trim().length > 0 && form.pincode.trim().length === 6;

  const handleSave = async () => {
    if (!isValid) return;
    try {
      setSaving(true);
      // Both coordinates or neither: a stale or missing pin is saved as null/null.
      await onSave({ ...form, ...pin.coordsForSave() });
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
              <Text style={[styles.title, { color: C.text }]}>{initialValues ? t('address.edit') : t('address.add')}</Text>
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
                    <Text style={{ color: form.label === l ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{addressLabelText(l, t)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

               <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('location.searchLabel')}</Text>
                <LocationSearch onSelect={handlePlaceSelected} />
              </View>

              <TouchableOpacity style={[styles.mapBtn, { borderColor: C.border }]} onPress={() => setMapVisible(true)} activeOpacity={0.85} accessibilityRole="button">
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
                  {formatPinLabel(pin.coords, pin.source, t)}
                </Text>
              </TouchableOpacity>
              {pin.stale && pin.coords && (
                <Text style={{ color: '#B45309', fontSize: 12 }} testID="stale-pin-notice">{t('location.stalePinNotice')}</Text>
              )}

               <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.addressRequired')}</Text>
                <TextInput
                  style={[styles.input, { borderColor: C.border, color: C.text, height: 70, textAlignVertical: 'top' }]}
                  value={form.address}
                  onChangeText={(v) => edit({ address: v })}
                  placeholder={t('address.placeholder')}
                  placeholderTextColor={C.textSecondary}
                  multiline
                />
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.pincodeRequired')}</Text>
                <PincodeInput
                  value={form.pincode}
                  onChange={(v) => edit({ pincode: v })}
                  onFill={({ state, city, district }) => set({ state, city, district })}
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.city')}</Text>
                  <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={form.city} onChangeText={(v) => edit({ city: v })} placeholder={t('address.city')} placeholderTextColor={C.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.district')}</Text>
                  <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={form.district} onChangeText={(v) => edit({ district: v })} placeholder={t('address.district')} placeholderTextColor={C.textSecondary} />
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.state')}</Text>
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={form.state} onChangeText={(v) => edit({ state: v })} placeholder={t('address.state')} placeholderTextColor={C.textSecondary} />
              </View>

              <TouchableOpacity style={styles.defaultRow} onPress={() => set({ isDefault: !form.isDefault })} activeOpacity={0.8}>
                <Ionicons name={form.isDefault ? 'checkbox' : 'square-outline'} size={20} color={C.primary} />
                <Text style={[styles.defaultLabel, { color: C.text }]}>{t('address.setDefault')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: C.primary, opacity: isValid ? 1 : 0.5 }]}
                onPress={handleSave}
                disabled={!isValid || saving}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>{saving ? t('address.saving') : t('address.save')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        <MapPicker
          visible={mapVisible}
          initialCoords={pin.coords}
          onConfirm={async (c, meta) => {
            pin.select(c, meta?.source === 'gps' ? 'gps' : 'map');
            setMapVisible(false);
            if (!form.address.trim()) {
              const { displayName } = await reverseGeocodeLocation(c.latitude, c.longitude);
              if (displayName) setForm((p) => ({ ...p, address: displayName }));
            }
          }}
          onClose={() => setMapVisible(false)}
        />
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
  mapBtn:       { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
