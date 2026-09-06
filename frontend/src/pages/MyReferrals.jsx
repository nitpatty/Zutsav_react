import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Gift, Copy, CheckCircle, Share2, ExternalLink,
  Clock, Users, AlertCircle, Loader2, Sparkles,
} from 'lucide-react';
import API from '../api/axios';

/* ── Helper: format date for display ─────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/* ── Helper: time remaining for expiry ───────────────────────── */
function timeRemaining(expiresAt) {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}

/* ── Referral Code Card ──────────────────────────────────────── */
function ReferralCard({ code, onCopy, onShare, t }) {
  const statusColors = {
    AVAILABLE: 'bg-green-100 text-green-700',
    USED: 'bg-blue-100 text-blue-700',
    EXPIRED: 'bg-red-100 text-red-700',
  };
  const statusLabels = {
    AVAILABLE: t('referrals.statusAvailable'),
    USED: t('referrals.statusUsed'),
    EXPIRED: t('referrals.statusExpired'),
  };

  const isAvailable = code.status === 'AVAILABLE' && !code.isExpired;
  const isExpired = code.status === 'EXPIRED' || code.isExpired;

  return (
    <div className="bg-white rounded-2xl border border-saffron-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      {/* Header row: code + status */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xl font-bold text-gray-800 tracking-wider">
          {code.code}
        </span>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColors[code.status] || 'bg-gray-100 text-gray-600'}`}>
          {isExpired ? t('referrals.statusExpired') : statusLabels[code.status]}
        </span>
      </div>

      {/* Referral link */}
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-3">
        <ExternalLink size={14} className="text-gray-400 shrink-0" />
        <span className="text-xs text-gray-500 truncate flex-1">{code.referralLink}</span>
      </div>

      {/* Dates */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {t('referrals.createdDate')}: {fmtDate(code.createdAt)}
        </span>
        {code.expiresAt && !isExpired && (
          <span className="flex items-center gap-1 text-amber-600">
            <Clock size={12} />
            {t('referrals.expiresDate')}: {fmtDate(code.expiresAt)}
            {' — '}
            {timeRemaining(code.expiresAt)}
          </span>
        )}
        {isExpired && (
          <span className="flex items-center gap-1 text-red-500">
            <AlertCircle size={12} />
            {t('referrals.expiresDate')}: {fmtDate(code.expiresAt)}
          </span>
        )}
      </div>

      {/* Referred user info */}
      {code.status === 'USED' && code.usedBy && (
        <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 mb-4">
          <Users size={14} className="text-blue-500" />
          <span className="text-xs text-blue-700 font-medium">
            {t('referrals.referredUser')}
          </span>
          {code.usedAt && (
            <span className="text-xs text-blue-500 ml-auto">
              {t('referrals.usedDate')}: {fmtDate(code.usedAt)}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {isAvailable && (
        <div className="flex gap-2">
          <button
            onClick={() => onCopy(code)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-saffron-200 text-saffron-700 font-semibold text-sm hover:bg-saffron-50 transition-colors"
          >
            <Copy size={15} />
            {t('referrals.copyLink')}
          </button>
          <button
            onClick={() => onShare(code, 'whatsapp')}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition-colors"
          >
            <Share2 size={15} />
            {t('referrals.shareWhatsApp')}
          </button>
          <button
            onClick={() => onShare(code, 'native')}
            className="flex items-center justify-center py-2.5 px-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            title={t('referrals.shareOther')}
          >
            <Share2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */
export default function MyReferrals() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  // Fetch referral codes
  const { data, isLoading, error } = useQuery({
    queryKey: ['user-referrals', page],
    queryFn: async () => {
      const { data } = await API.get(`/user-referrals/my?page=${page}&limit=20`);
      return data;
    },
    keepPreviousData: true,
  });

  // Fetch settings for daily limit display
  const { data: settingsData } = useQuery({
    queryKey: ['user-referral-settings'],
    queryFn: async () => {
      const { data } = await API.get('/user-referrals/settings');
      return data.settings;
    },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await API.post('/user-referrals/generate');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['user-referrals']);
      toast.success(t('referrals.generateSuccess'));
    },
    onError: (err) => {
      const msg = err.response?.data?.message || t('referrals.generateError');
      toast.error(msg);
    },
  });

  // Copy to clipboard
  const handleCopy = useCallback(async (code) => {
    try {
      await navigator.clipboard.writeText(code.referralLink);
      toast.success(t('referrals.linkCopied'));
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = code.referralLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast.success(t('referrals.linkCopied'));
    }
  }, [t]);

  // Share
  const handleShare = useCallback((code, method) => {
    const text = `Join Zutsav using my referral link and get started on your spiritual journey:\n\n${code.referralLink}`;
    if (method === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else if (navigator.share) {
      navigator.share({ title: 'Zutsav Referral', text, url: code.referralLink }).catch(() => {});
    } else {
      handleCopy(code);
    }
  }, [handleCopy]);

  const codes = data?.codes || [];
  const total = data?.total || 0;
  const dailyLimit = settingsData?.dailyLimit || 5;

  // Count how many were generated today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const usedToday = codes.filter(c => new Date(c.createdAt) >= todayStart).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            <div className="w-10 h-10 rounded-xl bg-saffron-100 flex items-center justify-center">
              <Gift size={20} className="text-saffron-600" />
            </div>
            {t('referrals.pageTitle')}
          </h1>
          <p className="text-gray-500 mt-2">{t('referrals.pageSubtitle')}</p>
        </div>
      </div>

      {/* Reward info banner */}
      <div className="bg-gradient-to-r from-saffron-50 to-amber-50 border border-saffron-200 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="text-saffron-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-saffron-800 text-sm">{t('referrals.rewardInfo')}</p>
            {settingsData && (
              <p className="text-xs text-saffron-600 mt-1">
                {t('referrals.dailyLimitInfo', { used: usedToday, limit: dailyLimit })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <div className="mb-6">
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isLoading || (usedToday >= dailyLimit)}
          className="btn-primary flex items-center gap-2 py-3 px-6 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generateMutation.isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Gift size={18} />
          )}
          {generateMutation.isLoading ? t('referrals.generating') : t('referrals.generateCode')}
        </button>
        {usedToday >= dailyLimit && (
          <p className="text-xs text-amber-600 mt-2">
            {t('referrals.dailyLimitInfo', { used: usedToday, limit: dailyLimit })}
          </p>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-saffron-500" />
          <span className="ml-3 text-gray-500">{t('referrals.loading')}</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle size={40} className="text-red-400 mb-3" />
          <p className="text-gray-600 font-medium">{t('referrals.error')}</p>
          <button onClick={() => queryClient.invalidateQueries(['user-referrals'])} className="btn-primary mt-4 py-2 px-5 text-sm">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && codes.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-saffron-100 flex items-center justify-center mb-4">
            <Gift size={28} className="text-saffron-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{t('referrals.noReferralsTitle')}</h3>
          <p className="text-gray-500 text-sm max-w-sm">{t('referrals.noReferralsDesc')}</p>
        </div>
      )}

      {/* Referral cards */}
      {!isLoading && !error && codes.length > 0 && (
        <div className="space-y-4">
          {codes.map((code) => (
            <ReferralCard
              key={code._id}
              code={code}
              onCopy={handleCopy}
              onShare={handleShare}
              t={t}
            />
          ))}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-3 mt-6">
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
                disabled={codes.length < 20}
                className="px-4 py-2 rounded-xl border text-sm font-medium disabled:opacity-40"
              >
                {t('common.loadMore')} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
