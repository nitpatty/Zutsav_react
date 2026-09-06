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

// ─── WhatsApp communication consent ────────────────────────────────────────
// Wording taken VERBATIM from the client's WhatsApp consent reference
// document. Business/legal artifact — do not edit without approval. Consent
// is separate from OTP verification: verifying a WhatsApp OTP proves control
// of the number, never marketing opt-in.
const SERVICE_CONSENT_TEXT =
  'I agree to receive WhatsApp messages from the company regarding my account, bookings, orders and services.';
const MARKETING_CONSENT_TEXT =
  'I would also like to receive offers, discounts and promotional updates from the company on WhatsApp.';
const CONSENT_VERSION = 'v1.0';

export default function SetPasswordScreen({ navigation, route }) {
  // Params passed from OTPScreen after successful verification
  const { phone, email, name, role, channel = 'whatsapp', referralCode } = route.params || {};
  const insets = useSafeAreaInsets();
  const { setSession } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);
  // Service consent pre-checked (transactional messaging is the platform's
  // core function); marketing consent UNCHECKED by default.
  const [serviceConsent,   setServiceConsent]   = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);

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
        referralCode: referralCode || undefined,
        // WhatsApp communication consent (separate from OTP verification)
        serviceConsent,
        marketingConsent,
        serviceConsentText:      serviceConsent   ? SERVICE_CONSENT_TEXT   : '',
        serviceConsentVersion:   serviceConsent   ? CONSENT_VERSION        : '',
        marketingConsentText:    marketingConsent ? MARKETING_CONSENT_TEXT : '',
        marketingConsentVersion: marketingConsent ? CONSENT_VERSION        : '',
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

          {/* WhatsApp communication consent — separate from OTP verification */}
          <View style={styles.consentBlock}>
            <Text style={styles.consentHeading}>WhatsApp Communication Preferences</Text>

            <TouchableOpacity
              style={[styles.consentRow, serviceConsent && styles.consentRowChecked]}
              onPress={() => setServiceConsent((v) => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, serviceConsent && styles.checkboxChecked]}>
                {serviceConsent && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.consentLabel}>{SERVICE_CONSENT_TEXT}</Text>
                <Text style={styles.consentHint}>Required for booking, order and account updates.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.consentRow, marketingConsent && styles.consentRowChecked]}
              onPress={() => setMarketingConsent((v) => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, marketingConsent && styles.checkboxChecked]}>
                {marketingConsent && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.consentLabel}>{MARKETING_CONSENT_TEXT}</Text>
                <Text style={styles.consentHint}>Optional. You can change this anytime in Settings.</Text>
              </View>
            </TouchableOpacity>
          </View>

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
  consentBlock:      { gap: 10, marginTop: 4 },
  consentHeading:    { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  consentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1.3, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
    borderRadius: 12, padding: 12,
  },
  consentRowChecked: { borderColor: '#D4AF37', backgroundColor: '#FFFBEB' },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxChecked:   { borderColor: '#D4AF37', backgroundColor: '#D4AF37' },
  consentLabel:      { fontSize: 13, lineHeight: 19, color: '#374151' },
  consentHint:       { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  submitBtn: {
    backgroundColor: '#1B1F3B',
    borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#9CA3AF' },
  submitBtnText:     { color: '#D4AF37', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
});
