import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';

const OTP_LENGTH   = 6;
const RESEND_TIMER = 30;

export default function OTPScreen({ navigation, route }) {
  // Registration params: phone, email, name, role, purpose, channel
  // Account deletion params: phone, purpose='account_deletion', channel
  const {
    phone, email, name, role,
    purpose = 'registration',
    channel = 'whatsapp',
  } = route.params || {};

  const insets = useSafeAreaInsets();
  const { login } = useAuthStore();

  const [otp,       setOtp]       = useState(Array(OTP_LENGTH).fill(''));
  const [loading,   setLoading]   = useState(false);
  const [countdown, setCountdown] = useState(RESEND_TIMER);
  const [resending, setResending] = useState(false);
  const refs = useRef([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const focusNext = (idx) => { if (idx < OTP_LENGTH - 1) refs.current[idx + 1]?.focus(); };
  const focusPrev = (idx) => { if (idx > 0)              refs.current[idx - 1]?.focus(); };

  const handleChange = (val, idx) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length > 1) {
      const spread = digits.slice(0, OTP_LENGTH).split('');
      const next   = [...otp];
      spread.forEach((d, i) => { if (idx + i < OTP_LENGTH) next[idx + i] = d; });
      setOtp(next);
      refs.current[Math.min(idx + spread.length, OTP_LENGTH - 1)]?.focus();
      return;
    }
    const next = [...otp];
    next[idx]  = digits;
    setOtp(next);
    if (digits) focusNext(idx);
  };

  const handleKeyPress = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx]) focusPrev(idx);
  };

  const otpString = otp.join('');

  // Backend expects { identifier, otp, purpose }
  // identifier = phone (for whatsapp) or email (for email channel)
  const identifier = channel === 'email' ? email : phone;

  const handleVerify = async () => {
    if (otpString.length < OTP_LENGTH) {
      Toast.show({ type: 'error', text1: 'Enter all 6 digits' });
      return;
    }
    try {
      setLoading(true);
      await api.post('/auth/verify-otp', { identifier, otp: otpString, purpose });

      if (purpose === 'registration') {
        // Pass all registration data to SetPassword screen
        navigation.navigate('SetPassword', { phone, email, name, role, channel });
      } else if (purpose === 'account_deletion') {
        navigation.goBack();
      } else {
        // For other purposes, return to caller
        navigation.goBack();
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Invalid OTP' });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResending(true);
      // Re-send via the same send-otp endpoint
      await api.post('/auth/send-otp', { name, phone, email, channel });
      setCountdown(RESEND_TIMER);
      setOtp(Array(OTP_LENGTH).fill(''));
      refs.current[0]?.focus();
      Toast.show({ type: 'success', text1: 'OTP resent!' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not resend OTP' });
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF8E7" />

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#1B1F3B" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Verify OTP</Text>
          <Text style={styles.sub}>
            Enter the 6-digit code sent to your{'\n'}
            <Text style={styles.phone}>
              {channel === 'email' ? email : `WhatsApp +91 ${phone}`}
            </Text>
          </Text>
        </View>

        <View style={styles.otpRow}>
          {otp.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={(r) => { refs.current[idx] = r; }}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              value={digit}
              onChangeText={(v) => handleChange(v, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              keyboardType="number-pad"
              maxLength={6}
              selectTextOnFocus
              textAlign="center"
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.verifyBtn, otpString.length < OTP_LENGTH && styles.verifyBtnDisabled]}
          onPress={handleVerify}
          disabled={loading || otpString.length < OTP_LENGTH}
          activeOpacity={0.85}
        >
          <Text style={styles.verifyBtnText}>{loading ? 'Verifying…' : 'Verify OTP'}</Text>
        </TouchableOpacity>

        <View style={styles.resendRow}>
          {countdown > 0 ? (
            <Text style={styles.countdownText}>Resend in {countdown}s</Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              <Text style={styles.resendLink}>{resending ? 'Sending…' : 'Resend OTP'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#FFF8E7', paddingHorizontal: 24 },
  backBtn:           { width: 40, height: 40, justifyContent: 'center' },
  header:            { marginTop: 16, marginBottom: 40, alignItems: 'center' },
  title:             { fontSize: 28, fontWeight: '800', color: '#1B1F3B' },
  sub:               { fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center', lineHeight: 22 },
  phone:             { fontWeight: '700', color: '#1B1F3B' },
  otpRow:            { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 32 },
  otpBox: {
    width: 48, height: 56,
    backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: '#E5E7EB',
    borderRadius: 12,
    fontSize: 22, fontWeight: '700', color: '#1B1F3B',
  },
  otpBoxFilled:      { borderColor: '#D4AF37', backgroundColor: '#FFFBEB' },
  verifyBtn: {
    backgroundColor: '#1B1F3B',
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  verifyBtnDisabled: { backgroundColor: '#9CA3AF' },
  verifyBtnText:     { color: '#D4AF37', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  resendRow:         { alignItems: 'center', marginTop: 20 },
  countdownText:     { color: '#9CA3AF', fontSize: 14 },
  resendLink:        { color: '#1B1F3B', fontSize: 14, fontWeight: '700' },
});
