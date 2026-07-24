import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import api from '../../api/axios';
import BackgroundDecorations from '../../components/auth/BackgroundDecorations';
import ZutsavLogoMark from '../../components/auth/ZutsavLogoMark';
import CustomInput from '../../components/auth/CustomInput';
import GradientButton from '../../components/auth/GradientButton';
import { AUTH_COLORS } from '../../components/auth/colors';

// Same 5 rules the backend enforces (isStrongPassword in
// passwordReset.controller.js) — kept in lockstep with web's NewPasswordStep.
const RULES = [
  { key: 'length',  label: 'At least 8 characters',  test: (v) => v.length >= 8 },
  { key: 'upper',   label: 'One uppercase letter',    test: (v) => /[A-Z]/.test(v) },
  { key: 'lower',   label: 'One lowercase letter',    test: (v) => /[a-z]/.test(v) },
  { key: 'number',  label: 'One number',              test: (v) => /\d/.test(v) },
  { key: 'special', label: 'One special character',   test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function passwordStrength(pw) {
  const passed = RULES.filter((r) => r.test(pw)).length;
  if (!pw || passed <= 2) return 'weak';
  if (passed <= 4) return 'medium';
  return 'strong';
}

const STRENGTH_META = {
  weak:   { label: 'Weak',   color: '#DC2626', width: '33%' },
  medium: { label: 'Medium', color: '#D97706', width: '66%' },
  strong: { label: 'Strong', color: '#16A34A', width: '100%' },
};

export default function ResetPasswordScreen({ navigation, route }) {
  const { emailOrPhone, channel } = route.params || {};
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const strength = passwordStrength(password);
  const allRulesPass = RULES.every((r) => r.test(password));

  const handleSubmit = async () => {
    if (!allRulesPass) { setError('Password does not meet all requirements'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    try {
      setLoading(true);
      await api.post('/auth/forgot-password/reset', { emailOrPhone, channel, newPassword: password });
      setDone(true);
      Toast.show({ type: 'success', text1: 'Password updated successfully!' });
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }, 1800);
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not reset password';
      setError(msg);
      Toast.show({ type: 'error', text1: msg });
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
          {!done && (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={24} color={AUTH_COLORS.heading} />
            </TouchableOpacity>
          )}

          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <ZutsavLogoMark ringSize={70} wordmarkSize={22} />
            {!done ? (
              <>
                <View style={styles.iconWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={AUTH_COLORS.forgotText} />
                </View>
                <Text style={styles.heading}>Create New{'\n'}Password</Text>
                <Text style={styles.subtitle}>Choose a strong password to protect your account.</Text>
              </>
            ) : (
              <Text style={styles.heading}>All Set</Text>
            )}
          </Animated.View>

          {!done ? (
            <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.card}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <CustomInput
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                placeholder="Enter new password"
                secureTextEntry={!showPwd}
                rightIcon={showPwd ? 'eye-outline' : 'eye-off-outline'}
                onRightIconPress={() => setShowPwd(!showPwd)}
                returnKeyType="next"
                style={{ marginBottom: 10 }}
              />

              {!!password && (
                <View style={styles.strengthWrap}>
                  <View style={styles.strengthTrack}>
                    <View style={[styles.strengthFill, { width: STRENGTH_META[strength].width, backgroundColor: STRENGTH_META[strength].color }]} />
                  </View>
                  <Text style={[styles.strengthLabel, { color: STRENGTH_META[strength].color }]}>{STRENGTH_META[strength].label}</Text>
                </View>
              )}

              <View style={styles.rulesList}>
                {RULES.map((r) => {
                  const pass = r.test(password);
                  return (
                    <View key={r.key} style={styles.ruleRow}>
                      <Ionicons
                        name={pass ? 'checkmark-circle' : 'ellipse-outline'}
                        size={13}
                        color={pass ? '#16A34A' : AUTH_COLORS.placeholder}
                      />
                      <Text style={[styles.ruleText, pass && styles.ruleTextPass]}>{r.label}</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Confirm Password</Text>
              <CustomInput
                value={confirm}
                onChangeText={(v) => { setConfirm(v); setError(''); }}
                placeholder="Re-enter new password"
                secureTextEntry={!showConf}
                rightIcon={showConf ? 'eye-outline' : 'eye-off-outline'}
                onRightIconPress={() => setShowConf(!showConf)}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                style={{ marginBottom: error ? 6 : 20 }}
              />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              {!!error && <View style={{ height: 14 }} />}

              <GradientButton
                title={loading ? 'Updating…' : 'Reset Password'}
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInUp.duration(600)} style={[styles.card, styles.successCard]}>
              <Animated.View entering={ZoomIn.duration(500).delay(150)} style={styles.successIconWrap}>
                <Ionicons name="shield-checkmark" size={34} color="#16A34A" />
              </Animated.View>
              <Text style={styles.successTitle}>Password updated successfully</Text>
              <Text style={styles.successSub}>Redirecting you to login…</Text>
            </Animated.View>
          )}
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

  strengthWrap: { marginBottom: 10 },
  strengthTrack: { height: 6, borderRadius: 3, backgroundColor: AUTH_COLORS.inputBg, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 3 },
  strengthLabel: { fontSize: 12, fontWeight: '700', marginTop: 4 },

  rulesList: { gap: 5, marginBottom: 4 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontSize: 12, color: AUTH_COLORS.placeholder },
  ruleTextPass: { color: '#16A34A' },

  successCard: { alignItems: 'center', paddingVertical: 36 },
  successIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(22,163,74,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  successTitle: { fontSize: 17, fontWeight: '800', color: AUTH_COLORS.heading, textAlign: 'center' },
  successSub: { fontSize: 13, color: AUTH_COLORS.subtitle, marginTop: 6 },
});
