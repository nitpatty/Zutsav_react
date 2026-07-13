import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';

export default function RegisterScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState('user');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
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
    try {
      setLoading(true);
      // Use send-otp flow: OTP sent via WhatsApp to phone
      await api.post('/auth/send-otp', {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        channel: 'whatsapp',
      });
      Toast.show({ type: 'success', text1: 'OTP sent to your WhatsApp!' });
      navigation.navigate('OTP', {
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role,
        purpose: 'registration',
        channel: 'whatsapp',
      });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="dark-content" backgroundColor="#FFF8E7" />

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#1B1F3B" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.sub}>Join Zutsav — India's sacred ritual platform</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email Address *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>I am registering as</Text>
            <View style={styles.roleRow}>
              {['user', 'pandit'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                  onPress={() => setRole(r)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={r === 'user' ? 'person' : 'book'}
                    size={18}
                    color={role === r ? '#D4AF37' : '#6B7280'}
                  />
                  <Text style={[styles.roleLabel, role === r && styles.roleLabelActive]}>
                    {r === 'user' ? 'Devotee' : 'Pandit'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>{loading ? 'Sending OTP…' : 'Send OTP'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.link}>Login</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flexGrow: 1, backgroundColor: '#FFF8E7', paddingHorizontal: 24 },
  backBtn:          { width: 40, height: 40, justifyContent: 'center' },
  header:           { marginTop: 12, marginBottom: 32 },
  title:            { fontSize: 28, fontWeight: '800', color: '#1B1F3B' },
  sub:              { fontSize: 14, color: '#6B7280', marginTop: 4 },
  form:             { gap: 16 },
  field:            { gap: 6 },
  label:            { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1C1917',
  },
  roleRow:          { flexDirection: 'row', gap: 12 },
  roleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, padding: 14, justifyContent: 'center',
  },
  roleBtnActive:    { borderColor: '#D4AF37', backgroundColor: '#FFFBEB' },
  roleLabel:        { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  roleLabelActive:  { color: '#1B1F3B' },
  submitBtn: {
    backgroundColor: '#1B1F3B',
    borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnText:    { color: '#D4AF37', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  linkRow:          { alignItems: 'center' },
  linkText:         { color: '#6B7280', fontSize: 14 },
  link:             { color: '#1B1F3B', fontWeight: '700' },
});
