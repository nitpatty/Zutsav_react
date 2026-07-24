import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';
import { COLORS } from '../../theme/tokens';
import { formatDate } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import Field from '../../components/shared/FormField';

const GENDERS = [
  { key: 'male',   label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other',  label: 'Other' },
];

export default function PanditPersonalInfoScreen() {
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [email,   setEmail]   = useState('');
  const [name,        setName]        = useState('');
  const [fatherName,  setFatherName]  = useState('');
  const [phone,       setPhone]       = useState('');
  const [gender,      setGender]      = useState(null);
  const [dob,         setDob]         = useState(null);
  const [bio,         setBio]         = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    api.get('/pandits/me')
      .then(({ data }) => {
        const p = data.pandit;
        setName(p.name || '');
        setFatherName(p.fatherName || '');
        setPhone(p.phone || '');
        setEmail(p.email || '');
        setGender(p.gender || null);
        setDob(p.dob ? new Date(p.dob) : null);
        setBio(p.bio || '');
      })
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load profile' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Name is required' });
      return;
    }
    try {
      setSaving(true);
      await api.patch('/pandits/me/personal', {
        name: name.trim(), fatherName: fatherName.trim(), phone: phone.trim(),
        gender, dob: dob ? dob.toISOString() : null, bio: bio.trim(),
      });
      Toast.show({ type: 'success', text1: 'Personal details saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Personal Details" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: tabBarClearance + 24 }}>
        <Field label="Full Name" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={name} onChangeText={setName} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="Father's Name" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={fatherName} onChangeText={setFatherName} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="Mobile Number" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} placeholderTextColor={C.textSecondary} />
        </Field>
        <Field label="Email (read-only)" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.textSecondary, backgroundColor: C.background }]} value={email} editable={false} />
        </Field>
        <Field label="Gender" C={C}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {GENDERS.map((g) => (
              <TouchableOpacity
                key={g.key}
                style={[styles.segBtn, { borderColor: C.border }, gender === g.key && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => setGender(g.key)}
              >
                <Text style={{ color: gender === g.key ? '#fff' : C.text, fontWeight: '600', fontSize: 13 }}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>
        <Field label="Date of Birth" C={C}>
          <TouchableOpacity style={[styles.input, { borderColor: C.border, backgroundColor: C.surface, justifyContent: 'center' }]} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: dob ? C.text : C.textSecondary, fontSize: 14 }}>{dob ? formatDate(dob) : 'Select date of birth'}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={dob || new Date(1990, 0, 1)}
              mode="date"
              maximumDate={new Date()}
              onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (e.type === 'set' && d) setDob(d); }}
            />
          )}
        </Field>
        <Field label="About Me" C={C}>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface, height: 100, textAlignVertical: 'top' }]}
            value={bio}
            onChangeText={setBio}
            placeholder="A short bio about your practice…"
            placeholderTextColor={C.textSecondary}
            multiline
          />
        </Field>

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  segBtn:     { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
