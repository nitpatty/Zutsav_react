import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, StyleSheet, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { usePanditStatusStore } from '../../store/panditStatusStore';
import { callPhone, openWhatsApp } from '../../utils/quickActions';
import LoadingSpinner from '../../components/LoadingSpinner';
import Card from '../../components/ui/Card';
import IconContainer from '../../components/ui/IconContainer';
import { PrimaryButton, OutlinedButton } from '../../components/ui/Button';
import { Heading, SectionHeading, Body, Caption, Label } from '../../components/ui/Typography';
import { COLORS, SPACING, RADIUS } from '../../theme/tokens';

// Mirrors web's frontend/src/pages/PanditStatus.jsx STATUS_MAP + ApplicationGate
// 1:1 against the real backend enum (backend/src/models/Pandit.js `status`):
// pending | under_review | approved | rejected | suspended | reupload_required
const STATUS_META = {
  pending: {
    icon: 'time-outline', tint: COLORS.warning, bg: COLORS.warningBg,
    title: 'Application Submitted Successfully',
    description: 'Your application has been received and is waiting to be reviewed by our team.',
    timeline: 'Applications are typically reviewed within 24–48 hours.',
    steps: [
      { done: true,  label: 'Application submitted' },
      { done: false, label: 'Documents under review' },
      { done: false, label: 'Admin approval' },
      { done: false, label: 'Dashboard unlocked' },
    ],
  },
  under_review: {
    icon: 'search-outline', tint: COLORS.info, bg: COLORS.infoBg,
    title: 'Verification In Progress',
    description: 'Our team is actively verifying your documents.',
    timeline: 'This usually takes a few hours.',
    steps: [
      { done: true,  label: 'Application submitted' },
      { done: true,  label: 'Documents under review' },
      { done: false, label: 'Admin approval' },
      { done: false, label: 'Dashboard unlocked' },
    ],
  },
  reupload_required: {
    icon: 'cloud-upload-outline', tint: '#8B5CF6', bg: '#F3EEFF',
    title: 'Re-upload Required',
    description: 'Admin has requested you to re-submit your identification documents with clearer images.',
    showKycAction: true,
  },
  rejected: {
    icon: 'close-circle-outline', tint: COLORS.error, bg: COLORS.errorBg,
    title: 'Account Not Approved',
    description: 'Your application was not approved.',
    showKycAction: true,
  },
  suspended: {
    icon: 'ban-outline', tint: '#C2410C', bg: '#FFEDD5',
    title: 'Account Suspended',
    description: 'Your account has been suspended. Please contact our support team to resolve this.',
  },
};

