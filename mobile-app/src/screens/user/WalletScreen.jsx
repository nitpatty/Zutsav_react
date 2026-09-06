import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore } from '../../store/themeStore';
import { useTranslation } from '../../i18n';
import api from '../../api/axios';
import ScreenHeader from '../../components/ScreenHeader';

/* ── Helper: format date ─────────────────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Transaction type config ─────────────────────────────────── */
function getTxConfig(type, t) {
  const configs = {
    REFERRAL_REGISTRATION: { icon: 'person-add-outline', color: '#2563EB', bg: '#DBEAFE', label: t('wallet.typeRegistration') },
    REFERRAL_BOOKING_REWARD: { icon: 'gift-outline', color: '#16A34A', bg: '#DCFCE7', label: t('wallet.typeBookingReward') },
    COIN_REDEMPTION: { icon: 'pricetag-outline', color: '#9333EA', bg: '#F3E8FF', label: t('wallet.typeRedemption') },
    ADMIN_ADJUSTMENT: { icon: 'shield-checkmark-outline', color: '#D97706', bg: '#FEF3C7', label: t('wallet.typeAdjustment') },
  };
  return configs[type] || { icon: 'coins-outline', color: '#6B7280', bg: '#F3F4F6', label: type };
}

/* ── Transaction Row ─────────────────────────────────────────── */
function TransactionRow({ tx, C, t }) {
  const isCredit = tx.direction === 'CREDIT';
  const typeConfig = getTxConfig(tx.type, t);

  return (
    <View style={[styles.txRow, { borderBottomColor: C.border }]}>
      <View style={[styles.txIcon, { backgroundColor: typeConfig.bg }]}>
        <Ionicons name={typeConfig.icon} size={18} color={typeConfig.color} />
      </View>
      <View style={styles.txDetails}>
        <Text style={[styles.txLabel, { color: C.text }]} numberOfLines={1}>
          {typeConfig.label}
        </Text>
        {tx.description && (
          <Text style={[styles.txDesc, { color: C.textSecondary }]} numberOfLines={1}>
            {tx.description}
          </Text>
        )}
        <Text style={[styles.txDate, { color: C.textLight }]}>{fmtDate(tx.createdAt)}</Text>
      </View>
      <View style={styles.txAmount}>
        <Text style={[styles.txAmountText, { color: isCredit ? '#16A34A' : '#DC2626' }]}>
          {isCredit ? '+' : '-'}{tx.amount}
        </Text>
        <View style={styles.txDir}>
          <Ionicons
            name={isCredit ? 'arrow-down-outline' : 'arrow-up-outline'}
            size={10}
            color={isCredit ? '#16A34A' : '#DC2626'}
          />
          <Text style={[styles.txDirText, { color: isCredit ? '#16A34A' : '#DC2626' }]}>
            {isCredit ? t('wallet.credit') : t('wallet.debit')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ── Main Screen ─────────────────────────────────────────────── */
export default function WalletScreen() {
  const { theme } = useThemeStore();
  const { t } = useTranslation();
  const C = theme.colors;

  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchWallet = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/wallet');
      setWallet(data.wallet);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || t('wallet.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchTransactions = useCallback(async (pageNum = 1) => {
    try {
      setTxLoading(true);
      const { data } = await api.get(`/wallet/transactions?page=${pageNum}&limit=20`);
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
      setPage(pageNum);
    } catch {}
    finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
    fetchTransactions();
  }, [fetchWallet, fetchTransactions]);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('wallet.pageTitle')} />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Balance card */}
        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        )}

        {error && !loading && (
          <View style={styles.centerBox}>
            <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
            <Text style={[styles.errorText, { color: C.text }]}>{error}</Text>
          </View>
        )}

        {wallet && (
          <LinearGradient
            colors={[C.primary, C.primaryDark || C.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <View style={styles.balanceHeader}>
              <Ionicons name="wallet-outline" size={22} color="rgba(255,255,255,0.8)" />
              <Text style={styles.balanceLabel}>{t('wallet.balanceLabel')}</Text>
            </View>
            <Text style={styles.balanceAmount}>{wallet.balance}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="trending-up-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.statLabel}>{t('wallet.totalEarned')}</Text>
                <Text style={styles.statValue}>{wallet.totalEarned}</Text>
              </View>
              <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="trending-down-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.statLabel}>{t('wallet.totalRedeemed')}</Text>
                <Text style={styles.statValue}>{wallet.totalRedeemed}</Text>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* Coin redemption info */}
        {wallet && Number(wallet.coinMonetaryValue) > 0 && (
          <View style={[styles.coinCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.coinCardRow}>
              <Ionicons name="logo-bitcoin" size={18} color="#D97706" />
              <Text style={[styles.coinCardTitle, { color: C.text }]}>Coin Redemption</Text>
            </View>
            <Text style={[styles.coinCardLine, { color: C.textSecondary }]}>
              1 coin = ₹{Number(wallet.coinMonetaryValue)} · Redeemable at checkout for Pooja bookings
            </Text>
            {Number(wallet.coinRedemptionMinCoins) > 0 && (
              <Text style={[styles.coinCardLine, { color: wallet.balance >= wallet.coinRedemptionMinCoins ? '#16A34A' : '#D97706' }]}>
                Requires at least {wallet.coinRedemptionMinCoins} coins{wallet.balance >= wallet.coinRedemptionMinCoins ? ' — you qualify ✓' : ` — you have ${wallet.balance}`}
              </Text>
            )}
          </View>
        )}

        {/* Transaction history */}
        <View style={styles.txSection}>
          <Text style={[styles.txSectionTitle, { color: C.text }]}>{t('wallet.transactionsTitle')}</Text>

          {txLoading && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          )}

          {!txLoading && transactions.length === 0 && (
            <View style={styles.centerBox}>
              <Ionicons name="receipt-outline" size={36} color={C.textLight} />
              <Text style={[styles.emptyText, { color: C.textSecondary }]}>{t('wallet.noTransactionsTitle')}</Text>
            </View>
          )}

          {!txLoading && transactions.length > 0 && (
            <View style={[styles.txList, { backgroundColor: C.surface, borderColor: C.border }]}>
              {transactions.map((tx) => (
                <TransactionRow key={tx._id} tx={tx} C={C} t={t} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerBox: { alignItems: 'center', paddingVertical: 40 },
  errorText: { fontSize: 15, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  balanceCard: {
    margin: 16, padding: 24, borderRadius: 24,
  },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  balanceLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  balanceAmount: { fontSize: 44, fontWeight: '800', color: '#fff', marginBottom: 20 },
  statsRow: { flexDirection: 'row' },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#fff' },
  coinCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16, gap: 6 },
  coinCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinCardTitle: { fontSize: 14, fontWeight: '800' },
  coinCardLine: { fontSize: 12.5, lineHeight: 18 },
  txSection: { paddingHorizontal: 16, marginTop: 8 },
  txSectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  txList: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  txDetails: { flex: 1 },
  txLabel: { fontSize: 14, fontWeight: '600' },
  txDesc: { fontSize: 12, marginTop: 1 },
  txDate: { fontSize: 11, marginTop: 2 },
  txAmount: { alignItems: 'flex-end' },
  txAmountText: { fontSize: 15, fontWeight: '700' },
  txDir: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  txDirText: { fontSize: 11, fontWeight: '500' },
  emptyText: { fontSize: 14, marginTop: 8 },
});
