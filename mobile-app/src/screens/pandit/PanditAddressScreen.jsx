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
import LocationSearch from '../../components/shared/LocationSearch';
import Field from '../../components/shared/FormField';
import { reverseGeocodeLocation } from '../../services/geocodingService';

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
  // True while the typed address no longer provably matches the saved pin
  // (set on any address edit, cleared by a map confirm). Prevents saving a
  // changed address with the old coordinates silently attached.
  const [pinStale,  setPinStale]  = useState(false);
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

  const handleMapConfirm = async (c) => {
    setCoords(c);
    setPinStale(false);
    setMapVisible(false);
    // Offer the reverse-geocoded address only while the field is still empty —
    // never overwrite text the user typed.
    if (!address.trim()) {
      const { displayName } = await reverseGeocodeLocation(c.latitude, c.longitude);
      if (displayName) setAddress(displayName);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const pinValid = !!coords && !pinStale;
      if (coords && pinStale) {
        Toast.show({ type: 'info', text1: 'Address changed — map pin cleared. Re-pick on the map for a precise location.' });
      }
      await api.patch('/pandits/me/languages-address', {
        languages, pincode, state, city, district, address: address.trim(),
        latitude:  pinValid ? coords.latitude  : null,
        longitude: pinValid ? coords.longitude : null,
        serviceCoverage: { type: coverageType, radiusKm: coverageType === 'radius' ? radiusKm : undefined },
      });
      // If the pin was cleared server-side, drop it locally too so the UI
      // never shows a pin that no longer exists.
      if (!pinValid && coords) { setCoords(null); setPinStale(false); }
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

        <Field label="Search Location" C={C}>
          <LocationSearch
            onSelect={({ label, lat, lng }) => {
              // An explicit suggestion pick is deliberate — the pin matches it.
              setCoords({ latitude: lat, longitude: lng });
              setPinStale(false);
              if (!address.trim()) setAddress(label);
            }}
          />
        </Field>

        <Field label="Pincode" C={C}>
          <PincodeInput
            value={pincode}
            onChange={(v) => { setPincode(v); setPinStale(true); }}
            onFill={({ state: s, city: c, district: d }) => {
              if (s) setState(s); if (c) setCity(c); if (d) setDistrict(d);
              setPinStale(true);
            }}
          />
        </Field>

        <Field label="State" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={state} onChangeText={(v) => { setState(v); setPinStale(true); }} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="City" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={city} onChangeText={(v) => { setCity(v); setPinStale(true); }} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="District" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={district} onChangeText={(v) => { setDistrict(v); setPinStale(true); }} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="Complete Address" C={C}>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface, height: 80, textAlignVertical: 'top' }]}
            value={address}
            onChangeText={(v) => { setAddress(v); setPinStale(true); }}
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
        {pinStale && coords && (
          <Text style={{ color: '#B45309', fontSize: 12 }}>
            Address changed — re-pick the pin on the map so the saved location matches.
          </Text>
        )}

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
        onConfirm={handleMapConfirm}
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
