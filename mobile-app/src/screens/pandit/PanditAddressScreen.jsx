import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';
import { COLORS } from '../../theme/tokens';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import PincodeInput from '../../components/shared/PincodeInput';
import MapPicker from '../../components/shared/MapPicker';
import Field from '../../components/shared/FormField';

const LANGUAGES = ['Hindi', 'English', 'Sanskrit', 'Marathi', 'Punjabi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Odia', 'Malayalam', 'Urdu', 'Bhojpuri'];
const COVERAGE_TYPES = [
  { key: 'radius',    label: 'Custom Radius' },
  { key: 'city',      label: 'Entire City' },
  { key: 'district',  label: 'Entire District' },
  { key: 'state',     label: 'Entire State' },
  { key: 'pan_india', label: 'Pan India' },
];
const RADIUS_PRESETS = [5, 10, 20, 25, 50, 100];

export default function PanditAddressScreen() {
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [languages, setLanguages] = useState([]);
  const [pincode,   setPincode]   = useState('');
  const [state,     setState]     = useState('');
  const [city,      setCity]      = useState('');
  const [district,  setDistrict]  = useState('');
  const [address,   setAddress]   = useState('');
  const [coords,    setCoords]    = useState(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [coverageType, setCoverageType] = useState('city');
  const [radiusKm,  setRadiusKm]  = useState(25);

  useEffect(() => {
    api.get('/pandits/me')
      .then(({ data }) => {
        const p = data.pandit;
        setLanguages(p.languages || []);
        setPincode(p.pincode || '');
        setState(p.state || '');
        setCity(p.city || '');
        setDistrict(p.district || '');
        setAddress(p.address || '');
        if (p.latitude && p.longitude) setCoords({ latitude: p.latitude, longitude: p.longitude });
        setCoverageType(p.serviceCoverage?.type || 'city');
        setRadiusKm(p.serviceCoverage?.radiusKm || 25);
      })
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load address' }))
      .finally(() => setLoading(false));
  }, []);

  const toggleLanguage = (lang) =>
    setLanguages((prev) => prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.patch('/pandits/me/languages-address', {
        languages, pincode, state, city, district, address: address.trim(),
        latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
        serviceCoverage: { type: coverageType, radiusKm: coverageType === 'radius' ? radiusKm : undefined },
      });
      Toast.show({ type: 'success', text1: 'Address & coverage saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Address & Coverage" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: tabBarClearance + 24 }}>
        <Field label="Languages" C={C}>
          <View style={styles.chipsWrap}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.chip, { borderColor: C.border }, languages.includes(lang) && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => toggleLanguage(lang)}
              >
                <Text style={{ color: languages.includes(lang) ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{lang}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        <Field label="Pincode" C={C}>
          <PincodeInput
            value={pincode}
            onChange={setPincode}
            onFill={({ state: s, city: c, district: d }) => { if (s) setState(s); if (c) setCity(c); if (d) setDistrict(d); }}
          />
        </Field>

        <Field label="State" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={state} onChangeText={setState} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="City" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={city} onChangeText={setCity} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="District" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={district} onChangeText={setDistrict} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="Complete Address" C={C}>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface, height: 80, textAlignVertical: 'top' }]}
            value={address}
            onChangeText={setAddress}
            multiline
            placeholder="House no, street, locality…"
            placeholderTextColor={C.textSecondary}
          />
        </Field>

        <TouchableOpacity style={[styles.mapBtn, { borderColor: C.border }]} onPress={() => setMapVisible(true)} activeOpacity={0.85}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
            {coords ? `📍 ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Pick on Map'}
          </Text>
        </TouchableOpacity>

        <Field label="Service Coverage Area" C={C}>
          <View style={styles.coverageGrid}>
            {COVERAGE_TYPES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[styles.coverageBtn, { borderColor: C.border }, coverageType === c.key && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => setCoverageType(c.key)}
              >
                <Text style={{ color: coverageType === c.key ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {coverageType === 'radius' && (
            <View style={styles.radiusRow}>
              {RADIUS_PRESETS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.radiusChip, { borderColor: C.border }, radiusKm === r && { backgroundColor: C.primary, borderColor: C.primary }]}
                  onPress={() => setRadiusKm(r)}
                >
                  <Text style={{ color: radiusKm === r ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{r} km</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Field>

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <MapPicker
        visible={mapVisible}
        initialCoords={coords}
        onConfirm={(c) => { setCoords(c); setMapVisible(false); }}
        onClose={() => setMapVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  chipsWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  mapBtn:     { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  coverageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coverageBtn:  { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  radiusRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  radiusChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  saveBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
