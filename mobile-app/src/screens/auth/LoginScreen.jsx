import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import BackgroundDecorations from '../../components/auth/BackgroundDecorations';
import ZutsavLogoMark from '../../components/auth/ZutsavLogoMark';
import LoginCard from '../../components/auth/LoginCard';
import { AUTH_COLORS } from '../../components/auth/colors';
import { useTranslation, useFormatters } from '../../i18n';
import { apiErrorMessage } from '../../utils/apiMessage';

export default function LoginScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { login, setSession } = useAuthStore();
  const { t } = useTranslation();
  const { formatDateWithOptions } = useFormatters();

  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]     = useState(false);
  const [remember,   setRemember]    = useState(false);
  const [loading,    setLoading]     = useState(false);

  // Deletion-pending restore flow
  const [deletionData, setDeletionData] = useState(null);
  const [restoring,    setRestoring]    = useState(false);

  // OTP-login verification can land on this screen with the deletion-pending
  // payload (see OTPScreen purpose='login') so the restore UI is shared
  useEffect(() => {
    if (route.params?.deletionPending) {
      setDeletionData(route.params.deletionPending);
      navigation.setParams({ deletionPending: undefined });
    }
  }, [route.params?.deletionPending]);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      Toast.show({ type: 'error', text1: t('auth.enterCredentials') });
      return;
    }
    try {
      setLoading(true);
      const data = await login(identifier.trim(), password);
      if (data?.deletionPending) {
        setDeletionData(data);
      }
      // RootNavigator re-renders automatically on successful login
    } catch (err) {
      Toast.show({ type: 'error', text1: apiErrorMessage(err, t('auth.loginFailed')) });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreAccount = async () => {
    try {
      setRestoring(true);
      await api.post('/auth/delete-account/cancel', {}, {
        headers: { Authorization: `Bearer ${deletionData.token}` },
      });
      await setSession(deletionData.token, { ...deletionData.user, accountStatus: 'active' });
      Toast.show({ type: 'success', text1: t('auth.accountRestored') });
    } catch (err) {
      Toast.show({ type: 'error', text1: apiErrorMessage(err, t('auth.restoreFailed')) });
    } finally {
      setRestoring(false);
    }
  };

  const handleContinueLogout = () => setDeletionData(null);

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  if (deletionData) {
    const scheduled = deletionData.scheduledDeletionDate
      ? formatDateWithOptions(new Date(deletionData.scheduledDeletionDate), { day:'2-digit', month:'long', year:'numeric' })
      : '';
    return (
      <View style={[styles.restoreOverlay, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B1F3B" />
        <View style={styles.restoreCard}>
          <Ionicons name="warning" size={48} color="#D97706" />
          <Text style={styles.restoreTitle}>{t('auth.deletionPendingTitle')}</Text>
          <Text style={styles.restoreSub}>
            {t('auth.deletionPendingBody', { date: scheduled })}
            {'\n\n'}{t('auth.deletionRestoreNote')}
          </Text>
          <TouchableOpacity style={styles.restoreBtn} onPress={handleRestoreAccount} disabled={restoring} activeOpacity={0.8}>
            <Text style={styles.restoreBtnText}>{restoring ? t('auth.restoring') : t('auth.restoreMyAccount')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.continueBtn} onPress={handleContinueLogout} activeOpacity={0.8}>
            <Text style={styles.continueBtnText}>{t('auth.continueWithDeletion')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.bgTop} />
      <BackgroundDecorations />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <ZutsavLogoMark ringSize={92} wordmarkSize={30} />
            <Text style={styles.heading}>{t('auth.loginHeading')}</Text>
            <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(200)}>
            <LoginCard
              identifier={identifier}
              onChangeIdentifier={setIdentifier}
              password={password}
              onChangePassword={setPassword}
              showPassword={showPwd}
              onToggleShowPassword={() => setShowPwd(!showPwd)}
              remember={remember}
              onToggleRemember={() => setRemember(!remember)}
              onForgotPassword={handleForgotPassword}
              onLogin={handleLogin}
              loading={loading}
              onRegister={() => navigation.navigate('Register')}
              onOtpLogin={() => navigation.navigate('LoginOtp')}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flexGrow: 1, paddingHorizontal: 24 },
  header:     { alignItems: 'center', marginBottom: 32 },
  heading: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    color: AUTH_COLORS.heading,
    textAlign: 'center',
    marginTop: 18,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  subtitle: {
    fontSize: 14,
    color: AUTH_COLORS.subtitle,
    marginTop: 8,
    textAlign: 'center',
  },

  restoreOverlay: { flex: 1, backgroundColor: '#1B1F3B', justifyContent: 'center', padding: 24 },
  restoreCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28,
    alignItems: 'center', gap: 12,
  },
  restoreTitle: { fontSize: 20, fontWeight: '800', color: '#1C1917', textAlign: 'center' },
  restoreSub:   { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  restoreBtn: {
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 32, marginTop: 8,
  },
  restoreBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  continueBtn: {
    paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#DC2626',
  },
  continueBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '600' },
});
