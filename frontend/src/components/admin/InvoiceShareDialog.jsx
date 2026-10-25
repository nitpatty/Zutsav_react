import React, { useCallback, useEffect, useState } from 'react';
import { X, Copy, Share2, RefreshCw, Ban, Loader, Link2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import { absoluteShareUrl, copyText, shareLink } from './shareUtils';

const messageOf = (err) => err?.response?.data?.message || err?.message || 'Request failed';

/**
 * Admin dialog for an invoice's public share link.
 *
 * Every token comes from the authenticated admin API — nothing is generated or
 * guessed in the browser. The link is shown only in this dialog's input; it is
 * never written to storage, toasts or the console.
 */
export default function InvoiceShareDialog({ invoice, onClose }) {
  const [phase, setPhase] = useState('loading'); // loading | ready | ineligible | error
  const [share, setShare] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'regenerate' | 'revoke' | null

  const base = `/admin/invoices/${invoice._id}/share`;

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const { data } = await API.get(base);
      if (!data.eligible) {
        setReason(data.reason || 'This invoice cannot be shared.');
        setPhase('ineligible');
        return;
      }
      if (!data.share) {
        // First time: issue the link right away so the dialog opens with something to copy.
        const created = await API.post(base);
        setShare(created.data.share);
      } else {
        setShare(data.share);
      }
      setPhase('ready');
    } catch (err) {
      setReason(messageOf(err));
      setPhase('error');
    }
  }, [base]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn, successMsg) => {
    setBusy(true);
    try {
      const { data } = await fn();
      setShare(data.share);
      setConfirm(null);
      toast.success(successMsg);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const url = share?.status === 'active' && share.path ? absoluteShareUrl(share.path) : '';
  const heading = `Invoice ${invoice.invoiceNumber}`;

  const copyLink = async () => {
    const ok = await copyText(url);
    if (ok) toast.success('Link copied to clipboard');
    else toast.error('Could not copy automatically — select the link and copy it manually');
  };
  const nativeShare = async () => {
    const result = await shareLink({
      title: heading,
      text: `Your invoice ${invoice.invoiceNumber}`,
      url,
    });
    if (result === 'copied') toast.success('Sharing is not supported here — link copied instead');
    else if (result === 'shared') toast.success('Invoice link shared');
    else if (result === 'failed') toast.error('Could not share or copy the link');
  };

  const btn = 'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50';
  const outline = { borderColor: 'var(--t-border)', color: 'var(--t-text)' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Share ${heading}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--t-card)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--t-text)' }}>Share invoice</h3>
            <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
              {invoice.invoiceNumber} · {invoice.customerName}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg border" style={outline}>
            <X size={14} />
          </button>
        </div>

        {phase === 'loading' && (
          <p className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: 'var(--t-muted)' }}>
            <Loader size={14} className="animate-spin" /> Preparing link…
          </p>
        )}

        {(phase === 'ineligible' || phase === 'error') && (
          <div className="rounded-xl p-3 text-sm flex gap-2" role="alert"
            style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{phase === 'ineligible' ? 'This invoice can’t be shared' : 'Could not prepare the link'}</p>
              <p className="mt-0.5">{reason}</p>
              {phase === 'error' && (
                <button onClick={load} className="mt-2 underline font-semibold">Try again</button>
              )}
            </div>
          </div>
        )}

        {phase === 'ready' && share && (
          <div className="space-y-3">
            {share.status === 'revoked' && (
              <>
                <div className="rounded-xl p-3 text-sm" role="status"
                  style={{ background: '#fef2f2', color: '#b91c1c' }}>
                  The previous link was revoked and no longer works. Generate a new link to share this invoice again.
                </div>
                <button disabled={busy} onClick={() => run(() => API.post(base), 'New link generated')}
                  className={`${btn} w-full text-white`} style={{ background: 'var(--t-primary)', borderColor: 'var(--t-primary)' }}>
                  <Link2 size={14} /> Generate new link
                </button>
              </>
            )}

            {share.status === 'active' && !share.linkAvailable && (
              <>
                <div className="rounded-xl p-3 text-sm" role="status"
                  style={{ background: '#fffbeb', color: '#92400e' }}>
                  A link exists but can’t be displayed again. Customers who already have it can still use it.
                  Regenerate to get a new link (the old one will stop working).
                </div>
              </>
            )}

            {url && (
              <>
                <label className="block text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>
                  Customer link — no login required
                  <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Shareable invoice link"
                    data-clarity-mask="True"
                    className="mt-1 w-full px-3 py-2 rounded-lg text-xs border font-mono"
                    style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={copyLink} className={btn} style={outline}>
                    <Copy size={14} /> Copy link
                  </button>
                  <button onClick={nativeShare} className={`${btn} text-white`}
                    style={{ background: 'var(--t-primary)', borderColor: 'var(--t-primary)' }}>
                    <Share2 size={14} /> Share
                  </button>
                </div>
              </>
            )}

            {invoice.status === 'cancelled' && share.status === 'active' && (
              <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
                This invoice is cancelled — the customer will see it clearly marked as cancelled.
              </p>
            )}

            {share.status === 'active' && (
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--t-border)' }}>
                {confirm ? (
                  <div className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                    <p className="font-semibold mb-2">
                      {confirm === 'revoke'
                        ? 'Revoke this link? Anyone holding it will immediately lose access.'
                        : 'Regenerate the link? The current link stops working immediately.'}
                    </p>
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => setConfirm(null)} className={btn} style={outline}>Cancel</button>
                      <button disabled={busy}
                        onClick={() => (confirm === 'revoke'
                          ? run(() => API.post(`${base}/revoke`), 'Link revoked')
                          : run(() => API.post(`${base}/regenerate`), 'New link generated'))}
                        className={`${btn} text-white`} style={{ background: '#b91c1c', borderColor: '#b91c1c' }}>
                        {busy ? 'Working…' : confirm === 'revoke' ? 'Revoke link' : 'Regenerate link'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button disabled={busy} onClick={() => setConfirm('regenerate')} className={btn} style={outline}>
                      <RefreshCw size={14} /> Regenerate
                    </button>
                    <button disabled={busy} onClick={() => setConfirm('revoke')} className={btn}
                      style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>
                      <Ban size={14} /> Revoke
                    </button>
                  </div>
                )}
                <p className="text-[11px]" style={{ color: 'var(--t-muted)' }}>
                  Anyone with this link can view this invoice (read-only). Share it only with the customer.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
