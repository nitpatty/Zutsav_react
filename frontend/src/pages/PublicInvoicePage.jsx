import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { urls } from '../config';
import { useSettings } from '../context/SettingsContext';
import ZutsavLoader from '../components/shared/ZutsavLoader';
import ManualInvoiceView from '../components/invoice/ManualInvoiceView';
import InvoicePage from './InvoicePage';

/**
 * Customer-facing invoice opened from a share link: /share/invoice/:token
 *
 * - Works with no session. It deliberately uses a bare axios call instead of the
 *   shared API client, which attaches any stored admin/user JWT and reacts to
 *   401s by logging the visitor out.
 * - Read-only: there is no action on this page that writes anything.
 * - The token lives only in the URL. It is never copied into storage, titles,
 *   logs or analytics (Clarity is disabled for /share/* in AnalyticsContext).
 * - Every link failure (bad, unknown, revoked or ineligible) shows the same
 *   generic message, mirroring the API; connectivity and server errors are
 *   reported separately so they are not mistaken for a bad link.
 */

const GENERIC_ERROR = 'This invoice link is invalid or is no longer available.';

function Centered({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f1f5f9', flexDirection: 'column', gap: 12, padding: 24, textAlign: 'center' }}>
      {children}
    </div>
  );
}

/** Keeps the tokenized URL out of Referer headers and search indexes for this page only. */
function usePrivatePageMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Invoice';
    const added = [];
    [['referrer', 'no-referrer'], ['robots', 'noindex, nofollow']].forEach(([name, content]) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      added.push(meta);
    });
    return () => {
      document.title = previousTitle;
      added.forEach((m) => m.parentNode && m.parentNode.removeChild(m));
    };
  }, []);
}

export default function PublicInvoicePage() {
  const { token } = useParams();
  const { logoUrl, platformName } = useSettings();
  const [state, setState] = useState({ status: 'loading', data: null, message: '' });

  usePrivatePageMeta();

  useEffect(() => {
    let cancelled = false;
    // No custom request headers: anything beyond Content-Type/Authorization triggers a
    // CORS preflight that the API's CORS policy rejects. Caching is controlled by the
    // server's `Cache-Control: no-store` response header instead.
    axios.get(`${urls.apiUrl}/public/invoices/${encodeURIComponent(token || '')}`, {
      withCredentials: false,
    })
      .then(({ data }) => { if (!cancelled) setState({ status: 'ready', data, message: '' }); })
      .catch((err) => {
        if (cancelled) return;
        // Only a real HTTP answer from the API means "this link doesn't work".
        // No response at all is a connectivity/CORS problem — say so instead of
        // telling the customer their link is bad.
        const status = err.response?.status;
        let message = GENERIC_ERROR;
        if (!err.response) message = 'We couldn’t load this invoice. Please check your connection and try again.';
        else if (status === 429) message = 'Too many requests. Please try again in a few minutes.';
        else if (status >= 500) message = 'This invoice is temporarily unavailable. Please try again shortly.';
        setState({ status: 'error', data: null, message });
      });
    return () => { cancelled = true; };
  }, [token]);

  if (state.status === 'loading') return <ZutsavLoader fullscreen size={64} message="Loading invoice…" />;

  if (state.status === 'error') {
    return (
      <Centered>
        <p role="alert" style={{ color: '#b91c1c', fontWeight: 600, fontSize: 16, maxWidth: 440 }}>{state.message}</p>
        <p style={{ color: '#6b7280', fontSize: 13, maxWidth: 440 }}>
          Please ask the sender for a new link.
        </p>
      </Centered>
    );
  }

  const { invoice, booking, payments, paymentSummary } = state.data;
  if (invoice.source === 'manual') {
    return (
      <ManualInvoiceView
        invoice={invoice}
        payments={payments || []}
        paymentSummary={paymentSummary}
        logoUrl={logoUrl}
        platformName={platformName}
        publicView
      />
    );
  }
  return <InvoicePage publicData={{ invoice, booking }} />;
}
