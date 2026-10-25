import React from 'react';

// Whole rupees stay compact (₹150); anything fractional shows paise (₹157.50).
const INR = (n) => {
  const v = +(n ?? 0);
  const digits = Number.isInteger(v) ? 0 : 2;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
};

const TYPE_BADGE = {
  kit:    { label: 'Kit',    bg: '#ede9fe', color: '#6d28d9' },
  custom: { label: 'Custom', bg: '#fef3c7', color: '#92400e' },
};

function Heading({ children }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider mb-2"
      style={{ color: 'var(--t-muted)', letterSpacing: '0.08em' }}>
      {children}
    </div>
  );
}

/**
 * Server-calculated bill preview.
 *
 * Items show name, quantity, base unit price and the line subtotal ONLY — tax is
 * presented once, in the bill summary (statutory per-line detail stays on the
 * finalized invoice). `fresh` is false while the displayed numbers belong to an
 * older request than the current form state; the summary is dimmed so a stale
 * total is never mistaken for the current one.
 */
export default function ManualBillPreview({
  preview, fresh = true, previewing = false, previewError = '', hasLines = false,
  applyTax = false, onApplyTaxChange = () => {}, customerState = '',
  taxRate = '', onTaxRateChange = () => {}, taxRateError = '',
}) {
  const totals = preview?.totals;
  const breakdown = preview?.taxBreakdown || [];
  const gst = preview?.gstBreakdown;
  const showTax = Boolean(preview?.taxApplied);
  // The percentage beside the amount is the one the server applied (echoed back),
  // never the half-typed input, so label and amount can't disagree.
  const manualRate = preview?.taxMode === 'manual_bill_rate' ? preview.manualTaxRate : null;
  const taxLabel = showTax && manualRate !== null && manualRate !== undefined
    ? `Tax (${manualRate}%)`
    : showTax && breakdown.length === 1 ? `Tax (${breakdown[0].rate}%)` : 'Tax';

  return (
    <div>
      {previewing && <p className="text-sm" style={{ color: 'var(--t-muted)' }}>Calculating…</p>}
      {previewError && (
        <p className="text-xs rounded-lg p-2 mb-2" style={{ background: '#fef2f2', color: '#b91c1c' }}>
          {previewError}
        </p>
      )}

      {preview && (
        <div data-testid="preview-items" className="mb-3">
          <Heading>Items</Heading>
          <div className="space-y-3">
            {preview.lines.map((l, i) => {
              const badge = TYPE_BADGE[l.lineType];
              const subtotal = Math.round(l.unitPrice * l.quantity * 100) / 100;
              return (
                <div key={i} data-testid="preview-line" className="text-xs">
                  <div className="flex justify-between gap-2 font-semibold" style={{ color: 'var(--t-text)' }}>
                    <span>
                      {l.name}{l.variantLabel && l.lineType !== 'kit' ? ` (${l.variantLabel})` : ''}
                      {badge && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase align-middle"
                          style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0">{INR(subtotal)}</span>
                  </div>
                  <div style={{ color: 'var(--t-muted)' }}>
                    {l.quantity} × {INR(l.unitPrice)}{l.unit ? ` / ${l.unit}` : ''}
                  </div>
                  {l.discount > 0 && (
                    <div style={{ color: 'var(--t-muted)' }}>Discount −{INR(l.discount)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasLines && (
        <div data-testid="preview-summary" className="pt-3 border-t space-y-1 text-sm"
          style={{ borderColor: 'var(--t-border)', opacity: fresh ? 1 : 0.55 }}>
          <Heading>Bill summary</Heading>
          {totals && (
            <>
              <div className="flex justify-between" style={{ color: 'var(--t-muted)' }}>
                <span>Subtotal</span><span>{INR(totals.grossTotal)}</span>
              </div>
              <div className="flex justify-between" style={{ color: 'var(--t-muted)' }}>
                <span>Discount</span><span>{totals.discountTotal > 0 ? '−' : ''}{INR(totals.discountTotal)}</span>
              </div>
            </>
          )}

          <label className="flex items-center justify-between gap-2 py-1 cursor-pointer"
            style={{ color: 'var(--t-text)' }}>
            <span className="font-semibold">Apply tax</span>
            <input type="checkbox" role="switch" aria-label="Apply tax" checked={applyTax}
              onChange={(e) => onApplyTaxChange(e.target.checked)}
              className="h-4 w-4 cursor-pointer" />
          </label>

          {applyTax && (
            <div className="pb-1">
              <label className="flex items-center justify-between gap-2" style={{ color: 'var(--t-text)' }}>
                <span className="text-xs font-semibold">Tax Rate (%)</span>
                <input type="number" inputMode="decimal" min="0" max="100" step="0.01"
                  aria-label="Tax Rate (%)" aria-invalid={Boolean(taxRateError)}
                  value={taxRate} onChange={(e) => onTaxRateChange(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-24 px-2 py-1 rounded-lg text-sm border text-right"
                  style={{
                    background: 'var(--t-bg)', color: 'var(--t-text)',
                    borderColor: taxRateError ? '#b91c1c' : 'var(--t-border)',
                  }} />
              </label>
              {taxRateError && (
                <p role="alert" className="text-[11px] mt-0.5 text-right" style={{ color: '#b91c1c' }}>
                  {taxRateError}
                </p>
              )}
            </div>
          )}

          {totals && (
            <>
              <div className="flex justify-between" style={{ color: 'var(--t-muted)' }}>
                <span>{taxLabel}</span>
                <span data-testid="preview-tax">{INR(totals.totalTax)}</span>
              </div>
              {showTax && breakdown.length > 1 && (
                <div className="text-[11px] text-right" style={{ color: 'var(--t-muted)' }}>
                  {breakdown.map((r) => `${r.rate}%: ${INR(r.taxAmount)}`).join(' · ')}
                </div>
              )}
              <div className="flex justify-between font-black text-base pt-1" style={{ color: 'var(--t-text)' }}>
                <span>Grand total</span>
                <span data-testid="preview-grand-total">{INR(totals.grandTotal)}</span>
              </div>
              {showTax && totals.totalTax > 0 && gst && (
                <p className="text-[11px] pt-1" style={{ color: 'var(--t-muted)' }}>
                  {gst.isInterstate
                    ? `IGST ${INR(gst.igst)} — inter-state (${preview.registration?.state} → ${customerState || 'customer state not set'})`
                    : `CGST ${INR(gst.cgst)} + SGST ${INR(gst.sgst)} — intra-state`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {!hasLines && !previewing && !previewError && (
        <p className="text-sm" style={{ color: 'var(--t-muted)' }}>
          Add at least one item to see the authoritative totals.
        </p>
      )}
    </div>
  );
}
