import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';

const STEPS = ['warning', 'password', 'otp_channel', 'otp_verify', 'confirm'];

export default function DeleteAccountScreen({ navigation }) {
  const { user, logout } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [step,         setStep]         = useState('warning');
  const [password,     setPassword]     = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [otpChannel,   setOtpChannel]   = useState('email');
  const [otp,          setOtp]          = useState('');
  const [otpId,        setOtpId]        = useState(''); // identifier used for OTP (email or phone), captured at send time
  const [loading,      setLoading]      = useState(false);
  const [scheduledDate, setScheduledDate] = useState(null);

  const handleCheckPassword = async () => {
    if (!password) { Toast.show({ type: 'error', text1: 'Enter your current password' }); return; }
    try {
      setLoading(true);
      await api.post('/auth/delete-account/check-password', { password });
      setStep('otp_channel');
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Wrong password' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (otpChannel === 'email' && !user?.email) {
      Toast.show({ type: 'error', text1: 'No email on file. Use WhatsApp.' }); return;
    }
    try {
      setLoading(true);
      await api.post('/auth/delete-account/send-otp', { channel: otpChannel });
      setOtpId(otpChannel === 'email' ? user?.email : user?.phone);
      setStep('otp_verify');
      Toast.show({ type: 'success', text1: `OTP sent to your ${otpChannel}` });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not send OTP' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length < 6) { Toast.show({ type: 'error', text1: 'Enter 6-digit OTP' }); return; }
    try {
      setLoading(true);
      await api.post('/auth/verify-otp', { identifier: otpId, otp, purpose: 'account_deletion' });
      setStep('confirm');
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Invalid OTP' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeletion = async () => {
    try {
      setLoading(true);
      const { data } = await api.post('/auth/delete-account/confirm', { channel: otpChannel });
      setScheduledDate(data.scheduledDeletionDate);
      Toast.show({ type: 'info', text1: 'Account scheduled for deletion' });
      setTimeout(() => logout(), 3000);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed to schedule deletion' });
    } finally {
      setLoading(false);
    }
  };

  if (scheduledDate) {
    const date = new Date(scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    return (
      <View style={[styles.root, { backgroundColor: C.background }]}>
        <ScreenHeader title="Account Deletion" />
        <View style={styles.doneWrap}>
          <Ionicons name="time" size={56} color="#D97706" />
          <Text style={[styles.doneTitle, { color: C.text }]}>Deletion Scheduled</Text>
          <Text style={[styles.doneSub, { color: C.textSecondary }]}>
            Your account will be permanently deleted on {date}.{'\n\n'}
            You can restore it by logging in before that date.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Delete Account" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>

        {step === 'warning' && (
          <View style={{ gap: 16 }}>
            <View style={[styles.warnCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="warning" size={40} color="#DC2626" />
              <Text style={styles.warnTitle}>Delete Your Account?</Text>
              <Text style={styles.warnBody}>
                This will permanently delete your account after a 30-day grace period. All your bookings, orders, and data will be removed.{'\n\n'}
                You can restore your account by logging in within 30 days.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#DC2626' }]}
              onPress={() => setStep('password')}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Continue with Deletion</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: C.border }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Text style={[styles.outlineBtnText, { color: C.text }]}>Keep My Account</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'password' && (
          <View style={{ gap: 16 }}>
            <Text style={[styles.stepTitle, { color: C.text }]}>Verify Your Identity</Text>
            <Text style={[styles.stepSub, { color: C.textSecondary }]}>Enter your current password to continue</Text>
            <View style={[styles.pwdRow, { borderColor: C.border }]}>
              <TextInput
                style={[styles.pwdInput, { color: C.text }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Current password"
                placeholderTextColor={C.textSecondary}
                secureTextEntry={!showPwd}
              />
              <TouchableOpacity onPress={() => setShowPwd(!showPwd)}>
                <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={handleCheckPassword} disabled={loading} activeOpacity={0.85}>
              <Text style={styles.btnText}>{loading ? 'Verifying…' : 'Verify Password'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp_channel' && (
          <View style={{ gap: 16 }}>
            <Text style={[styles.stepTitle, { color: C.text }]}>Send OTP via</Text>
            {['email', 'whatsapp'].map((ch) => (
              <TouchableOpacity
                key={ch}
                style={[styles.channelCard, { backgroundColor: C.surface, borderColor: otpChannel === ch ? C.primary : C.border }]}
                onPress={() => setOtpChannel(ch)}
                activeOpacity={0.8}
              >
                <Ionicons name={ch === 'email' ? 'mail' : 'logo-whatsapp'} size={24} color={otpChannel === ch ? C.primary : C.text} />
                <Text style={[styles.channelLabel, { color: C.text }]}>
                  {ch === 'email' ? `Email (${user?.email || 'not set'})` : `WhatsApp (+91 ${user?.phone})`}
                </Text>
                {otpChannel === ch && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={handleSendOTP} disabled={loading} activeOpacity={0.85}>
              <Text style={styles.btnText}>{loading ? 'Sending…' : 'Send OTP'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp_verify' && (
          <View style={{ gap: 16 }}>
            <Text style={[styles.stepTitle, { color: C.text }]}>Enter OTP</Text>
            <Text style={[styles.stepSub, { color: C.textSecondary }]}>Enter the 6-digit code sent to your {otpChannel}</Text>
            <TextInput
              style={[styles.otpInput, { borderColor: C.border, color: C.text }]}
              value={otp}
              onChangeText={setOtp}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={handleVerifyOTP} disabled={loading} activeOpacity={0.85}>
              <Text style={styles.btnText}>{loading ? 'Verifying…' : 'Verify OTP'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'confirm' && (
          <View style={{ gap: 16 }}>
            <View style={[styles.warnCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="skull" size={40} color="#DC2626" />
              <Text style={styles.warnTitle}>Final Confirmation</Text>
              <Text style={styles.warnBody}>
                Your account will be permanently deleted in 30 days. This action cannot be undone after 30 days.
              </Text>
            </View>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#DC2626' }]} onPress={handleConfirmDeletion} disabled={loading} activeOpacity={0.85}>
              <Text style={styles.btnText}>{loading ? 'Processing…' : 'Yes, Schedule Deletion'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: C.border }]} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Text style={[styles.outlineBtnText, { color: C.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  warnCard:      { borderRadius: 16, borderWidth: 1.5, padding: 20, alignItems: 'center', gap: 10 },
  warnTitle:     { fontSize: 20, fontWeight: '800', color: '#DC2626', textAlign: 'center' },
  warnBody:      { fontSize: 14, color: '#7F1D1D', textAlign: 'center', lineHeight: 22 },
  btn:           { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText:       { color: '#fff', fontSize: 15, fontWeight: '700' },
  outlineBtn:    { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  outlineBtnText:{ fontSize: 15, fontWeight: '600' },
  stepTitle:     { fontSize: 20, fontWeight: '800' },
  stepSub:       { fontSize: 14, lineHeight: 20 },
  pwdRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  pwdInput:      { flex: 1, fontSize: 15 },
  otpInput: {
    borderWidth: 2, borderRadius: 14, paddingVertical: 16, fontSize: 28, fontWeight: '700', letterSpacing: 8,
  },
  channelCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 14, padding: 16 },
  channelLabel:  { flex: 1, fontSize: 14, fontWeight: '500' },
  doneWrap:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  doneTitle:     { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  doneSub:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
