import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import api from '../../api/axios';
import BackgroundDecorations from '../../components/auth/BackgroundDecorations';
import ZutsavLogoMark from '../../components/auth/ZutsavLogoMark';
import GradientButton from '../../components/auth/GradientButton';
import { AUTH_COLORS } from '../../components/auth/colors';

const CHANNELS = [
  {
    key: 'whatsapp',
    icon: 'logo-whatsapp',
    label: 'WhatsApp',
    desc: 'Receive your OTP instantly on your registered WhatsApp number.',
  },
  {
    key: 'email',
    icon: 'mail-outline',
    label: 'Email',
    desc: 'Receive your OTP on your registered email address.',
  },
];

function maskPhone(phone) {
  if (!phone || phone.length < 4) return phone;
  return phone.slice(0, 2) + '****' + phone.slice(-2);
}

function maskEmail(email) {
  if (!email) return '';
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const maskedUser = user.length <= 2 ? '**' : user[0] + '**' + user.slice(-1);
  return `${maskedUser}@${domain}`;
}

export default function VerificationChannelScreen({ navigation, route }) {
  const { name, phone, email, role, referralCode } = route.params || {};
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState('whatsapp');
  const [loading, setLoading] = useState(false);

  const handleChannelSelect = (key) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setChannel(key);
  };

  const handleSendOTP = async () => {
    if (channel === 'whatsapp' && !phone) {
      Toast.show({ type: 'error', text1: 'Mobile number is required for WhatsApp' });
      return;
    }
    if (channel === 'email' && !email) {
      Toast.show({ type: 'error', text1: 'Email address is required for Email OTP' });
      return;
    }
    try {
      setLoading(true);
      await api.post('/auth/send-otp', {
        name,
        phone,
        email,
        channel,
      });
      const target = channel === 'email' ? 'email' : 'WhatsApp';
      Toast.show({ type: 'success', text1: `OTP sent to your ${target}!` });
      navigation.navigate('OTP', {
        phone,
        email,
        name,
        role,
        purpose: 'registration',
        channel,
        referralCode,
      });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: err.response?.data?.message || 'Could not send OTP. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => navigation.goBack();

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.bgTop} />
      <BackgroundDecorations />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backBtn} onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color={AUTH_COLORS.heading} />
          </TouchableOpacity>

          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <ZutsavLogoMark ringSize={70} wordmarkSize={22} />
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={18} color={AUTH_COLORS.forgotText} />
            </View>
            <Text style={styles.heading}>Verify Your{'\n'}Identity</Text>
            <Text style={styles.subtitle}>
              Choose how you'd like to receive your{'\n'}verification code.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.card}>
            <View style={styles.channelRow}>
              {CHANNELS.map((opt) => {
                const active = channel === opt.key;
                const isWhatsApp = opt.key === 'whatsapp';
                const target = isWhatsApp ? `+91 ${maskPhone(phone)}` : maskEmail(email);

                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.channelCard, active && styles.channelCardActive]}
                    onPress={() => handleChannelSelect(opt.key)}
                    activeOpacity={0.75}
                  >
                    {active && (
                      <LinearGradient
                        colors={['rgba(246,198,103,0.15)', 'rgba(222,154,46,0.08)']}
                        style={StyleSheet.absoluteFill}
                        borderRadius={20}
                      />
                    )}

                    <View style={styles.channelTopRow}>
                      <View style={[styles.channelIconWrap, active && styles.channelIconWrapActive]}>
                        <Ionicons name={opt.icon} size={22} color={active ? '#B8860B' : AUTH_COLORS.subtitle} />
                      </View>
                      {active && (
                        <View style={styles.checkWrap}>
                          <Ionicons name="checkmark-circle" size={20} color={AUTH_COLORS.forgotText} />
                        </View>
                      )}
                    </View>

                    <Text style={[styles.channelLabel, active && styles.channelLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.channelDesc, active && styles.channelDescActive]}>
                      {opt.desc}
                    </Text>
                    <Text style={[styles.channelTarget, active && styles.channelTargetActive]}>
                      {target}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.buttonWrap}>
              <GradientButton
                title={loading ? 'Sending OTP…' : 'Send OTP'}
                onPress={handleSendOTP}
                loading={loading}
                disabled={loading}
              />
            </View>

            <TouchableOpacity style={styles.changeMethodRow} onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={14} color={AUTH_COLORS.forgotText} />
              <Text style={styles.changeMethodText}>Back to registration</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconWrap: {
    marginTop: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(184,134,59,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '800',
    color: AUTH_COLORS.heading,
    textAlign: 'center',
    marginTop: 12,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: AUTH_COLORS.subtitle,
    marginTop: 8,
    textAlign: 'center',
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

  channelRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  channelCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.inputBorder,
    backgroundColor: AUTH_COLORS.inputBg,
    paddingVertical: 18,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  channelCardActive: {
    borderColor: AUTH_COLORS.forgotText,
    shadowColor: AUTH_COLORS.buttonShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  channelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  channelIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(184,134,59,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIconWrapActive: {
    backgroundColor: 'rgba(184,134,59,0.18)',
  },
  checkWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: AUTH_COLORS.subtitle,
    marginBottom: 4,
  },
  channelLabelActive: {
    color: AUTH_COLORS.heading,
  },
  channelDesc: {
    fontSize: 11,
    lineHeight: 16,
    color: AUTH_COLORS.placeholder,
    marginBottom: 10,
  },
  channelDescActive: {
    color: AUTH_COLORS.subtitle,
  },
  channelTarget: {
    fontSize: 12,
    fontWeight: '600',
    color: AUTH_COLORS.placeholder,
    backgroundColor: 'rgba(184,134,59,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    textAlign: 'center',
    overflow: 'hidden',
  },
  channelTargetActive: {
    color: AUTH_COLORS.forgotText,
    backgroundColor: 'rgba(184,134,59,0.12)',
  },

  buttonWrap: {
    marginTop: 4,
    marginBottom: 16,
  },

  changeMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  changeMethodText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: AUTH_COLORS.forgotText,
  },
});
