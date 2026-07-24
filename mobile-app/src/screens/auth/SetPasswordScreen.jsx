import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';

export default function SetPasswordScreen({ navigation, route }) {
  // Params passed from OTPScreen after successful verification
  const { phone, email, name, role, channel = 'whatsapp' } = route.params || {};
  const insets = useSafeAreaInsets();
  const { setSession } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleSetPassword = async () => {
    if (password.length < 6) {
      Toast.show({ type: 'error', text1: 'Password must be at least 6 characters' });
      return;
    }
    if (password !== confirm) {
      Toast.show({ type: 'error', text1: 'Passwords do not match' });
      return;
    }
    try {
      setLoading(true);
      // Backend endpoint: POST /auth/complete-registration
      const { data } = await api.post('/auth/complete-registration', {
        name,
        email,
        phone,
        password,
        role: role || 'user',
        channel,
      });
      // Session already exists on the server response — persist it directly
      // instead of calling login() (which expects credentials, not a token).
      await setSession(data.token, data.user);
      Toast.show({ type: 'success', text1: 'Account created successfully!' });
      // RootNavigator swaps to the authenticated stack automatically once
      // authStore.user is set (same mechanism LoginScreen relies on).
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not create account' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="dark-content" backgroundColor="#FFF8E7" />

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#1B1F3B" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Set Password</Text>
          <Text style={styles.sub}>Create a secure password for your Zutsav account</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.pwdRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secureTextEntry={!showPwd}
                returnKeyType="next"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPwd(!showPwd)}>
                <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.pwdRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Re-enter your password"
                secureTextEntry={!showConf}
                returnKeyType="done"
                onSubmitEditing={handleSetPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConf(!showConf)}>
                <Ionicons name={showConf ? 'eye-off' : 'eye'} size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>

          {confirm.length > 0 && password !== confirm && (
            <Text style={styles.mismatch}>Passwords do not match</Text>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, (!password || !confirm) && styles.submitBtnDisabled]}
            onPress={handleSetPassword}
            disabled={loading || !password || !confirm}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>{loading ? 'Creating Account…' : 'Create Account'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:         { flexGrow: 1, backgroundColor: '#FFF8E7', paddingHorizontal: 24 },
  backBtn:           { width: 40, height: 40, justifyContent: 'center' },
  header:            { marginTop: 16, marginBottom: 32 },
  title:             { fontSize: 28, fontWeight: '800', color: '#1B1F3B' },
  sub:               { fontSize: 14, color: '#6B7280', marginTop: 4 },
  form:              { gap: 16 },
  field:             { gap: 6 },
  label:             { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1C1917',
  },
  pwdRow:            { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:            { padding: 10 },
  mismatch:          { fontSize: 12, color: '#DC2626' },
  submitBtn: {
    backgroundColor: '#1B1F3B',
    borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#9CA3AF' },
  submitBtnText:     { color: '#D4AF37', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
});
