import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Share, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';
import { useTranslation } from '../../i18n';
import api from '../../api/axios';
import ScreenHeader from '../../components/ScreenHeader';

/* ── Helper: format date ─────────────────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/* ── Helper: time remaining ──────────────────────────────────── */
function timeRemaining(expiresAt) {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

/* ── Referral Code Card ──────────────────────────────────────── */
function ReferralCard({ code, onCopy, onShare, C, t }) {
  const statusConfig = {
    AVAILABLE: { label: t('referrals.statusAvailable'), color: '#16A34A', bg: '#DCFCE7' },
    USED: { label: t('referrals.statusUsed'), color: '#2563EB', bg: '#DBEAFE' },
    EXPIRED: { label: t('referrals.statusExpired'), color: '#DC2626', bg: '#FEE2E2' },
  };

  const isAvailable = code.status === 'AVAILABLE' && !code.isExpired;
  const isExpired = code.status === 'EXPIRED' || code.isExpired;
  const displayStatus = isExpired ? 'EXPIRED' : code.status;
  const statusInfo = statusConfig[displayStatus] || statusConfig.AVAILABLE;

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={[styles.codeText, { color: C.text }]}>{code.code}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
        </View>
      </View>

      {/* Link */}
      <View style={[styles.linkRow, { backgroundColor: C.background }]}>
        <Ionicons name="link-outline" size={14} color={C.textSecondary} />
        <Text style={[styles.linkText, { color: C.textSecondary }]} numberOfLines={1}>
          {code.referralLink}
        </Text>
      </View>

      {/* Dates */}
      <View style={styles.datesRow}>
        <View style={styles.dateItem}>
          <Ionicons name="time-outline" size={12} color={C.textSecondary} />
          <Text style={[styles.dateText, { color: C.textSecondary }]}>
            {t('referrals.createdDate')}: {fmtDate(code.createdAt)}
          </Text>
        </View>
        {code.expiresAt && !isExpired && (
          <View style={styles.dateItem}>
            <Ionicons name="time-outline" size={12} color="#D97706" />
            <Text style={[styles.dateText, { color: '#D97706' }]}>
              {t('referrals.expiresDate')}: {fmtDate(code.expiresAt)} · {timeRemaining(code.expiresAt)}
            </Text>
          </View>
        )}
        {isExpired && (
          <View style={styles.dateItem}>
            <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
            <Text style={[styles.dateText, { color: '#DC2626' }]}>
              {t('referrals.expiresDate')}: {fmtDate(code.expiresAt)}
            </Text>
          </View>
        )}
      </View>

      {/* Referred user */}
      {code.status === 'USED' && code.usedBy && (
        <View style={[styles.referredRow, { backgroundColor: '#EFF6FF' }]}>
          <Ionicons name="people-outline" size={14} color="#2563EB" />
          <Text style={styles.referredText}>{t('referrals.referredUser')}</Text>
          {code.usedAt && (
            <Text style={styles.referredDate}>· {fmtDate(code.usedAt)}</Text>
          )}
        </View>
      )}

      {/* Actions */}
      {isAvailable && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: C.primary }]}
            onPress={() => onCopy(code)}
            activeOpacity={0.7}
          >
            <Ionicons name="copy-outline" size={16} color={C.primary} />
            <Text style={[styles.actionBtnText, { color: C.primary }]}>{t('referrals.copyLink')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#25D366', borderColor: '#25D366' }]}
            onPress={() => onShare(code, 'whatsapp')}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-whatsapp" size={16} color="#fff" />
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>{t('referrals.shareWhatsApp')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: C.border }]}
            onPress={() => onShare(code, 'native')}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ── Main Screen ─────────────────────────────────────────────── */
