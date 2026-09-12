import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { pdfjs, Document, Page } from 'react-pdf';
import { ArrowLeft, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import API from '../api/axios';
import { serverOrigin } from '../config/urls.config';

// PDF.js worker — resolved as an emitted asset by webpack (CRA / react-scripts 5).
// Without it pdf.js falls back to running on the main thread and surfaces a
// "No GlobalWorkerOptions.workerSrc specified" warning that also surfaces as an
// error in some browsers.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const SUPPORTED_TYPES = new Set(['privacy', 'terms', 'refund-policy', 'about-us', 'vision']);

function formatUpdated(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Responsive measured width for the page area (desktop stays legible). */
function useContainerWidth(active) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  return [ref, Math.max(width, 320)];
}

function ReaderSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 size={26} className="animate-spin" style={{ color: 'var(--t-primary)' }} />
      <p className="text-sm" style={{ color: 'var(--t-muted)' }}>
        {t('legalDocViewer.loading', 'Loading document…')}
      </p>
    </div>
  );
}

function ReaderError({ retry }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
      <AlertTriangle size={28} style={{ color: 'var(--t-primary)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>
        {t('legalDocViewer.loadFailed', 'We could not load this document right now.')}
      </p>
      <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
        {t('legalDocViewer.retryHint', 'Please try again in a moment.')}
      </p>
      <button
        onClick={retry}
        className="mt-1 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
        style={{ background: 'var(--t-primary)', color: '#fff' }}
      >
        {t('legalDocViewer.retry', 'Retry')}
      </button>
    </div>
  );
}

function NotFound({ message }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
      <FileText size={30} style={{ color: 'var(--t-muted)' }} />
      <p className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>
        {message || t('legalDocViewer.notFound', 'This document is not available.')}
      </p>
      <Link
        to="/"
        className="mt-1 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
        style={{ background: 'var(--t-primary)', color: '#fff' }}
      >
        {t('legalDocViewer.backHome', 'Back to Home')}
      </Link>
    </div>
  );
}

export default function LegalDocumentViewerPage() {
  const { t } = useTranslation();
  const { type } = useParams();
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | missing | invalid
  const [numPages, setNumPages] = useState(0);
  const [containerRef, width] = useContainerWidth(status === 'ready' && meta?.mimeType === 'application/pdf' && !!meta?.viewUrl);
  const pageWidth = Math.min(Math.round(width), 820);

  const load = useCallback(() => {
    setMeta(null);
    setNumPages(0);
    setStatus('loading');
    if (!type || !SUPPORTED_TYPES.has(type)) {
      setStatus('invalid');
      return;
    }
    API.get(`/documents/${type}`)
      .then(({ data }) => {
        const doc = data?.document;
        if (!doc || !doc.exists) {
          setStatus('missing');
          return;
        }
        setMeta(doc);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const isPdf = meta?.mimeType === 'application/pdf';
  const absoluteViewUrl = meta?.viewUrl ? `${serverOrigin}${meta.viewUrl}` : '';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10" style={{ background: 'var(--t-bg)' }}>
      {/* Top bar — Back / title / updated date */}
      <div className="flex sm:flex-row flex-col sm:items-center gap-2 sm:gap-3 mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 self-start hover:opacity-80 transition-opacity"
          style={{ color: 'var(--t-primary)' }}
        >
          <ArrowLeft size={16} />
          {t('legalDocViewer.back', 'Back')}
        </Link>
        {meta && (
          <div className="sm:ml-2">
            <h1
              className="text-xl sm:text-2xl font-bold tracking-wide"
              style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}
            >
              {meta.label}
            </h1>
            {meta.updatedAt && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--t-muted)' }}>
                {t('legalDocViewer.lastUpdated', 'Last updated')}: {formatUpdated(meta.updatedAt)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Invalid / missing states */}
      {status === 'invalid' && <NotFound message={t('legalDocViewer.unknownType', 'This document could not be found.')} />}
      {status === 'missing' && <NotFound />}

      {/* Load failure state (metadata fetch) */}
      {status === 'error' && <ReaderError retry={load} />}

      {/* Loading */}
      {status === 'loading' && <ReaderSpinner />}

      {/* Ready: DOC/DOCX fallback — Google's hosted online viewer (same as the previous
          behavior before the viewer page). These formats have no custom page renderer. */}
      {status === 'ready' && meta && !isPdf && absoluteViewUrl && (
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
          <iframe
            title={meta.label}
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(absoluteViewUrl)}&embedded=true`}
            className="w-full"
            style={{ height: '78vh', border: 'none', display: 'block' }}
          />
        </div>
      )}

      {/* Ready: PDF custom renderer — pages painted into the Zutsav page via PDF.js.
          No iframe/object/embed → the browser's native PDF toolbar is never shown. */}
      {status === 'ready' && meta && isPdf && absoluteViewUrl && (
        <div
          ref={containerRef}
          className="rounded-2xl shadow-sm"
          style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}
        >
          <Document
            file={absoluteViewUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            loading={<ReaderSpinner />}
            error={<ReaderError retry={load} />}
          >
            {Array.from(new Array(numPages), (_, i) => (
              <div key={`page-${i + 1}`} className="flex justify-center">
                <Page
                  pageNumber={i + 1}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={<ReaderSpinner />}
                  error={<ReaderError retry={load} />}
                />
              </div>
            ))}
          </Document>
        </div>
      )}
    </div>
  );
}