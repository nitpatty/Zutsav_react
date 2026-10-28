import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import PincodeInput from '../../components/shared/PincodeInput';
import LocationSearch from '../../components/shared/LocationSearch';
import MapPicker from '../../components/shared/MapPicker';
import { reverseGeocodeLocation } from '../../services/geocodingService';
import useLocationPin from '../../hooks/useLocationPin';
import { changesAddress, coordsFromSelection, fieldsFromSelection, formatPinLabel } from '../../utils/locationPin';
import { useTranslation } from '../../i18n';
import { apiErrorMessage } from '../../utils/apiMessage';
// Matches the website's Profile "Personal Details" card field-for-field:
// Full Name, Email, Pincode (auto-fetch), State, City, District, Address.
export default function PersonalInfoScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user, updateUser } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [form, setForm] = useState({
    name:     user?.name     || '',
    email:    user?.email    || '',
    pincode:  user?.pincode  || '',
    state:    user?.state    || '',
    city:     user?.city     || '',
    district: user?.district || '',
    address:  user?.address  || '',
  });
  // The saved pin belongs to the saved address: it stays valid until the user edits an address field by hand.
  const pin = useLocationPin({ latitude: user?.latitude, longitude: user?.longitude });
  const [mapVisible, setMapVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // `set` is for programmatic fills (pincode lookup, search suggestion) and never touches the pin;
  // `edit` is for fields the user types in, and marks the pin stale when an address field actually changes.
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

  const handleSave = async () => {
    if (!form.name.trim()) { Toast.show({ type: 'error', text1: t('profile.nameRequired') }); return; }
    try {
      setSaving(true);
      await updateUser({
        name:     form.name.trim(),
        email:    form.email.trim() || undefined,
        pincode:  form.pincode.trim() || undefined,
        state:    form.state.trim() || undefined,
        city:     form.city.trim() || undefined,
        district: form.district.trim() || undefined,
        address:  form.address.trim() || undefined,
        ...pin.coordsForSave(), // both numbers, or both null when the address changed since the pin was set
      });
      Toast.show({ type: 'success', text1: t('profile.profileUpdated') });
      navigation.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: apiErrorMessage(err, t('profile.updateFailed')) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('profile.personalInfo')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('profile.fullNameRequired')}</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text }]}
            value={form.name}
            onChangeText={(v) => set({ name: v })}
            placeholder={t('auth.fullNamePlaceholder')}
            placeholderTextColor={C.textSecondary}
          />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('auth.channelEmail')}</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text }]}
            value={form.email}
            onChangeText={(v) => set({ email: v })}
            placeholder="you@example.com"
            placeholderTextColor={C.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('address.pincode')}</Text>
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
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('profile.completeAddress')}</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, height: 80, textAlignVertical: 'top' }]}
            value={form.address}
            onChangeText={(v) => edit({ address: v })}
            placeholder={t('address.placeholder')}
            placeholderTextColor={C.textSecondary}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: C.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>{saving ? t('profile.saving') : t('profile.saveChanges')}</Text>
        </TouchableOpacity>
      </ScrollView>

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
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  fieldLabel:  { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  fieldRow:    { flexDirection: 'row', gap: 10 },
  input:       { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  mapBtn:      { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