function ProgressSteps({ steps }) {
  return (
    <View style={{ gap: SPACING.sm }}>
      <Label>PROGRESS</Label>
      {steps.map((s, i) => (
        <View key={i} style={styles.stepRow}>
          <Ionicons
            name={s.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={s.done ? COLORS.success : COLORS.textMuted}
          />
          <Body color={s.done ? COLORS.success : COLORS.textMuted}>{s.label}</Body>
        </View>
      ))}
    </View>
  );
}

function DetailChip({ label, value }) {
  return (
    <View style={styles.detailChip}>
      <Caption>{label}</Caption>
      <Body numberOfLines={1} style={{ fontWeight: '700' }}>{value || '—'}</Body>
    </View>
  );
}

export default function PanditStatusScreen() {
  const navigation = useNavigation();
  const { logout } = useAuthStore();
  const { pandit, phase, fetch, reset, lastFetchedAt } = usePanditStatusStore();
  const [refreshing, setRefreshing] = useState(false);
  const [support, setSupport] = useState(null);

  useEffect(() => {
    api.get('/settings/public').then(({ data }) => setSupport(data.settings)).catch(() => {});
  }, []);

  // Automatic refresh after profile updates (e.g. returning from KYC re-submission)
  useFocusEffect(useCallback(() => { fetch(); }, [fetch]));

  const handleManualRefresh = () => fetch();

  const handlePullToRefresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  const handleContactSupport = () => {
    if (support?.supportPhone) return callPhone(support.supportPhone);
    if (support?.whatsappNumber) return openWhatsApp(support.whatsappNumber);
    if (support?.customerCareNumber) return callPhone(support.customerCareNumber);
    Alert.alert('Contact Support', 'Support contact details are currently unavailable. Please try again later.');
  };

  const handleResubmitKYC = () => navigation.navigate('PanditKYC');

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => { reset(); logout(); } },
    ]);
  };

  if (phase === 'loading' && !pandit) return <LoadingSpinner fullScreen text="Checking your application status…" />;

  // No pandit profile at all — can't verify approval, so fail closed rather
  // than silently granting dashboard access.
  if (phase === 'not_found') {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card elevation="floating" style={styles.headerCard}>
            <IconContainer name="alert-circle-outline" size="lg" color={COLORS.error} tint={COLORS.errorBg} />
            <Heading style={{ marginTop: SPACING.base }}>Profile Not Found</Heading>
            <Body color={COLORS.textSecondary} style={{ marginTop: SPACING.xs, textAlign: 'center' }}>
              We couldn't find a pandit application for your account. Please contact support.
            </Body>
          </Card>
          <PrimaryButton title="Contact Support" onPress={handleContactSupport} style={{ marginTop: SPACING.lg }} />
          <OutlinedButton title="Logout" onPress={handleLogout} style={{ marginTop: SPACING.md }} />
        </ScrollView>
      </View>
    );
  }

  if (phase === 'error' && !pandit) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card elevation="floating" style={styles.headerCard}>
            <IconContainer name="cloud-offline-outline" size="lg" color={COLORS.textSecondary} />
            <Heading style={{ marginTop: SPACING.base }}>Couldn't Load Status</Heading>
            <Body color={COLORS.textSecondary} style={{ marginTop: SPACING.xs, textAlign: 'center' }}>
              Check your connection and try again.
            </Body>
          </Card>
          <PrimaryButton title="Retry" icon={<Ionicons name="refresh" size={18} color={COLORS.onPrimary} />} onPress={handleManualRefresh} style={{ marginTop: SPACING.lg }} />
          <OutlinedButton title="Logout" onPress={handleLogout} style={{ marginTop: SPACING.md }} />
        </ScrollView>
      </View>
    );
  }

  const meta = STATUS_META[pandit?.status] || STATUS_META.pending;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handlePullToRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Card elevation="floating" style={[styles.headerCard, { backgroundColor: meta.bg }]}>
          <IconContainer name={meta.icon} size="lg" color={meta.tint} tint={COLORS.surface} shape="circle" />
          <Label style={{ marginTop: SPACING.lg }}>CURRENT STATUS</Label>
          <Heading style={{ marginTop: SPACING.xs, textAlign: 'center' }}>{meta.title}</Heading>
          <Body color={COLORS.textSecondary} style={{ marginTop: SPACING.sm, textAlign: 'center' }}>
            {meta.description}
          </Body>
          {meta.timeline && (
            <Caption style={{ marginTop: SPACING.sm, textAlign: 'center', fontStyle: 'italic' }}>
              {meta.timeline}
            </Caption>
          )}
        </Card>

        {!!pandit?.adminNote && (
          <Card style={styles.section}>
            <Label>MESSAGE FROM ADMIN</Label>
            <Body style={{ marginTop: SPACING.xs }}>{pandit.adminNote}</Body>
          </Card>
        )}

        {meta.steps && (
          <Card style={styles.section}>
            <ProgressSteps steps={meta.steps} />
          </Card>
        )}

        {pandit && (
          <View style={styles.detailsGrid}>
            <DetailChip label="Name" value={pandit.name} />
            <DetailChip label="Phone" value={pandit.phone} />
            <DetailChip label="Email" value={pandit.email} />
            <DetailChip label="Applied" value={pandit.createdAt ? new Date(pandit.createdAt).toLocaleDateString('en-IN') : '—'} />
          </View>
        )}

        <View style={styles.actions}>
          {meta.showKycAction && (
            <PrimaryButton
              title="Re-submit KYC Documents"
              icon={<Ionicons name="document-attach-outline" size={18} color={COLORS.onPrimary} />}
              onPress={handleResubmitKYC}
            />
          )}
          <OutlinedButton
            title="Contact Support"
            icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.primaryDark} />}
            onPress={handleContactSupport}
            style={{ marginTop: SPACING.md }}
          />
          <OutlinedButton
            title="Refresh Status"
            icon={<Ionicons name="refresh" size={18} color={COLORS.primaryDark} />}
            onPress={handleManualRefresh}
            style={{ marginTop: SPACING.md }}
          />
          {lastFetchedAt && (
            <Caption style={{ textAlign: 'center', marginTop: SPACING.sm }}>
              Last checked: {new Date(lastFetchedAt).toLocaleTimeString('en-IN')}
            </Caption>
          )}
          <OutlinedButton
            title="Logout"
            icon={<Ionicons name="log-out-outline" size={18} color="#DC2626" />}
            onPress={handleLogout}
            style={[styles.logoutBtn, { marginTop: SPACING.xl }]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.lg, paddingTop: SPACING.xxxl, paddingBottom: SPACING.huge },
  headerCard: { alignItems: 'center', padding: SPACING.xl },
  section: { marginTop: SPACING.lg },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  detailsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg,
  },
  detailChip: {
    flexBasis: '47%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.md, gap: 2,
  },
  actions: { marginTop: SPACING.xl },
  logoutBtn: { borderColor: '#DC262640' },
});
