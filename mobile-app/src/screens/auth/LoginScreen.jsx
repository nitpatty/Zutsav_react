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

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { login, setSession } = useAuthStore();

  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]     = useState(false);
  const [loading,    setLoading]     = useState(false);

  // Deletion-pending restore flow
  const [deletionData, setDeletionData] = useState(null);
  const [restoring,    setRestoring]    = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Enter email/phone and password' });
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
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Login failed' });
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
      Toast.show({ type: 'success', text1: 'Account restored successfully!' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not restore account' });
    } finally {
      setRestoring(false);
    }
  };

  const handleContinueLogout = () => setDeletionData(null);

  if (deletionData) {
    const scheduled = deletionData.scheduledDeletionDate
      ? new Date(deletionData.scheduledDeletionDate).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })
      : '';
    return (
      <View style={[styles.restoreOverlay, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B1F3B" />
        <View style={styles.restoreCard}>
          <Ionicons name="warning" size={48} color="#D97706" />
          <Text style={styles.restoreTitle}>Account Deletion Pending</Text>
          <Text style={styles.restoreSub}>
            Your account is scheduled for permanent deletion on {scheduled}.
            {'\n\n'}If you restore it now, all your data will be preserved.
          </Text>
          <TouchableOpacity style={styles.restoreBtn} onPress={handleRestoreAccount} disabled={restoring} activeOpacity={0.8}>
            <Text style={styles.restoreBtnText}>{restoring ? 'Restoring…' : 'Restore My Account'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.continueBtn} onPress={handleContinueLogout} activeOpacity={0.8}>
            <Text style={styles.continueBtnText}>Continue with Deletion</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} keyboardShouldPersistTaps="handled">
        <StatusBar barStyle="dark-content" backgroundColor="#FFF8E7" />

        <View style={styles.header}>
          <Text style={styles.brand}>Zutsav</Text>
          <Text style={styles.tagline}>Welcome back</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email or Phone</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Enter email or 10-digit phone"
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.pwdRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPwd(!showPwd)}>
                <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            <Text style={styles.loginBtnText}>{loading ? 'Logging in…' : 'Login'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.linkText}>Don't have an account? <Text style={styles.link}>Register</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flexGrow: 1, backgroundColor: '#FFF8E7', paddingHorizontal: 24 },
  header:      { alignItems: 'center', marginTop: 40, marginBottom: 40 },
  brand:       { fontSize: 40, fontWeight: '800', color: '#1B1F3B', letterSpacing: 2 },
  tagline:     { fontSize: 16, color: '#6B7280', marginTop: 4 },
  form:        { gap: 16 },
  field:       { gap: 6 },
  label:       { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1C1917',
    marginBottom: 0,
  },
  pwdRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:      { padding: 10 },
  loginBtn: {
    backgroundColor: '#1B1F3B',
    borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  loginBtnText: { color: '#D4AF37', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  linkRow:     { alignItems: 'center', marginTop: 8 },
  linkText:    { color: '#6B7280', fontSize: 14 },
  link:        { color: '#1B1F3B', fontWeight: '700' },

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
