import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import BackgroundDecorations from '../../components/auth/BackgroundDecorations';
import ZutsavLogoMark from '../../components/auth/ZutsavLogoMark';
import GradientButton from '../../components/auth/GradientButton';
import { AUTH_COLORS } from '../../components/auth/colors';

const ROLE_OPTIONS = [
  {
    key: 'user',
    label: 'Devotee',
    icon: 'heart',
    desc: 'Book poojas and spiritual services',
  },
  {
    key: 'pandit',
    label: 'Pandit',
    icon: 'flame',
    desc: 'Offer pooja services and astrology',
  },
];

function RegisterInput({ icon, value, onChangeText, placeholder, keyboardType, autoCapitalize, returnKeyType, maxLength, onSubmitEditing, style }) {
  return (
    <View style={[styles.inputWrap, style]}>
      <View style={styles.inputIconWrap}>
        <Ionicons name={icon} size={18} color={AUTH_COLORS.forgotText} />
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={AUTH_COLORS.placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        maxLength={maxLength}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

export default function RegisterScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');

  const handleRegister = () => {
    if (!name.trim() || !phone.trim() || !email.trim()) {
      Toast.show({ type: 'error', text1: 'Name, phone, and email are required' });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      Toast.show({ type: 'error', text1: 'Enter a valid 10-digit Indian phone number' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Toast.show({ type: 'error', text1: 'Enter a valid email address' });
      return;
    }
    navigation.navigate('VerificationChannel', {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      role,
    });
  };

  const handleRoleSelect = (r) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRole(r);
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
          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <ZutsavLogoMark ringSize={78} wordmarkSize={26} />
            <View style={styles.lotusIconWrap}>
              <Ionicons name="flower" size={18} color={AUTH_COLORS.forgotText} />
            </View>
            <Text style={styles.heading}>Create Your Spiritual{'\n'}Journey</Text>
            <Text style={styles.subtitle}>
              Join thousands of devotees and experience authentic{'\n'}poojas, temples, astrology, and festivals.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.card}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <RegisterInput
              icon="person-outline"
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              autoCapitalize="words"
              returnKeyType="next"
              style={{ marginBottom: 16 }}
            />

            <Text style={styles.fieldLabel}>Mobile Number</Text>
            <RegisterInput
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              returnKeyType="next"
              style={{ marginBottom: 16 }}
            />

            <Text style={styles.fieldLabel}>Email Address</Text>
            <RegisterInput
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              style={{ marginBottom: 20 }}
            />

            <Text style={styles.fieldLabel}>Register As</Text>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.roleCard, active && styles.roleCardActive]}
                    onPress={() => handleRoleSelect(opt.key)}
                    activeOpacity={0.75}
                  >
                    {active && <LinearGradient colors={['rgba(246,198,103,0.15)', 'rgba(222,154,46,0.08)']} style={StyleSheet.absoluteFill} borderRadius={16} />}
                    <View style={[styles.roleIconWrap, active && styles.roleIconWrapActive]}>
                      <Ionicons name={opt.icon} size={20} color={active ? '#B8860B' : AUTH_COLORS.subtitle} />
                    </View>
                    <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>{opt.label}</Text>
                    <Text style={[styles.roleDesc, active && styles.roleDescActive]}>{opt.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.buttonWrap}>
              <GradientButton
                title="Continue  →"
                onPress={handleRegister}
              />
            </View>

            <TouchableOpacity style={styles.loginRow} onPress={() => navigation.navigate('Login')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.loginText}>
                Already have an account? <Text style={styles.loginLink}>Login</Text>
              </Text>
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  lotusIconWrap: {
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

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: AUTH_COLORS.heading,
    marginBottom: 8,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH_COLORS.inputBg,
    borderWidth: 1.3,
    borderColor: AUTH_COLORS.inputBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: '#B8863B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  inputIconWrap: {
    paddingRight: 12,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: AUTH_COLORS.inputText,
  },

  roleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  roleCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.inputBorder,
    backgroundColor: AUTH_COLORS.inputBg,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    overflow: 'hidden',
  },
  roleCardActive: {
    borderColor: AUTH_COLORS.forgotText,
    shadowColor: AUTH_COLORS.buttonShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  roleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(184,134,59,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  roleIconWrapActive: {
    backgroundColor: 'rgba(184,134,59,0.18)',
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: AUTH_COLORS.subtitle,
    marginBottom: 4,
  },
  roleLabelActive: {
    color: AUTH_COLORS.heading,
  },
  roleDesc: {
    fontSize: 11,
    lineHeight: 16,
    color: AUTH_COLORS.placeholder,
    textAlign: 'center',
  },
  roleDescActive: {
    color: AUTH_COLORS.subtitle,
  },

  buttonWrap: {
    marginTop: 4,
    marginBottom: 16,
  },

  loginRow: {
    alignItems: 'center',
  },
  loginText: {
    fontSize: 13.5,
    color: AUTH_COLORS.subtitle,
  },
  loginLink: {
    color: AUTH_COLORS.forgotText,
    fontWeight: '700',
  },
});
