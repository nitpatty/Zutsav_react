import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Alert, TextInput
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';
import { COLORS } from '../../theme/tokens';
import { kycStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const GOVT_ID_TYPES = ['aadhaar', 'pan', 'voter_id', 'driving_license', 'passport'];

// Maps to the multipart field names the backend expects
const DOC_FIELDS = [
  { key: 'frontImage',   label: 'Front of ID Card',   hint: 'Clear photo of front side', required: true },
  { key: 'backImage',    label: 'Back of ID Card',     hint: 'Clear photo of back side',  required: false },
  { key: 'selfieImage',  label: 'Selfie with ID Card', hint: 'Hold your ID near your face', required: false },
  { key: 'addressProof', label: 'Address Proof',       hint: 'Utility bill, bank statement, or any address proof', required: false },
];

export default function PanditKYCScreen() {
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [profile,     setProfile]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);

  // New files selected by user (local URIs)
  const [files,       setFiles]       = useState({});
  const [govtIdType,  setGovtIdType]  = useState('aadhaar');
  const [govtIdNumber,setGovtIdNumber]= useState('');

  const fetchProfile = async () => {
    try {
      const { data } = await api.get('/pandits/me');
      const pandit = data.data || data.pandit;
      setProfile(pandit);
      if (pandit?.govtIdType) setGovtIdType(pandit.govtIdType);
      if (pandit?.govtIdNumber) setGovtIdNumber(pandit.govtIdNumber);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load KYC status' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  const pickImage = async (fieldKey) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Toast.show({ type: 'error', text1: 'Gallery permission is needed' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) {
      setFiles((prev) => ({ ...prev, [fieldKey]: result.assets[0] }));
    }
  };

  const handleSubmit = async () => {
    if (!files.frontImage && !profile?.kycFrontImage) {
      Toast.show({ type: 'error', text1: 'Front image of ID is required' });
      return;
    }
    Alert.alert(
      'Submit KYC',
      'Submit your documents for review? This will update your KYC status to "Under Review".',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              setSubmitting(true);
              const form = new FormData();
              form.append('govtIdType', govtIdType);
              if (govtIdNumber.trim()) form.append('govtIdNumber', govtIdNumber.trim());

              DOC_FIELDS.forEach(({ key }) => {
                if (files[key]) {
                  form.append(key, {
                    uri:  files[key].uri,
                    type: 'image/jpeg',
                    name: `${key}.jpg`,
                  });
                }
              });

              await api.post('/pandits/me/kyc', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              Toast.show({ type: 'success', text1: 'KYC submitted for review!' });
              setFiles({});
              fetchProfile();
            } catch (err) {
              Toast.show({ type: 'error', text1: err.response?.data?.message || 'Submission failed' });
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const kycStatus = profile?.kycStatus || 'not_submitted';
  const canEdit   = ['not_submitted', 'rejected', 'reupload_required'].includes(kycStatus);

  // Existing uploaded images from server
  const existingDocs = {
    frontImage:   profile?.kycFrontImage,
    backImage:    profile?.kycBackImage,
    selfieImage:  profile?.kycSelfieImage,
    addressProof: profile?.kycAddressProof,
  };

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="KYC Verification" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: tabBarClearance + 24 }}>

        {/* KYC Status */}
        <View style={[styles.statusCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.statusLabel, { color: C.textSecondary }]}>KYC Status</Text>
          <StatusBadge status={kycStatus} colorMap={kycStatusColor} />
          {profile?.kycRejectionReason ? (
            <View style={[styles.rejectionBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="warning" size={16} color="#DC2626" />
              <Text style={styles.rejectionText}>{profile.kycRejectionReason}</Text>
            </View>
          ) : null}
          {kycStatus === 'submitted' && (
            <Text style={[styles.reviewNote, { color: '#2563EB' }]}>
              Documents are under review. This usually takes 24–48 hours.
            </Text>
          )}
        </View>

        {canEdit && (
          <>
            {/* ID Type */}
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Government ID Type</Text>
              <View style={styles.idTypeRow}>
                {GOVT_ID_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.idTypeBtn, govtIdType === t && { backgroundColor: C.primary, borderColor: C.primary }]}
                    onPress={() => setGovtIdType(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.idTypeText, { color: govtIdType === t ? '#fff' : C.textSecondary }]}>
                      {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>ID Number (optional)</Text>
                <TextInput
                  style={[styles.textInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                  value={govtIdNumber}
                  onChangeText={setGovtIdNumber}
                  placeholder="e.g., AADHAAR 1234 5678 9012"
                  placeholderTextColor={C.textSecondary}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Document uploads */}
            {DOC_FIELDS.map(({ key, label, hint, required }) => {
              const localFile  = files[key];
              const serverPath = existingDocs[key];
              const hasImage   = localFile || serverPath;

              return (
                <View key={key} style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <View style={styles.docHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docLabel, { color: C.text }]}>
                        {label} {required && <Text style={{ color: '#DC2626' }}>*</Text>}
                      </Text>
                      <Text style={[styles.docHint, { color: C.textSecondary }]}>{hint}</Text>
                    </View>
                    {hasImage && <Ionicons name="checkmark-circle" size={22} color="#16A34A" />}
                  </View>

                  {localFile ? (
                    <Image source={{ uri: localFile.uri }} style={styles.docPreview} resizeMode="cover" />
                  ) : serverPath ? (
                    <Image source={{ uri: imageUrl(serverPath) }} style={styles.docPreview} resizeMode="cover" />
                  ) : null}

                  <TouchableOpacity
                    style={[styles.uploadBtn, { borderColor: C.primary }]}
                    onPress={() => pickImage(key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={hasImage ? 'refresh' : 'cloud-upload'} size={18} color={C.primary} />
                    <Text style={[styles.uploadBtnText, { color: C.primary }]}>
                      {localFile ? 'Change' : serverPath ? 'Replace' : 'Upload'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit KYC for Review'}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Read-only view when approved or submitted */}
        {!canEdit && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Submitted Documents</Text>
            {DOC_FIELDS.map(({ key, label }) =>
              existingDocs[key] ? (
                <View key={key} style={{ gap: 6, marginTop: 10 }}>
                  <Text style={[styles.docLabel, { color: C.textSecondary }]}>{label}</Text>
                  <Image source={{ uri: imageUrl(existingDocs[key]) }} style={styles.docPreview} resizeMode="cover" />
                </View>
              ) : null
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  statusCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 10,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
  },
  statusLabel:   { flex: 1, fontSize: 14, fontWeight: '600' },
  rejectionBox:  { width: '100%', flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  rejectionText: { flex: 1, color: '#DC2626', fontSize: 13 },
  reviewNote:    { width: '100%', fontSize: 13, lineHeight: 20 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle:     { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  idTypeRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  idTypeBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  idTypeText:    { fontSize: 12, fontWeight: '600' },
  fieldLabel:    { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  textInput: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  docHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  docLabel:      { fontSize: 14, fontWeight: '700' },
  docHint:       { fontSize: 12, marginTop: 2 },
  docPreview:    { width: '100%', height: 140, borderRadius: 10 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 10, padding: 10, justifyContent: 'center',
  },
  uploadBtnText: { fontSize: 14, fontWeight: '600' },
  submitBtn:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
