import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Alert, TextInput, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
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

// KYC/Govt-ID images are never served as static files — every read goes
// through the authenticated document endpoint. RN's <Image> can't attach an
// Authorization header to a plain uri, so we fetch via the authed axios
// instance and convert the blob to a data URI instead.
function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function fetchKycDocumentUri(field) {
  const res = await api.get(`/pandits/me/kyc/document/${field}`, { responseType: 'blob' });
  return blobToDataUri(res.data);
}

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

  // Data-URIs for existing documents, fetched through the authed endpoint
  const [docUris,     setDocUris]     = useState({});

  // Post-approval retention choice
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState('delete');

  // OTP-gated viewer for retained documents
  const [viewSession, setViewSession] = useState(null); // { expiresAt }
  const [otpModal, setOtpModal] = useState(null); // { field, step, channel, otp, busy }
  const [viewerUri, setViewerUri] = useState(null); // currently displayed document (full-screen modal)

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

  // Pre-approval documents are viewable without OTP (ownership + auth is
  // enough — mirrors the previous behavior of auto-showing the thumbnail).
  // Approved+retained documents are handled separately via the OTP flow.
  useEffect(() => {
    if (!profile || profile.kycStatus === 'approved') return;
    const docs = profile.kycDocuments || {};
    const activeFields = DOC_FIELDS.map((f) => f.key).filter((key) => docs[key]);
    if (activeFields.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(activeFields.map(async (key) => {
        try { return [key, await fetchKycDocumentUri(key)]; }
        catch { return [key, null]; }
      }));
      if (!cancelled) setDocUris(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [profile?.kycStatus, profile?.kycDocuments]);

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
    if (!files.frontImage && !profile?.kycDocuments?.frontImage) {
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

  const submitDecision = async (decision) => {
    setDecisionSaving(true);
    try {
      await api.post('/pandits/me/kyc/document-decision', { decision });
      Toast.show({
        type: 'success',
        text1: decision === 'delete' ? 'Document deleted. Your KYC approval is still active.' : 'Document will be kept securely.',
      });
      fetchProfile();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not save your choice' });
    } finally {
      setDecisionSaving(false);
    }
  };

  const openViewer = async (field) => {
    try {
      const uri = await fetchKycDocumentUri(field);
      setViewerUri(uri);
    } catch (err) {
      if (err.response?.status === 403) {
        setOtpModal({ field, step: 'channel', channel: '', otp: '', busy: false });
      } else {
        Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not load document' });
      }
    }
  };

  const viewDocument = (field) => {
    if (!viewSession || viewSession.expiresAt < Date.now()) {
      setOtpModal({ field, step: 'channel', channel: '', otp: '', busy: false });
      return;
    }
    openViewer(field);
  };

  const sendDocumentOtp = async () => {
    if (!otpModal.channel) { Toast.show({ type: 'error', text1: 'Choose where to receive the OTP' }); return; }
    setOtpModal((m) => ({ ...m, busy: true }));
    try {
      await api.post('/pandits/me/kyc/document/send-otp', { channel: otpModal.channel });
      setOtpModal((m) => ({ ...m, step: 'otp', busy: false }));
      Toast.show({ type: 'success', text1: `OTP sent to your ${otpModal.channel === 'email' ? 'email' : 'registered mobile number'}` });
    } catch (err) {
      setOtpModal((m) => ({ ...m, busy: false }));
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not send OTP' });
    }
  };

  const verifyDocumentOtp = async () => {
    if (!otpModal.otp) { Toast.show({ type: 'error', text1: 'Enter the OTP' }); return; }
    setOtpModal((m) => ({ ...m, busy: true }));
    try {
      const { data } = await api.post('/pandits/me/kyc/document/verify-otp', { channel: otpModal.channel, otp: otpModal.otp });
      setViewSession({ expiresAt: new Date(data.viewSessionExpiresAt).getTime() });
      const field = otpModal.field;
      setOtpModal(null);
      await openViewer(field);
    } catch (err) {
      setOtpModal((m) => ({ ...m, busy: false }));
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Invalid OTP' });
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const kycStatus = profile?.kycStatus || 'not_submitted';
  const canEdit   = ['not_submitted', 'rejected', 'reupload_required'].includes(kycStatus);
  const kycDocs   = profile?.kycDocuments || {};
  const retention = profile?.kycDocumentRetention || 'pending_decision';

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
              const hasServer  = kycDocs[key];
              const hasImage   = localFile || hasServer;

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
                  ) : docUris[key] ? (
                    <Image source={{ uri: docUris[key] }} style={styles.docPreview} resizeMode="cover" />
                  ) : null}

                  <TouchableOpacity
                    style={[styles.uploadBtn, { borderColor: C.primary }]}
                    onPress={() => pickImage(key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={hasImage ? 'refresh' : 'cloud-upload'} size={18} color={C.primary} />
                    <Text style={[styles.uploadBtnText, { color: C.primary }]}>
                      {localFile ? 'Change' : hasServer ? 'Replace' : 'Upload'}
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

        {/* Read-only view when submitted (pre-approval) */}
        {!canEdit && kycStatus !== 'approved' && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Submitted Documents</Text>
            {DOC_FIELDS.map(({ key, label }) =>
              kycDocs[key] ? (
                <View key={key} style={{ gap: 6, marginTop: 10 }}>
                  <Text style={[styles.docLabel, { color: C.textSecondary }]}>{label}</Text>
                  {docUris[key] && <Image source={{ uri: docUris[key] }} style={styles.docPreview} resizeMode="cover" />}
                </View>
              ) : null
            )}
          </View>
        )}

        {/* Post-approval privacy decision */}
        {kycStatus === 'approved' && retention === 'pending_decision' && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Your identity has been successfully verified.</Text>
            <Text style={[styles.docHint, { color: C.textSecondary }]}>
              For your privacy, what would you like to do with your uploaded Government ID? Deleting it does not
              affect your approved KYC status.
            </Text>
            {[
              { value: 'delete', title: 'Delete my uploaded document', sub: 'Permanently removes the file. Your KYC stays approved.', badge: 'Recommended' },
              { value: 'keep',   title: 'Keep my document securely stored', sub: 'Viewing it later will require OTP verification every time.' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setSelectedDecision(opt.value)}
                activeOpacity={0.85}
                style={[styles.decisionOption, { borderColor: selectedDecision === opt.value ? C.primary : C.border }]}
              >
                <Ionicons
                  name={selectedDecision === opt.value ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={selectedDecision === opt.value ? C.primary : C.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.docLabel, { color: C.text }]}>{opt.title}</Text>
                    {opt.badge && <Text style={styles.recommendedBadge}>{opt.badge}</Text>}
                  </View>
                  <Text style={[styles.docHint, { color: C.textSecondary }]}>{opt.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.primary }]}
              onPress={() => submitDecision(selectedDecision)}
              disabled={decisionSaving}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>{decisionSaving ? 'Saving…' : 'Confirm Choice'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {kycStatus === 'approved' && retention === 'deleted' && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }]}>
            <Ionicons name="trash" size={20} color={C.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.docLabel, { color: C.text }]}>Document deleted</Text>
              <Text style={[styles.docHint, { color: C.textSecondary }]}>
                Your uploaded Government ID was permanently deleted per your choice. Your KYC approval remains active.
              </Text>
            </View>
          </View>
        )}

        {kycStatus === 'approved' && retention === 'kept' && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Retained Document</Text>
            <Text style={[styles.docHint, { color: C.textSecondary }]}>
              OTP verification is required to view your document. Access expires 5 minutes after verification.
            </Text>
            {DOC_FIELDS.map(({ key, label }) => kycDocs[key] ? (
              <TouchableOpacity key={key} style={[styles.uploadBtn, { borderColor: C.primary, marginTop: 8 }]} onPress={() => viewDocument(key)} activeOpacity={0.8}>
                <Ionicons name="eye" size={18} color={C.primary} />
                <Text style={[styles.uploadBtnText, { color: C.primary }]}>View {label}</Text>
              </TouchableOpacity>
            ) : null)}
          </View>
        )}
      </ScrollView>

      {/* OTP modal */}
      <Modal visible={!!otpModal} transparent animationType="fade" onRequestClose={() => setOtpModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: C.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Verify to view document</Text>
              <TouchableOpacity onPress={() => setOtpModal(null)}>
                <Ionicons name="close" size={22} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            {otpModal?.step === 'channel' && (
              <>
                <Text style={[styles.docHint, { color: C.textSecondary }]}>Choose where to receive your one-time code.</Text>
                {[
                  { value: 'email', label: 'Registered Email', icon: 'mail' },
                  { value: 'whatsapp', label: 'Registered Mobile Number', icon: 'phone-portrait' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setOtpModal((m) => ({ ...m, channel: opt.value }))}
                    style={[styles.decisionOption, { borderColor: otpModal.channel === opt.value ? C.primary : C.border }]}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={opt.icon} size={18} color={C.primary} />
                    <Text style={[styles.docLabel, { color: C.text }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: C.primary }]} onPress={sendDocumentOtp} disabled={otpModal.busy} activeOpacity={0.85}>
                  <Text style={styles.submitBtnText}>{otpModal.busy ? 'Sending…' : 'Send OTP'}</Text>
                </TouchableOpacity>
              </>
            )}

            {otpModal?.step === 'otp' && (
              <>
                <Text style={[styles.docHint, { color: C.textSecondary }]}>
                  Enter the 6-digit code sent to your {otpModal.channel === 'email' ? 'email' : 'registered mobile number'}.
                </Text>
                <TextInput
                  style={[styles.textInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                  value={otpModal.otp}
                  onChangeText={(v) => setOtpModal((m) => ({ ...m, otp: v.replace(/\D/g, '') }))}
                  placeholder="6-digit OTP"
                  placeholderTextColor={C.textSecondary}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: C.primary }]} onPress={verifyDocumentOtp} disabled={otpModal.busy} activeOpacity={0.85}>
                  <Text style={styles.submitBtnText}>{otpModal.busy ? 'Verifying…' : 'Verify & View'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setOtpModal((m) => ({ ...m, step: 'channel', otp: '' }))}>
                  <Text style={[styles.docHint, { color: C.textSecondary, textAlign: 'center', marginTop: 8 }]}>
                    Choose a different channel / resend
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Full-screen document viewer */}
      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
          {viewerUri && <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
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
  decisionOption: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 2, borderRadius: 12, padding: 12,
  },
  recommendedBadge: {
    fontSize: 9, fontWeight: '800', color: '#15803D', backgroundColor: '#DCFCE7',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden',
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalCard:     { borderRadius: 18, padding: 18, gap: 12 },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewerBackdrop:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage:   { width: '100%', height: '80%' },
  viewerClose:   { position: 'absolute', top: 50, right: 20, zIndex: 1 },
});
