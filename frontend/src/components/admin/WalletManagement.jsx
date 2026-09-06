import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Search, Loader, Coins, ArrowUpRight, ArrowDownLeft,
  Filter, RefreshCw, User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader size={24} className="animate-spin text-saffron-500" />
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TX_TYPE_LABELS = {
  REFERRAL_REGISTRATION: 'Registration Reward',
  REFERRAL_BOOKING_REWARD: 'Booking Reward',
  COIN_REDEMPTION: 'Coin Redemption',
  ADMIN_ADJUSTMENT: 'Admin Adjustment',
};

const TX_TYPE_ICONS = {
  REFERRAL_REGISTRATION: { icon: User, bg: 'bg-blue-100', ic: 'text-blue-600' },
  REFERRAL_BOOKING_REWARD: { icon: Coins, bg: 'bg-green-100', ic: 'text-green-600' },
  COIN_REDEMPTION: { icon: ArrowDownLeft, bg: 'bg-purple-100', ic: 'text-purple-600' },
  ADMIN_ADJUSTMENT: { icon: ArrowUpRight, bg: 'bg-amber-100', ic: 'text-amber-600' },
};

// ── Wallets List Tab ────────────────────────────────────────────────────────
function WalletsTab() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [walletDetail, setWalletDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Adjustment modal
  const [adjustUser, setAdjustUser] = useState(null);
  const [adjustType, setAdjustType] = useState('credit');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: '20' });
    if (search) params.set('search', search);
    API.get(`/admin/wallet?${params}`)
      .then(({ data }) => {
        setWallets(data.wallets);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => toast.error('Could not load wallets'))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };

  const viewWallet = async (wallet) => {
    setSelectedWallet(wallet);
    setDetailLoading(true);
    try {
      const { data } = await API.get(`/admin/wallet/user/${wallet.userId?._id || wallet.userId}`);
      setWalletDetail(data);
    } catch {
      toast.error('Could not load wallet details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjustAmount || isNaN(adjustAmount) || Number(adjustAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!adjustReason.trim()) {
      toast.error('Reason is required');
      return;
    }
    setAdjusting(true);
    try {
      const endpoint = adjustType === 'credit'
        ? `/admin/wallet/user/${adjustUser._id}/credit`
        : `/admin/wallet/user/${adjustUser._id}/debit`;
      await API.post(endpoint, { amount: Number(adjustAmount), reason: adjustReason.trim() });
      toast.success(`${adjustAmount} coins ${adjustType === 'credit' ? 'credited' : 'debited'} successfully`);
      setAdjustUser(null);
      setAdjustAmount('');
      setAdjustReason('');
      load();
      if (selectedWallet?._id === adjustUser._id) viewWallet(selectedWallet);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Adjustment failed');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by user name, email, phone…"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-saffron-400" />
          <button onClick={handleSearch} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200">
            <Search size={16} className="text-gray-500" />
          </button>
        </div>
        <span className="text-xs text-gray-400">{total} wallets</span>
      </div>

      <div className="flex gap-6">
        {/* Wallets list */}
        <div className={`${selectedWallet ? 'w-1/2' : 'w-full'} transition-all`}>
          {loading ? <LoadingSpinner /> : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                      <th className="px-4 py-3 font-semibold">User</th>
                      <th className="px-4 py-3 font-semibold">Balance</th>
                      <th className="px-4 py-3 font-semibold">Earned</th>
                      <th className="px-4 py-3 font-semibold">Redeemed</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {wallets.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-10 text-gray-400">No wallets found</td></tr>
                    )}
                    {wallets.map((w) => (
                      <tr key={w._id} className={`hover:bg-saffron-50/40 transition-colors ${selectedWallet?._id === w._id ? 'bg-saffron-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{w.userId?.name || '—'}</p>
                          <p className="text-xs text-gray-400">{w.userId?.phone || w.userId?.email}</p>
                        </td>
                        <td className="px-4 py-3 font-bold text-saffron-600">{w.balance}</td>
                        <td className="px-4 py-3 text-green-600">{w.totalEarned}</td>
                        <td className="px-4 py-3 text-red-500">{w.totalRedeemed}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => viewWallet(w)}
                              className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">
                              View
                            </button>
                            <button onClick={() => { setAdjustUser(w.userId); setAdjustType('credit'); }}
                              className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100">
                              + Credit
                            </button>
                            <button onClick={() => { setAdjustUser(w.userId); setAdjustType('debit'); }}
                              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                              − Debit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">← Prev</button>
                  <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">Next →</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wallet detail panel */}
        {selectedWallet && (
          <div className="w-1/2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">{selectedWallet.userId?.name} — Wallet</h3>
                <button onClick={() => { setSelectedWallet(null); setWalletDetail(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              {detailLoading ? <LoadingSpinner /> : walletDetail?.wallet && (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-saffron-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-saffron-600">{walletDetail.wallet.balance}</p>
                      <p className="text-xs text-gray-500">Balance</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-600">{walletDetail.wallet.totalEarned}</p>
                      <p className="text-xs text-gray-500">Earned</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-red-500">{walletDetail.wallet.totalRedeemed}</p>
                      <p className="text-xs text-gray-500">Redeemed</p>
                    </div>
                  </div>

                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Transactions</h4>
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {walletDetail.transactions?.length === 0 && (
                      <p className="text-center text-gray-400 text-xs py-4">No transactions</p>
                    )}
                    {walletDetail.transactions?.map((tx) => {
                      const isCredit = tx.direction === 'CREDIT';
                      const typeConfig = TX_TYPE_ICONS[tx.type] || { icon: Coins, bg: 'bg-gray-100', ic: 'text-gray-500' };
                      const Icon = typeConfig.icon;
                      return (
                        <div key={tx._id} className="flex items-center gap-3 p-2 border-b border-gray-50 last:border-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${typeConfig.bg}`}>
                            <Icon size={14} className={typeConfig.ic} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{TX_TYPE_LABELS[tx.type] || tx.type}</p>
                            <p className="text-[10px] text-gray-400">{fmtDate(tx.createdAt)}</p>
                          </div>
                          <span className={`text-xs font-bold ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
                            {isCredit ? '+' : '-'}{tx.amount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Adjustment modal */}
      {adjustUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              {adjustType === 'credit' ? 'Credit' : 'Debit'} Coins
            </h3>
            <p className="text-sm text-gray-500 mb-4">To: {adjustUser.name} ({adjustUser.phone || adjustUser.email})</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Amount (coins)</label>
                <input type="number" min="1" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400"
                  placeholder="Enter amount" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Reason (required)</label>
                <textarea value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400 resize-none"
                  rows={3} placeholder="Why is this adjustment being made?" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => { setAdjustUser(null); setAdjustAmount(''); setAdjustReason(''); }}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleAdjust} disabled={adjusting}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${
                  adjustType === 'credit' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                }`}>
                {adjusting ? 'Processing…' : adjustType === 'credit' ? 'Credit Coins' : 'Debit Coins'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transactions Tab ────────────────────────────────────────────────────────
function TransactionsTab() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: '20' });
    if (type) params.set('type', type);
    if (search) params.set('search', search);
    API.get(`/admin/wallet/transactions?${params}`)
      .then(({ data }) => {
        setTransactions(data.transactions);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => toast.error('Could not load transactions'))
      .finally(() => setLoading(false));
  }, [page, type, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-saffron-400">
          <option value="">All Types</option>
          <option value="REFERRAL_REGISTRATION">Registration Reward</option>
          <option value="REFERRAL_BOOKING_REWARD">Booking Reward</option>
          <option value="COIN_REDEMPTION">Coin Redemption</option>
          <option value="ADMIN_ADJUSTMENT">Admin Adjustment</option>
        </select>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by user…"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-saffron-400" />
          <button onClick={handleSearch} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200">
            <Search size={16} className="text-gray-500" />
          </button>
        </div>
        <span className="text-xs text-gray-400">{total} transactions</span>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Direction</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">No transactions found</td></tr>
                )}
                {transactions.map((tx) => {
                  const isCredit = tx.direction === 'CREDIT';
                  return (
                    <tr key={tx._id} className="hover:bg-saffron-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{tx.userId?.name || '—'}</p>
                        <p className="text-xs text-gray-400">{tx.userId?.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{TX_TYPE_LABELS[tx.type] || tx.type}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {isCredit ? 'Credit' : 'Debit'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-sm">{isCredit ? '+' : '-'}{tx.amount}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{tx.description || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(tx.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">← Prev</button>
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function WalletManagement() {
  const [subTab, setSubTab] = useState('wallets');

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Wallet Management</h2>

      <div className="flex gap-2">
        {[
          { key: 'wallets', label: 'User Wallets', icon: Wallet },
          { key: 'transactions', label: 'All Transactions', icon: Coins },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              subTab === key ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-saffron-300'
            }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'wallets' && <WalletsTab />}
      {subTab === 'transactions' && <TransactionsTab />}
    </div>
  );
}
