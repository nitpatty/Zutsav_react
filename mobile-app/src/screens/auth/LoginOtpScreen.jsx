import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import BackgroundDecorations from '../../components/auth/BackgroundDecorations';
import ZutsavLogoMark from '../../components/auth/ZutsavLogoMark';
import CustomInput from '../../components/auth/CustomInput';
import GradientButton from '../../components/auth/GradientButton';
import { AUTH_COLORS } from '../../components/auth/colors';
import { useAuthStore } from '../../store/authStore';

// Mirrors the backend's phone-vs-email resolution (see otpLogin.controller.js
// inferChannel/findByIdentifier) so client-side validation never disagrees
// with what the server will actually accept.
function validateIdentifier(raw) {
  const val = raw.trim();
  if (!val) return 'Enter your registered email or mobile number';
  if (/^\d+$/.test(val)) {
    if (!/^[6-9]\d{9}$/.test(val)) return 'Enter a valid 10-digit mobile number';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    return 'Enter a valid email address';
  }
  return '';
}

export default function LoginOtpScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { sendLoginOtp } = useAuthStore();

  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [identifyError, setIdentifyError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const err = validateIdentifier(emailOrPhone);
    if (err) { setIdentifyError(err); return; }
    setIdentifyError('');
    try {
      setLoading(true);
      const data = await sendLoginOtp(emailOrPhone.trim());
      if (data.found) {
        navigation.navigate('OTP', {
          emailOrPhone: emailOrPhone.trim(),
          channel: data.channel,
          masked: data.masked,
          purpose: 'login',
        });
      } else {
        // Identifier not on any account — offer to register instead
        Alert.alert(
          'Account not found',
          'No account found with this email/phone. Would you like to register instead?',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Register',
              onPress: () => {
                const isEmail = String(emailOrPhone).trim().includes('@');
                navigation.navigate('Register', isEmail
                  ? { email: emailOrPhone.trim() }
                  : { phone: emailOrPhone.trim() });
              },
            },
          ],
        );
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not send OTP' });
    } finally {
      setLoading(false);
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
              <Ionicons name="keypad-outline" size={18} color={AUTH_COLORS.forgotText} />
            </View>
            <Text style={styles.heading}>Login with OTP</Text>
            <Text style={styles.subtitle}>
              Enter your registered email or mobile number{'\n'}
              and we’ll send you a one-time code.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.card}>
            <Text style={styles.fieldLabel}>Email or Mobile Number</Text>
            <CustomInput
              value={emailOrPhone}
              onChangeText={(v) => { setEmailOrPhone(v); setIdentifyError(''); }}
              placeholder="you@email.com or 10-digit mobile"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSend}
              style={{ marginBottom: identifyError ? 6 : 20 }}
            />
            {!!identifyError && <Text style={styles.errorText}>{identifyError}</Text>}
            {!!identifyError && <View style={{ height: 14 }} />}

            <GradientButton
              title={loading ? 'Sending…' : 'Send OTP'}
              onPress={handleSend}
              loading={loading}
              disabled={loading}
            />

            <TouchableOpacity
              style={styles.loginRow}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.loginText}>
                Use your password instead? <Text style={styles.loginLink}>Sign in</Text>
              </Text>
            </TouchableOpacity>
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
    marginTop: 8, textAlign: 'center', paddingHorizontal: 8,
  },

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

  fieldLabel: { fontSize: 13, fontWeight: '600', color: AUTH_COLORS.heading, marginBottom: 8 },
  errorText: { fontSize: 12, color: '#DC2626', marginBottom: 6 },

  loginRow: { alignItems: 'center', marginTop: 20 },
  loginText: { fontSize: 13.5, color: AUTH_COLORS.subtitle },
  loginLink: { color: AUTH_COLORS.forgotText, fontWeight: '700' },
});