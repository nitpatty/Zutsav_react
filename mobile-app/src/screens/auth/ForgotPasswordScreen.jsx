import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import api from '../../api/axios';
import BackgroundDecorations from '../../components/auth/BackgroundDecorations';
import ZutsavLogoMark from '../../components/auth/ZutsavLogoMark';
import CustomInput from '../../components/auth/CustomInput';
import GradientButton from '../../components/auth/GradientButton';
import { AUTH_COLORS } from '../../components/auth/colors';

// Mirrors the backend's own phone-vs-email resolution (see
// passwordReset.controller.js resolveUser) so client-side validation never
// disagrees with what the server will actually accept.
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

const CHANNEL_META = {
  email:    { icon: 'mail-outline',   label: 'Email' },
  whatsapp: { icon: 'logo-whatsapp',  label: 'WhatsApp' },
};

export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  // identify -> channel
  const [step, setStep] = useState('identify');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [identifyError, setIdentifyError] = useState('');
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBack = () => {
    if (step === 'channel') { setStep('identify'); return; }
    navigation.goBack();
  };

  const handleCheckAccount = async () => {
    const err = validateIdentifier(emailOrPhone);
    if (err) { setIdentifyError(err); return; }
    setIdentifyError('');
    try {
      setLoading(true);
      const { data } = await api.post('/auth/forgot-password/check-account', {
        emailOrPhone: emailOrPhone.trim(),
      });
      setChannels(data.channels || []);
      setSelectedChannel(data.channels?.[0]?.type || '');
      setStep('channel');
    } catch (err) {
      const msg = err.response?.data?.message || 'No account found.';
      setIdentifyError(msg);
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!selectedChannel) return;
    try {
      setLoading(true);
      await api.post('/auth/forgot-password/send-otp', {
        emailOrPhone: emailOrPhone.trim(),
        channel: selectedChannel,
      });
      const masked = channels.find((c) => c.type === selectedChannel)?.masked || '';
      navigation.navigate('OTP', {
        emailOrPhone: emailOrPhone.trim(),
        channel: selectedChannel,
        masked,
        purpose: 'password_reset',
      });
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
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color={AUTH_COLORS.heading} />
          </TouchableOpacity>

          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <ZutsavLogoMark ringSize={70} wordmarkSize={22} />
            <View style={styles.iconWrap}>
              <Ionicons name="key-outline" size={18} color={AUTH_COLORS.forgotText} />
            </View>
            <Text style={styles.heading}>
              {step === 'identify' ? 'Recover Your\nAccount' : 'Choose Delivery\nMethod'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'identify'
                ? 'Enter your registered email or mobile number and we’ll help you get back in.'
                : 'How would you like to receive your verification code?'}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.card}>
            {step === 'identify' ? (
              <>
                <Text style={styles.fieldLabel}>Email or Mobile Number</Text>
                <CustomInput
                  value={emailOrPhone}
                  onChangeText={(v) => { setEmailOrPhone(v); setIdentifyError(''); }}
                  placeholder="you@email.com or 10-digit mobile"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleCheckAccount}
                  style={{ marginBottom: identifyError ? 6 : 20 }}
                />
                {!!identifyError && <Text style={styles.errorText}>{identifyError}</Text>}
                {!!identifyError && <View style={{ height: 14 }} />}

                <GradientButton
                  title={loading ? 'Checking…' : 'Continue'}
                  onPress={handleCheckAccount}
                  loading={loading}
                  disabled={loading}
                />
              </>
            ) : (
              <>
                <View style={styles.channelList}>
                  {channels.map((c) => {
                    const meta = CHANNEL_META[c.type] || { icon: 'mail-outline', label: c.type };
                    const active = selectedChannel === c.type;
                    return (
                      <TouchableOpacity
                        key={c.type}
                        style={[styles.channelCard, active && styles.channelCardActive]}
                        onPress={() => setSelectedChannel(c.type)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.radio, active && styles.radioActive]}>
                          {active && <View style={styles.radioDot} />}
                        </View>
                        <View style={[styles.channelIconWrap, active && styles.channelIconWrapActive]}>
                          <Ionicons
                            name={meta.icon}
                            size={20}
                            color={active ? '#B8860B' : AUTH_COLORS.subtitle}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.channelLabel, active && styles.channelLabelActive]}>{meta.label}</Text>
                          <Text style={styles.channelSub}>Send code to {c.masked}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ marginTop: 20 }}>
                  <GradientButton
                    title={loading ? 'Sending…' : 'Send OTP'}
                    onPress={handleSendOtp}
                    loading={loading}
                    disabled={loading || !selectedChannel}
                  />
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.loginRow}
              onPress={() => navigation.navigate('Login')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.loginText}>
                Remember your password? <Text style={styles.loginLink}>Sign in</Text>
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

  channelList: { gap: 12 },
  channelCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1.5, borderColor: AUTH_COLORS.inputBorder,
    backgroundColor: AUTH_COLORS.inputBg, padding: 14,
  },
  channelCardActive: {
    borderColor: AUTH_COLORS.forgotText,
    shadowColor: AUTH_COLORS.buttonShadow,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: AUTH_COLORS.inputBorder, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  radioActive: { borderColor: AUTH_COLORS.forgotText },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AUTH_COLORS.forgotText },
  channelIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(184,134,59,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  channelIconWrapActive: { backgroundColor: 'rgba(184,134,59,0.18)' },
  channelLabel: { fontSize: 14, fontWeight: '700', color: AUTH_COLORS.subtitle },
  channelLabelActive: { color: AUTH_COLORS.heading },
  channelSub: { fontSize: 12, color: AUTH_COLORS.placeholder, marginTop: 2 },

  loginRow: { alignItems: 'center', marginTop: 20 },
  loginText: { fontSize: 13.5, color: AUTH_COLORS.subtitle },
  loginLink: { color: AUTH_COLORS.forgotText, fontWeight: '700' },
});
