import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft,
  Loader2, AlertCircle, Coins, TrendingUp, TrendingDown,
  Gift, Shield, Tag, UserPlus,
} from 'lucide-react';
import API from '../api/axios';

/* ── Helper: format date ─────────────────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Transaction type config ─────────────────────────────────── */
const TX_TYPES = {
  REFERRAL_REGISTRATION: { icon: UserPlus, color: 'text-blue-500', bg: 'bg-blue-100' },
  REFERRAL_BOOKING_REWARD: { icon: Gift, color: 'text-green-500', bg: 'bg-green-100' },
  COIN_REDEMPTION: { icon: Tag, color: 'text-purple-500', bg: 'bg-purple-100' },
  ADMIN_ADJUSTMENT: { icon: Shield, color: 'text-amber-500', bg: 'bg-amber-100' },
};

/* ── Transaction Row ─────────────────────────────────────────── */
function TransactionRow({ tx, t }) {
  const isCredit = tx.direction === 'CREDIT';
  const typeConfig = TX_TYPES[tx.type] || { icon: Coins, color: 'text-gray-500', bg: 'bg-gray-100' };
  const Icon = typeConfig.icon;

  const typeLabels = {
    REFERRAL_REGISTRATION: t('wallet.typeRegistration'),
    REFERRAL_BOOKING_REWARD: t('wallet.typeBookingReward'),
    COIN_REDEMPTION: t('wallet.typeRedemption'),
    ADMIN_ADJUSTMENT: t('wallet.typeAdjustment'),
  };

  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-gray-100 last:border-0">
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${typeConfig.bg}`}>
        <Icon size={18} className={typeConfig.color} />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {typeLabels[tx.type] || tx.type}
        </p>
        {tx.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{tx.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(tx.createdAt)}</p>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <span className={`text-sm font-bold ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
          {isCredit ? '+' : '-'}{tx.amount}
        </span>
        <div className="flex items-center gap-1 justify-end mt-0.5">
          {isCredit ? (
            <ArrowDownLeft size={12} className="text-green-500" />
          ) : (
            <ArrowUpRight size={12} className="text-red-500" />
          )}
          <span className={`text-xs ${isCredit ? 'text-green-500' : 'text-red-400'}`}>
            {isCredit ? t('wallet.credit') : t('wallet.debit')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */
export default function Wallet() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  // Fetch wallet balance
  const { data: walletData, isLoading: walletLoading, error: walletError } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const { data } = await API.get('/wallet');
      return data.wallet;
    },
  });

  // Fetch transactions
  const { data: txData, isLoading: txLoading, error: txError } = useQuery({
    queryKey: ['wallet-transactions', page],
    queryFn: async () => {
      const { data } = await API.get(`/wallet/transactions?page=${page}&limit=20`);
      return data;
    },
    keepPreviousData: true,
  });

  const transactions = txData?.transactions || [];
  const total = txData?.total || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <WalletIcon size={20} className="text-amber-600" />
          </div>
          {t('wallet.pageTitle')}
        </h1>
        <p className="text-gray-500 mt-2">{t('wallet.pageSubtitle')}</p>
      </div>

      {/* Wallet balance card */}
      {walletLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-saffron-500" />
          <span className="ml-3 text-gray-500">{t('wallet.loading')}</span>
        </div>
      )}

      {walletError && (
        <div className="flex flex-col items-center py-12 text-center">
          <AlertCircle size={40} className="text-red-400 mb-3" />
          <p className="text-gray-600 font-medium">{t('wallet.error')}</p>
        </div>
      )}

      {walletData && (
        <div className="bg-gradient-to-br from-saffron-500 to-amber-500 rounded-3xl p-8 text-white mb-8 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <Coins size={24} className="opacity-80" />
            <span className="text-sm font-medium opacity-80">{t('wallet.balanceLabel')}</span>
          </div>
          <p className="text-5xl font-bold mb-6">{walletData.balance}</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/15 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="opacity-80" />
                <span className="text-xs font-medium opacity-80">{t('wallet.totalEarned')}</span>
              </div>
              <p className="text-xl font-bold">{walletData.totalEarned}</p>
            </div>
            <div className="bg-white/15 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={16} className="opacity-80" />
                <span className="text-xs font-medium opacity-80">{t('wallet.totalRedeemed')}</span>
              </div>
              <p className="text-xl font-bold">{walletData.totalRedeemed}</p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800">{t('wallet.transactionsTitle')}</h2>
      </div>

      {txLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-saffron-500" />
        </div>
      )}

      {txError && (
        <div className="flex flex-col items-center py-12 text-center">
          <AlertCircle size={40} className="text-red-400 mb-3" />
          <p className="text-gray-600 font-medium">{t('wallet.error')}</p>
        </div>
      )}

      {!txLoading && !txError && transactions.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <WalletIcon size={28} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{t('wallet.noTransactionsTitle')}</h3>
          <p className="text-gray-500 text-sm max-w-sm">{t('wallet.noTransactionsDesc')}</p>
        </div>
      )}

      {!txLoading && !txError && transactions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-2">
          {transactions.map((tx) => (
            <TransactionRow key={tx._id} tx={tx} t={t} />
          ))}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-3 py-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-xl border text-sm font-medium disabled:opacity-40"
              >
                ← {t('common.back')}
              </button>
              <span className="px-4 py-2 text-sm text-gray-500">
                Page {page} · {total} total
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={transactions.length < 20}
                className="px-4 py-2 rounded-xl border text-sm font-medium disabled:opacity-40"
              >
                {t('wallet.loadMore')} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
