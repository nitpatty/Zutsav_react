import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatDateTime, formatStatus, daysUntil, referralStatusColor, referralUrl } from '../../utils/helpers';
import { openWhatsApp } from '../../utils/quickActions';
import StatusBadge from '../../components/StatusBadge';
import ScreenHeader from '../../components/ScreenHeader';
import Timeline from '../../components/shared/Timeline';
import { InfoCard, Row } from '../../components/shared/InfoCard';

export default function PanditReferralDetailScreen({ route }) {
  const { referral: initial } = route.params || {};
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [referral, setReferral] = useState(initial);
  const [remarkModal, setRemarkModal] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!referral) return null;

  const url = referral.link || referralUrl(referral.token);
  const days = referral.expiresAt ? daysUntil(referral.expiresAt) : null;
  const expired = referral.status === 'EXPIRED' || (days !== null && days < 0);

  const copyLink = async () => {
    await Clipboard.setStringAsync(url);
    Toast.show({ type: 'success', text1: 'Link copied' });
  };

  const shareWhatsApp = () => {
    openWhatsApp(referral.userMobile, `Book a pooja via Zutsav: ${url}`);
  };

  const shareNative = async () => {
    try {
      await Share.share({ message: `Book a pooja via Zutsav: ${url}`, url });
    } catch {}
  };

  const handleSubmitRemark = async () => {
    if (remarkText.trim().length < 20) {
      Toast.show({ type: 'error', text1: 'Remark must be at least 20 characters' });
      return;
    }
    try {
      setSubmitting(true);
      const { data } = await api.patch(`/referral/${referral._id}/remark`, { remark: remarkText.trim() });
      setReferral(data.data || data.referral || { ...referral, status: 'REMARK_SUBMITTED', remark: remarkText.trim() });
      Toast.show({ type: 'success', text1: 'Remark submitted' });
      setRemarkModal(false);
      setRemarkText('');
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed to submit remark' });
    } finally {
      setSubmitting(false);
    }
  };

  const timelineEvents = (referral.statusHistory || []).map((h) => ({
    label: formatStatus(h.status),
    note: h.note,
    at: h.at,
  }));

  const booking = referral.bookingId;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Referral Detail" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>

        <View style={styles.row}>
          <StatusBadge status={referral.status} colorMap={referralStatusColor} />
          {days !== null && (
            <Text style={[styles.expiryText, { color: expired ? '#DC2626' : C.textSecondary }]}>
              {expired ? 'Expired' : `Expires in ${days}d`}
            </Text>
          )}
        </View>

        <InfoCard title="Referral Link" C={C}>
          <Text style={[styles.linkText, { color: C.text, backgroundColor: C.background, borderColor: C.border }]} selectable numberOfLines={2}>
            {url}
          </Text>
          <View style={styles.actionRow}>
            <ActionBtn icon="copy-outline" label="Copy" C={C} onPress={copyLink} />
            <ActionBtn icon="logo-whatsapp" label="WhatsApp" C={C} onPress={shareWhatsApp} />
            <ActionBtn icon="share-social-outline" label="Share" C={C} onPress={shareNative} />
          </View>
        </InfoCard>

        <View style={[styles.qrCard, { backgroundColor: '#fff', borderColor: C.border }]}>
          <QRCode value={url} size={160} />
        </View>

        <InfoCard title="Customer" C={C}>
          <Row label="Mobile" value={referral.userMobile || '—'} C={C} />
          {referral.userEmail ? <Row label="Email" value={referral.userEmail} C={C} /> : null}
        </InfoCard>

        <InfoCard title="Referral Details" C={C}>
          {referral.poojaId?.name ? <Row label="Recommended Pooja" value={referral.poojaId.name} C={C} /> : null}
          {referral.preferredDate ? <Row label="Preferred Date" value={formatDate(referral.preferredDate)} C={C} /> : null}
          <Row label="Will Perform Personally" value={referral.performByReferringPandit ? 'Yes' : 'No'} C={C} />
          {!referral.performByReferringPandit && referral.referralReason ? (
            <Row label="Reason" value={referral.referralReason} C={C} />
          ) : null}
          <Row label="Created" value={formatDateTime(referral.createdAt)} C={C} />
        </InfoCard>

        {booking && (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => navigation.navigate('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: booking._id } })}
            activeOpacity={0.85}
          >
            <Text style={[styles.cardTitle, { color: C.text }]}>Booking Details</Text>
            <View style={{ gap: 6, marginTop: 8 }}>
              <Row label="Booking Number" value={booking.bookingNumber || '—'} C={C} />
              <Row label="Status" value={formatStatus(booking.status)} C={C} />
              {booking.scheduledDate ? <Row label="Scheduled" value={formatDateTime(booking.scheduledDate)} C={C} /> : null}
            </View>
          </TouchableOpacity>
        )}

        {referral.remark ? (
          <InfoCard title="Your Remark" C={C}>
            <Text style={[styles.remarkText, { color: C.text }]}>{referral.remark}</Text>
            {referral.remarkSubmittedAt ? (
              <Text style={[styles.remarkMeta, { color: C.textSecondary }]}>Submitted {formatDateTime(referral.remarkSubmittedAt)}</Text>
            ) : null}
          </InfoCard>
        ) : null}

        <InfoCard title="Status Timeline" C={C}>
          <Timeline events={timelineEvents} />
        </InfoCard>

        {referral.status === 'PENDING_REMARK' && (
          <TouchableOpacity
            style={[styles.remarkBtn, { backgroundColor: '#D97706' }]}
            onPress={() => { setRemarkText(referral.remark || ''); setRemarkModal(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.remarkBtnText}>Submit Mandatory Remark</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={remarkModal} transparent animationType="slide" onRequestClose={() => setRemarkModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Submit Remark</Text>
            <Text style={[styles.modalSub, { color: C.textSecondary }]}>
              This referral has been booked. Please share your remark — this is mandatory before it can proceed.
            </Text>
            <TextInput
              style={[styles.reasonInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Your remark (min 20 characters)…"
              placeholderTextColor={C.textSecondary}
              value={remarkText}
              onChangeText={setRemarkText}
              multiline
              autoFocus
              maxLength={1000}
            />
            <Text style={[styles.charCount, { color: C.textSecondary }]}>{remarkText.trim().length}/1000 (min 20)</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setRemarkModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#D97706' }]} onPress={handleSubmitRemark} disabled={submitting}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{submitting ? 'Submitting…' : 'Submit Remark'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionBtn({ icon, label, C, onPress }) {
  return (
    <TouchableOpacity style={[styles.actionBtn, { borderColor: C.border }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={18} color={C.primary} />
      <Text style={[styles.actionBtnText, { color: C.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  row:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  expiryText:   { fontSize: 12, fontWeight: '600' },
  card:         { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle:    { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  linkText:     { fontSize: 12, fontFamily: 'monospace', borderWidth: 1, borderRadius: 10, padding: 10 },
  actionRow:    { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn:    { flex: 1, alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  actionBtnText:{ fontSize: 11, fontWeight: '600' },
  qrCard:       { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center' },
  remarkText:   { fontSize: 13, lineHeight: 20 },
  remarkMeta:   { fontSize: 11, marginTop: 6 },
  remarkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  remarkBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 12 },
  modalTitle:   { fontSize: 18, fontWeight: '800' },
  modalSub:     { fontSize: 12, lineHeight: 18 },
  reasonInput:  { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  charCount:    { fontSize: 11, textAlign: 'right' },
  modalBtns:    { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtn:    { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
