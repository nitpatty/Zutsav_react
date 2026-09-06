import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import api from '../../api/axios';
import BackgroundDecorations from '../../components/auth/BackgroundDecorations';
import ZutsavLogoMark from '../../components/auth/ZutsavLogoMark';
import GradientButton from '../../components/auth/GradientButton';
import { AUTH_COLORS } from '../../components/auth/colors';

const OTP_LENGTH = 6;

export default function OTPScreen({ navigation, route }) {
  // Registration params: phone, email, name, role, purpose, channel
  // Account deletion params: phone, purpose='account_deletion', channel
  // Password reset params: emailOrPhone, channel, masked, purpose='password_reset'
  const {
    phone, email, name, role, emailOrPhone, masked, referralCode,
    purpose = 'registration',
    channel = 'whatsapp',
  } = route.params || {};

  const insets = useSafeAreaInsets();

  // Password-reset OTPs share the backend's 60s resend cooldown
  // (RESEND_COOLDOWN_MS in passwordReset.controller.js); registration/
  // account-deletion keep their existing 30s pacing.
  const RESEND_TIMER = purpose === 'password_reset' ? 60 : 30;

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
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

  // Backend expects { identifier, otp, purpose } for registration/account
  // deletion. identifier = phone (for whatsapp) or email (for email channel).
  const identifier = channel === 'email' ? email : phone;

  const displayTarget = purpose === 'password_reset'
    ? masked
    : (channel === 'email' ? email : `WhatsApp +91 ${phone}`);

  const handleVerify = async () => {
    if (otpString.length < OTP_LENGTH) {
      Toast.show({ type: 'error', text1: 'Enter all 6 digits' });
      return;
    }
    try {
      setLoading(true);

      if (purpose === 'password_reset') {
        await api.post('/auth/forgot-password/verify-otp', { emailOrPhone, channel, otp: otpString });
        navigation.navigate('ResetPassword', { emailOrPhone, channel });
        return;
      }

      await api.post('/auth/verify-otp', { identifier, otp: otpString, purpose });

      if (purpose === 'registration') {
        // Pass all registration data to SetPassword screen
        navigation.navigate('SetPassword', { phone, email, name, role, channel, referralCode });
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
      if (purpose === 'password_reset') {
        await api.post('/auth/forgot-password/send-otp', { emailOrPhone, channel });
      } else {
        // Re-send via the same send-otp endpoint
        await api.post('/auth/send-otp', { name, phone, email, channel });
      }
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

  const handleChangeChannel = () => {
    if (purpose === 'registration' && name && phone && email) {
      navigation.navigate('VerificationChannel', { name, phone, email, role, referralCode });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.bgTop} />
      <BackgroundDecorations />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color={AUTH_COLORS.heading} />
          </TouchableOpacity>

          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <ZutsavLogoMark ringSize={70} wordmarkSize={22} />
            <View style={styles.iconWrap}>
              <Ionicons name={channel === 'email' ? 'mail-outline' : 'logo-whatsapp'} size={18} color={AUTH_COLORS.forgotText} />
            </View>
            <Text style={styles.heading}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to{'\n'}
              <Text style={styles.target}>{displayTarget}</Text>
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.card}>
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

            <GradientButton
              title={loading ? 'Verifying…' : 'Verify OTP'}
              onPress={handleVerify}
              loading={loading}
              disabled={loading || otpString.length < OTP_LENGTH}
            />

            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={styles.countdownText}>Resend OTP in {countdown}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={resending} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.resendLink}>{resending ? 'Sending…' : 'Resend OTP'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {purpose === 'registration' && name && phone && email && (
              <TouchableOpacity style={styles.changeMethodRow} onPress={handleChangeChannel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="swap-horizontal" size={14} color={AUTH_COLORS.forgotText} />
                <Text style={styles.changeMethodText}>Use a different verification method</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginBottom: 4 },

  header: { alignItems: 'center', marginBottom: 24 },
  iconWrap: {
    marginTop: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(184,134,59,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  heading: {
    fontSize: 24, lineHeight: 31, fontWeight: '800',
    color: AUTH_COLORS.heading, textAlign: 'center', marginTop: 12,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  subtitle: {
    fontSize: 13, lineHeight: 20, color: AUTH_COLORS.subtitle,
    marginTop: 8, textAlign: 'center',
  },
  target: { fontWeight: '700', color: AUTH_COLORS.heading },

  card: {
    backgroundColor: AUTH_COLORS.card,
    borderRadius: 28,
    padding: 24,
    shadowColor: AUTH_COLORS.cardShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  otpBox: {
    width: 44, height: 52,
    backgroundColor: AUTH_COLORS.inputBg,
    borderWidth: 1.5, borderColor: AUTH_COLORS.inputBorder,
    borderRadius: 14,
    fontSize: 20, fontWeight: '700', color: AUTH_COLORS.inputText,
  },
  otpBoxFilled: { borderColor: AUTH_COLORS.forgotText, backgroundColor: '#FFFBEB' },

  resendRow: { alignItems: 'center', marginTop: 18 },
  countdownText: { color: AUTH_COLORS.placeholder, fontSize: 13.5 },
  resendLink: { color: AUTH_COLORS.forgotText, fontSize: 13.5, fontWeight: '700' },

  changeMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  changeMethodText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: AUTH_COLORS.forgotText,
  },
});
