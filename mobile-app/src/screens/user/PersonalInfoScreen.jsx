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
// Matches the website's Profile "Personal Details" card field-for-field:
// Full Name, Email, Pincode (auto-fetch), State, City, District, Address.
export default function PersonalInfoScreen() {
  const navigation = useNavigation();
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
  const [coords, setCoords] = useState(
    user?.latitude && user?.longitude ? { latitude: user.latitude, longitude: user.longitude } : null
  );
  const [mapVisible, setMapVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((p) => ({ ...p, ...patch }));

  const handleSave = async () => {
    if (!form.name.trim()) { Toast.show({ type: 'error', text1: 'Full name is required' }); return; }
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
        latitude:  coords ? coords.latitude : null,
        longitude: coords ? coords.longitude : null,
      });
      Toast.show({ type: 'success', text1: 'Profile updated' });
      navigation.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Personal Information" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Full Name *</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text }]}
            value={form.name}
            onChangeText={(v) => set({ name: v })}
            placeholder="Your full name"
            placeholderTextColor={C.textSecondary}
          />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Email</Text>
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
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pincode</Text>
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

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Search Location</Text>
          <LocationSearch
            onSelect={async ({ label, lat, lng }) => {
              setCoords({ latitude: lat, longitude: lng });
              if (!form.address.trim()) setForm((p) => ({ ...p, address: label }));
              const { displayName } = await reverseGeocodeLocation(lat, lng);
              // offer reverse-geocoded only if address empty
            }}
          />
        </View>

        <TouchableOpacity style={[styles.mapBtn, { borderColor: C.border }]} onPress={() => setMapVisible(true)} activeOpacity={0.85}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
            {coords ? `📍 ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Pick on Map'}
          </Text>
        </TouchableOpacity>

        <View>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Complete Address</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, height: 80, textAlignVertical: 'top' }]}
            value={form.address}
            onChangeText={(v) => set({ address: v })}
            placeholder="House no., street, area…"
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
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <MapPicker
        visible={mapVisible}
        initialCoords={coords}
        onConfirm={async (c) => {
          setCoords(c);
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
