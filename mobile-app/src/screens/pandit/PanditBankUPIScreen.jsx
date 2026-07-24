import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';
import { COLORS } from '../../theme/tokens';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function PanditBankUPIScreen() {
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [loading,  setLoading]  = useState(true);
  const [savingBank, setSavingBank] = useState(false);
  const [savingUpi,  setSavingUpi]  = useState(false);
  const [verifying,  setVerifying]  = useState(false);

  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber,     setAccountNumber]     = useState('');
  const [ifscCode,          setIfscCode]          = useState('');
  const [bankName,          setBankName]          = useState('');

  const [upiId,        setUpiId]        = useState('');
  const [isVerified,   setIsVerified]   = useState(false);
  const [verifiedName, setVerifiedName] = useState('');
  const [upiBankName,  setUpiBankName]  = useState('');

  useEffect(() => {
    api.get('/pandits/me')
      .then(({ data }) => {
        const p = data.pandit;
        const b = p.bankDetails || {};
        const u = p.upiDetails || {};
        setAccountHolderName(b.accountHolderName || '');
        setAccountNumber(b.accountNumber || '');
        setIfscCode(b.ifscCode || '');
        setBankName(b.bankName || '');
        setUpiId(u.upiId || '');
        setIsVerified(u.isVerified || false);
        setVerifiedName(u.verifiedName || '');
        setUpiBankName(u.bankName || '');
      })
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load bank & UPI info' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveBank = async () => {
    try {
      setSavingBank(true);
      await api.patch('/pandits/me/bank', { accountHolderName: accountHolderName.trim(), accountNumber: accountNumber.trim(), ifscCode: ifscCode.trim().toUpperCase(), bankName: bankName.trim() });
      Toast.show({ type: 'success', text1: 'Bank details saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSavingBank(false); }
  };

  const handleVerifyUpi = async () => {
    if (!upiId.trim()) {
      Toast.show({ type: 'error', text1: 'Enter a UPI ID first' });
      return;
    }
    try {
      setVerifying(true);
      const { data } = await api.post('/pandits/me/verify-upi', { upiId: upiId.trim() });
      setVerifiedName(data.verifiedName || '');
      setUpiBankName(data.bankName || '');
      setIsVerified(true);
      Toast.show({ type: 'success', text1: data.message || 'UPI verified' });
    } catch (err) {
      setIsVerified(false);
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Verification failed' });
    } finally { setVerifying(false); }
  };

  const handleSaveUpi = async () => {
    try {
      setSavingUpi(true);
      await api.patch('/pandits/me/upi', { upiId: upiId.trim(), isVerified, verifiedName, bankName: upiBankName });
      Toast.show({ type: 'success', text1: 'UPI details saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSavingUpi(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Bank & UPI" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: tabBarClearance + 24 }}>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Bank Details</Text>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]} value={accountHolderName} onChangeText={setAccountHolderName} placeholder="Account Holder Name" placeholderTextColor={C.textSecondary} />
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]} value={bankName} onChangeText={setBankName} placeholder="Bank Name" placeholderTextColor={C.textSecondary} />
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]} value={accountNumber} onChangeText={setAccountNumber} placeholder="Account Number" placeholderTextColor={C.textSecondary} keyboardType="number-pad" />
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]} value={ifscCode} onChangeText={(v) => setIfscCode(v.toUpperCase().slice(0, 11))} placeholder="IFSC Code" placeholderTextColor={C.textSecondary} autoCapitalize="characters" />
          <Text style={[styles.infoText, { color: C.textSecondary }]}>Bank details are stored securely and never shared.</Text>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSaveBank} disabled={savingBank} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>{savingBank ? 'Saving…' : 'Save Bank Details'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>UPI Details</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
            value={upiId}
            onChangeText={(v) => { setUpiId(v); setIsVerified(false); }}
            placeholder="yourname@upi"
            placeholderTextColor={C.textSecondary}
            autoCapitalize="none"
          />
          <TouchableOpacity style={[styles.verifyBtn, { borderColor: C.primary }]} onPress={handleVerifyUpi} disabled={verifying}>
            <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>{verifying ? 'Verifying…' : 'Verify UPI'}</Text>
          </TouchableOpacity>

          {isVerified ? (
            <View style={[styles.verifiedBox, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <View>
                <Text style={styles.verifiedName}>{verifiedName || 'Verified'}</Text>
                {upiBankName ? <Text style={styles.verifiedBank}>{upiBankName}</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={[styles.warnText, { color: '#D97706' }]}>UPI not verified. Tap "Verify UPI" to confirm before saving.</Text>
          )}

          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSaveUpi} disabled={savingUpi} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>{savingUpi ? 'Saving…' : 'Save UPI Details'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  card:       { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle:  { fontSize: 15, fontWeight: '700' },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  infoText:   { fontSize: 11, lineHeight: 16 },
  verifyBtn:  { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  verifiedBox:{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  verifiedName: { fontSize: 13, fontWeight: '700', color: '#166534' },
  verifiedBank: { fontSize: 11, color: '#166534', marginTop: 2 },
  warnText:   { fontSize: 12 },
  saveBtn:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