export default function MyReferralsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const { t } = useTranslation();
  const C = theme.colors;

  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState(null);

  const fetchCodes = useCallback(async (pageNum = 1) => {
    try {
      setLoading(true);
      const { data } = await api.get(`/user-referrals/my?page=${pageNum}&limit=20`);
      setCodes(data.codes || []);
      setTotal(data.total || 0);
      setPage(pageNum);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || t('referrals.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/user-referrals/settings');
      setSettings(data.settings);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCodes();
    fetchSettings();
  }, [fetchCodes, fetchSettings]);

  const handleGenerate = async () => {
    if (generating) return;
    try {
      setGenerating(true);
      await api.post('/user-referrals/generate');
      Alert.alert(t('common.ok'), t('referrals.generateSuccess'));
      fetchCodes();
    } catch (err) {
      Alert.alert(t('common.ok'), err.response?.data?.message || t('referrals.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (code) => {
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(code.referralLink);
      Alert.alert(t('common.ok'), t('referrals.linkCopied'));
    } catch {
      Alert.alert(t('common.ok'), code.referralLink);
    }
  };

  const handleShare = async (code, method) => {
    const message = `Join Zutsav using my referral link:\n\n${code.referralLink}`;
    try {
      await Share.share({ message, url: code.referralLink });
    } catch {}
  };

  const dailyLimit = settings?.dailyLimit || 5;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const usedToday = codes.filter(c => new Date(c.createdAt) >= todayStart).length;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('referrals.pageTitle')} />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Reward info */}
        <View style={[styles.infoBanner, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
          <Ionicons name="sparkles" size={18} color="#D97706" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.infoTitle}>{t('referrals.rewardInfo')}</Text>
            <Text style={styles.infoSubtitle}>
              {t('referrals.dailyLimitInfo', { used: usedToday, limit: dailyLimit })}
            </Text>
          </View>
        </View>

        {/* Generate button */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: C.primary }]}
            onPress={handleGenerate}
            disabled={generating || usedToday >= dailyLimit}
            activeOpacity={0.8}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="gift-outline" size={18} color="#fff" />
            )}
            <Text style={styles.generateBtnText}>
              {generating ? t('referrals.generating') : t('referrals.generateCode')}
            </Text>
          </TouchableOpacity>
          {usedToday >= dailyLimit && (
            <Text style={styles.limitText}>
              {t('referrals.dailyLimitReached', { used: usedToday, limit: dailyLimit })}
            </Text>
          )}
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.loadingText, { color: C.textSecondary }]}>{t('referrals.loading')}</Text>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.centerBox}>
            <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
            <Text style={[styles.errorText, { color: C.text }]}>{error}</Text>
            <TouchableOpacity onPress={() => fetchCodes()} style={[styles.retryBtn, { borderColor: C.primary }]}>
              <Text style={[styles.retryBtnText, { color: C.primary }]}>{t('referrals.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {!loading && !error && codes.length === 0 && (
          <View style={styles.centerBox}>
            <View style={[styles.emptyIcon, { backgroundColor: C.primary + '15' }]}>
              <Ionicons name="gift-outline" size={32} color={C.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: C.text }]}>{t('referrals.noReferralsTitle')}</Text>
            <Text style={[styles.emptyDesc, { color: C.textSecondary }]}>
              {t('referrals.noReferralsDesc')}
            </Text>
          </View>
        )}

        {/* Referral cards */}
        {!loading && !error && codes.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
            {codes.map((code) => (
              <ReferralCard
                key={code._id}
                code={code}
                onCopy={handleCopy}
                onShare={handleShare}
                C={C}
                t={t}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 16, padding: 14,
    borderRadius: 16, borderWidth: 1,
  },
  infoTitle: { fontSize: 13.5, fontWeight: '700', color: '#92400E' },
  infoSubtitle: { fontSize: 12, color: '#B45309', marginTop: 2 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 16,
  },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  limitText: { fontSize: 12, color: '#D97706', textAlign: 'center', marginTop: 6 },
  centerBox: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  loadingText: { fontSize: 14, marginTop: 12 },
  errorText: { fontSize: 15, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 12, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 8 },
  retryBtnText: { fontSize: 14, fontWeight: '600' },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: {
    borderRadius: 18, borderWidth: 1, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  codeText: { fontSize: 20, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, marginBottom: 10 },
  linkText: { fontSize: 11, flex: 1 },
  datesRow: { gap: 4, marginBottom: 10 },
  dateItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 11.5 },
  referredRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, marginBottom: 10 },
  referredText: { fontSize: 12, fontWeight: '600', color: '#2563EB', flex: 1 },
  referredDate: { fontSize: 11, color: '#60A5FA' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});
