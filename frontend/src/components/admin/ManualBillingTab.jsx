import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Receipt, Search, Trash2, Loader, AlertTriangle, RefreshCw, Eye, Ban,
  CheckCircle, IndianRupee, Printer,
} from 'lucide-react';
import API from '../../api/axios';
import toast from 'react-hot-toast';

const INR = (n) =>
  `₹${(+(n ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const PAYMENT_METHODS = [
  { value: 'CASH',          label: 'Cash' },
  { value: 'UPI',           label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CARD',          label: 'Card' },
  { value: 'OTHER',         label: 'Other' },
];

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const newKey = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `mb-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

function detailText(err) {
  const data = err?.response?.data;
  if (Array.isArray(data?.details) && data.details.length) {
    return `${data.message || 'Validation failed'} — ${data.details.join('; ')}`;
  }
  return data?.message || err?.message || 'Request failed';
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border p-5 ${className}`}
      style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wider mb-3"
      style={{ color: 'var(--t-muted)', letterSpacing: '0.08em' }}>
      {children}
    </div>
  );
}

const inputStyle = {
  background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)',
};

/* ─────────────────────────────────────────────────────────────
   Payment ledger for one manual invoice
─────────────────────────────────────────────────────────────── */
function BillLedger({ bill, onChanged }) {
  const { invoice, payments = [], totalReversed = 0, netReceived = 0 } = bill;
  const outstanding = Math.max(0, Math.round(((invoice.grandTotal || 0) - netReceived) * 100) / 100);
  const [form, setForm] = useState({ amount: '', method: 'CASH', reference: '', note: '' });
  const [saving, setSaving] = useState(false);
  const keyRef = useRef(newKey());

  useEffect(() => {
    setForm({ amount: '', method: 'CASH', reference: '', note: '' });
    keyRef.current = newKey();
  }, [invoice._id]);

  const submit = async (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter a positive amount');
    setSaving(true);
    try {
      await API.post(`/admin/manual-billing/invoices/${invoice._id}/payments`, {
        idempotencyKey: keyRef.current,
        payment: {
          amount,
          method: form.method,
          reference: form.reference,
          note: form.note,
        },
      });
      toast.success('Payment recorded');
      keyRef.current = newKey();
      onChanged();
    } catch (err) {
      toast.error(detailText(err));
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (p) => {
    const reason = window.prompt('Reason for reversing this receipt?');
    if (!reason || !reason.trim()) return;
    try {
      await API.post(`/admin/manual-billing/payments/${p._id}/reverse`, { reason });
      toast.success('Receipt reversed');
      onChanged();
    } catch (err) {
      toast.error(detailText(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Bill Total', v: INR(invoice.grandTotal), c: '#1B1F3B' },
          { l: 'Net Received', v: INR(netReceived), c: '#15803d' },
          { l: 'Reversed', v: INR(totalReversed), c: '#b45309' },
          { l: 'Outstanding', v: INR(outstanding), c: outstanding > 0 ? '#b91c1c' : '#15803d' },
        ].map(({ l, v, c }) => (
          <div key={l} className="rounded-xl border px-3 py-2"
            style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg)' }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>{l}</div>
            <div className="text-base font-black" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {payments.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--t-muted)' }}>No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--t-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--t-primary)', color: 'white' }}>
                {['Kind', 'Method', 'Reference', 'Received', 'Recorded by', 'Amount', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p._id} style={{ borderTop: '1px solid var(--t-border)' }}>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded font-semibold"
                      style={{
                        background: p.kind === 'REVERSAL' ? '#fee2e2' : '#dcfce7',
                        color: p.kind === 'REVERSAL' ? '#b91c1c' : '#15803d',
                      }}>
                      {p.kind}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--t-text)' }}>{p.method || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t-muted)' }}>{p.reference || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t-muted)' }}>{fmtDateTime(p.receivedAt)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t-muted)' }}>{p.recordedByName || '—'}</td>
                  <td className="px-3 py-2 font-bold"
                    style={{ color: p.kind === 'REVERSAL' ? '#b91c1c' : '#15803d' }}>
                    {p.kind === 'REVERSAL' ? '−' : ''}{INR(p.amount)}
                  </td>
                  <td className="px-3 py-2">
                    {p.kind === 'RECEIPT' && p.status !== 'reversed' && invoice.status === 'active' && (
                      <button onClick={() => reverse(p)} title="Reverse receipt"
                        className="p-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>
                        <Ban size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoice.status === 'active' && outstanding > 0 && (
        <form onSubmit={submit} className="rounded-xl border p-3 space-y-3"
          style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg)' }}>
          <SectionTitle>Record offline payment</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="number" min="0.01" step="0.01" max={outstanding} required
              value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder={`Up to ${outstanding}`} className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
            <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm border" style={inputStyle}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="Reference / UTR (optional)" className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
            <button type="submit" disabled={saving}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--t-primary)' }}>
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main tab
─────────────────────────────────────────────────────────────── */
export default function ManualBillingTab() {
  const [registrations, setRegistrations] = useState([]);
  const [regId,         setRegId]         = useState('');
  const [taxConfirmed,  setTaxConfirmed]  = useState(false);
  const [regWarning,    setRegWarning]    = useState('');

  const [customer, setCustomer] = useState({
    name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '',
  });

  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [deductStock, setDeductStock] = useState(true);

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [pay, setPay] = useState({ amount: '', method: 'CASH', reference: '', note: '' });
  const [payTouched, setPayTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitKeyRef = useRef(newKey());

  const [created, setCreated] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [activeBill, setActiveBill] = useState(null);

  const previewReq = useRef(0);

  const loadRegistrations = () => {
    API.get('/admin/manual-billing/registrations')
      .then(({ data }) => {
        const list = data.registrations || [];
        setRegistrations(list);
        setRegWarning(data.warning || '');
        setRegId((current) => current || list.find((r) => r.isDefault)?.id || list[0]?.id || '');
      })
      .catch(() => toast.error('Could not load billing registrations'));
  };

  const loadRecent = () => {
    setRecentLoading(true);
    API.get('/admin/invoices', { params: { source: 'manual', limit: 10 } })
      .then(({ data }) => setRecent(data.invoices || []))
      .catch(() => toast.error('Could not load recent manual bills'))
      .finally(() => setRecentLoading(false));
  };

  useEffect(() => { loadRegistrations(); loadRecent(); }, []);

  // Debounced product search
  useEffect(() => {
    if (!search.trim()) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      setSearching(true);
      API.get('/admin/manual-billing/products', { params: { search: search.trim(), limit: 15 } })
        .then(({ data }) => setResults(data.products || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const itemsPayload = useMemo(() => lines.map((l) => ({
    productId: l.product._id,
    ...(l.variantId ? { variantId: l.variantId } : {}),
    quantity: l.quantity,
    discount: l.discount === '' ? 0 : Number(l.discount) || 0,
  })), [lines]);

  const customerState = (customer.state || '').trim();

  // Debounced server preview — the server is the only pricing authority.
  useEffect(() => {
    if (!itemsPayload.length) {
      setPreview(null); setPreviewError('');
      return undefined;
    }
    const reqId = ++previewReq.current;
    const t = setTimeout(() => {
      setPreviewing(true);
      setPreviewError('');
      API.post('/admin/manual-billing/preview', {
        items: itemsPayload, customerState, registrationId: regId,
      })
        .then(({ data }) => {
          if (reqId !== previewReq.current) return;
          setPreview(data);
          setPay((p) => (payTouched && p.amount !== '' ? p : { ...p, amount: String(data.totals.grandTotal) }));
        })
        .catch((err) => {
          if (reqId !== previewReq.current) return;
          setPreview(null);
          setPreviewError(detailText(err));
        })
        .finally(() => { if (reqId === previewReq.current) setPreviewing(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [itemsPayload, customerState, regId, payTouched]);

  const addProduct = (product) => {
    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    setLines((ls) => [...ls, {
      key: newKey(),
      product,
      variantId: '',
      quantity: 1,
      discount: '',
    }]);
    setSearch('');
    setResults([]);
    if (hasVariants) toast('Select the product variant before finalizing', { icon: 'ℹ️' });
  };

  const updateLine = (key, patch) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  const selectedReg = registrations.find((r) => String(r.id) === String(regId));
  const requiresConfirmation = Boolean(preview?.requiresTaxIdentityConfirmation || selectedReg?.isFallback);

  const resetForm = () => {
    setLines([]); setCustomer({ name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '' });
    setPay({ amount: '', method: 'CASH', reference: '', note: '' });
    setPayTouched(false); setPreview(null); setPreviewError('');
    setTaxConfirmed(false); setCreated(null); setActiveBill(null);
    submitKeyRef.current = newKey();
    loadRecent();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!preview) return toast.error('Fix the bill preview before finalizing');
    if (!customer.name.trim() || (!customer.phone.trim() && !customer.address.trim())) {
      return toast.error('Walk-in customer needs a name and either a phone or an address');
    }
    if (requiresConfirmation && !taxConfirmed) {
      return toast.error('Confirm the company tax identity before issuing a tax invoice');
    }
    const amount = pay.amount === '' ? 0 : Number(pay.amount);
    if (pay.amount !== '' && (!Number.isFinite(amount) || amount < 0)) {
      return toast.error('Received amount must be a non-negative number');
    }
    setSubmitting(true);
    try {
      const { data } = await API.post('/admin/manual-billing/invoices', {
        idempotencyKey: submitKeyRef.current,
        registrationId: regId,
        taxIdentityConfirmed: requiresConfirmation ? taxConfirmed : undefined,
        customer,
        items: itemsPayload,
        deductStock,
        payment: pay.amount === '' ? undefined : {
          amount, method: pay.method, reference: pay.reference, note: pay.note,
        },
      });
      toast.success(`Invoice ${data.invoice.invoiceNumber} created`);
      setCreated({ invoice: data.invoice, ...(data.paymentSummary || {}) });
      loadRecent();
    } catch (err) {
      toast.error(detailText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openBill = async (inv) => {
    try {
      const { data } = await API.get(`/admin/manual-billing/invoices/${inv._id}/payments`);
      setActiveBill(data);
    } catch (err) {
      toast.error(detailText(err));
    }
  };

  const reloadBill = async (invoiceId) => {
    if (!invoiceId) return;
    try {
      const { data } = await API.get(`/admin/manual-billing/invoices/${invoiceId}/payments`);
      setActiveBill((prev) =>
        (prev && String(prev.invoice._id) === String(invoiceId) ? data : prev));
      setCreated((prev) =>
        (prev && String(prev.invoice._id) === String(invoiceId) ? data : prev));
      loadRecent();
    } catch (err) {
      toast.error(detailText(err));
    }
  };

  if (created) {
    const inv = created.invoice;
    return (
      <div className="animate-fade-in space-y-5">
        <Card className="border-green-200" >
          <div className="flex items-start gap-3">
            <CheckCircle size={22} style={{ color: '#15803d' }} />
            <div className="flex-1">
              <h2 className="text-lg font-bold" style={{ color: 'var(--t-text)' }}>
                Invoice {inv.invoiceNumber} created
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--t-muted)' }}>
                {inv.customerName} · {INR(inv.grandTotal)} · {inv.status.toUpperCase()}
              </p>
            </div>
            <div className="flex gap-2">
              {/* rel="opener" is required to keep sessionStorage (auth) available
                  in the new tab for admins without "Remember Me". */}
              {/* eslint-disable-next-line react/jsx-no-target-blank -- same-origin admin link; keeping window.opener is intentional */}
              <a href={`/invoice/view/${inv.invoiceNumber}`} target="_blank" rel="opener"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border"
                style={{ borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
                <Printer size={14} /> Print
              </a>
              <button onClick={resetForm}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'var(--t-primary)' }}>
                New Bill
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>Line items</SectionTitle>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--t-border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--t-primary)', color: 'white' }}>
                  {['Item', 'Qty', 'Unit', 'Discount', 'Tax', 'Line Total'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(inv.lineItems || []).map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--t-border)' }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--t-text)' }}>
                      {l.name}{l.variantLabel ? ` (${l.variantLabel})` : ''}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--t-text)' }}>{l.quantity}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--t-text)' }}>{INR(l.unitPrice)}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--t-text)' }}>{INR(l.discount)}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--t-text)' }}>{l.taxRate}% · {INR(l.taxAmount)}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: 'var(--t-text)' }}>{INR(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionTitle>Payments</SectionTitle>
          <BillLedger bill={created} onChanged={() => reloadBill(created.invoice._id)} />
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t-text)' }}>Manual Billing</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--t-muted)' }}>
            Offline product sales — server-priced, numbered in the MAN series, never touching bookings or gateways.
          </p>
        </div>
      </div>

      {activeBill && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <SectionTitle>Payments — {activeBill.invoice.invoiceNumber}</SectionTitle>
              <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
                {activeBill.invoice.customerName} · {fmtDateTime(activeBill.invoice.invoiceDate)}
              </p>
            </div>
            <button onClick={() => setActiveBill(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
              Close
            </button>
          </div>
          <BillLedger bill={activeBill} onChanged={() => reloadBill(activeBill.invoice._id)} />
        </Card>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <SectionTitle>Bill from — company GST registration</SectionTitle>
            <select value={regId} onChange={(e) => { setRegId(e.target.value); setTaxConfirmed(false); }}
              className="w-full px-3 py-2 rounded-lg text-sm border mb-2" style={inputStyle}>
              {registrations.length === 0 && <option value="">No registration available</option>}
              {registrations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.legalName} — {r.gstin} ({r.state}){r.isFallback ? ' · FALLBACK' : ''}
                </option>
              ))}
            </select>
            {selectedReg && (
              <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
                {selectedReg.address || '—'}
              </p>
            )}
            {(regWarning || selectedReg?.isFallback) && (
              <div className="mt-3 rounded-xl p-3 text-xs"
                style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <AlertTriangle size={13} /> Unconfigured fallback identity
                </div>
                <p>
                  This registration came from the built-in fallback, not from an admin-configured
                  registration. Confirm the legal name, GSTIN and state are correct before issuing
                  a tax invoice — or configure real registrations in System Settings.
                </p>
                <label className="flex items-center gap-2 mt-2 font-semibold cursor-pointer">
                  <input type="checkbox" checked={taxConfirmed} onChange={(e) => setTaxConfirmed(e.target.checked)} />
                  I confirm this company tax identity is correct for this invoice
                </label>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Walk-in customer</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input required value={customer.name}
                onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                placeholder="Customer name *" className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <input value={customer.phone}
                onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                placeholder="Phone (10-digit)" className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <input value={customer.email}
                onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                placeholder="Email (optional)" className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <input value={customer.state}
                onChange={(e) => setCustomer((c) => ({ ...c, state: e.target.value }))}
                placeholder="Customer state (place of supply)" className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <input value={customer.city}
                onChange={(e) => setCustomer((c) => ({ ...c, city: e.target.value }))}
                placeholder="City" className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <input value={customer.pincode}
                onChange={(e) => setCustomer((c) => ({ ...c, pincode: e.target.value }))}
                placeholder="Pincode" className="px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <input value={customer.address}
                onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))}
                placeholder="Address (phone or address is required)" className="px-3 py-2 rounded-lg text-sm border md:col-span-2" style={inputStyle} />
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--t-muted)' }}>
              Walk-in sales never create a user account. GST is inter-state when the customer state
              differs from the seller registration state.
            </p>
          </Card>

          <Card>
            <SectionTitle>Catalog items</SectionTitle>
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={inputStyle}>
                <Search size={14} style={{ color: 'var(--t-muted)' }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products by name, SKU or category…"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: 'var(--t-text)' }} />
                {searching && <Loader size={14} className="animate-spin" style={{ color: 'var(--t-muted)' }} />}
              </div>
              {results.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border shadow-lg max-h-72 overflow-y-auto"
                  style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
                  {results.map((p) => (
                    <button key={p._id} type="button" onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2 text-sm border-b last:border-b-0 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
                      <span>
                        <span className="font-semibold">{p.name}</span>
                        <span className="ml-2 text-xs" style={{ color: 'var(--t-muted)' }}>
                          {p.sku ? `${p.sku} · ` : ''}{p.category || '—'}
                          {p.variants?.length ? ` · ${p.variants.length} variants` : ` · stock ${p.stock ?? 0}`}
                        </span>
                      </span>
                      <span className="text-xs font-bold shrink-0">
                        {INR(p.salePrice && p.salePrice < p.price ? p.salePrice : p.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="text-sm mt-4" style={{ color: 'var(--t-muted)' }}>
                Search the catalog to add bill lines. Prices and taxes always come from the server.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {lines.map((l) => {
                  const variants = l.product.variants || [];
                  return (
                    <div key={l.key} className="rounded-xl border p-3"
                      style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>
                          {l.product.name}
                          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--t-muted)' }}>
                            {l.product.sku || ''} · tax {l.product.taxRate ?? 0}%
                          </span>
                        </div>
                        <button type="button" onClick={() => removeLine(l.key)}
                          className="p-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                        {variants.length > 0 && (
                          <select required value={l.variantId}
                            onChange={(e) => updateLine(l.key, { variantId: e.target.value })}
                            className="px-2 py-1.5 rounded-lg text-xs border" style={inputStyle}>
                            <option value="">Select variant…</option>
                            {variants.map((v) => (
                              <option key={v.variantId} value={v.variantId}>
                                {v.quantity || v.sku || v.variantId} · stock {v.stock ?? 0}
                              </option>
                            ))}
                          </select>
                        )}
                        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>
                          Qty
                          <input type="number" min="1" step="1" required value={l.quantity}
                            onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                            className="mt-0.5 w-full px-2 py-1.5 rounded-lg text-sm border" style={inputStyle} />
                        </label>
                        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>
                          Discount (₹)
                          <input type="number" min="0" step="0.01" value={l.discount}
                            onChange={(e) => updateLine(l.key, { discount: e.target.value })}
                            className="mt-0.5 w-full px-2 py-1.5 rounded-lg text-sm border" style={inputStyle} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <label className="flex items-center gap-2 mt-4 text-sm" style={{ color: 'var(--t-text)' }}>
              <input type="checkbox" checked={deductStock} onChange={(e) => setDeductStock(e.target.checked)} />
              Deduct stock at finalization (restored automatically if the bill is cancelled)
            </label>
          </Card>
        </div>

        {/* Right rail: server preview + payment */}
        <div className="space-y-5">
          <Card>
            <SectionTitle>Bill preview (server-calculated)</SectionTitle>
            {previewing && <p className="text-sm" style={{ color: 'var(--t-muted)' }}>Calculating…</p>}
            {previewError && (
              <p className="text-xs rounded-lg p-2" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                {previewError}
              </p>
            )}
            {preview && (
              <>
                <div className="space-y-3">
                  {preview.lines.map((l, i) => {
                    const gross = l.unitPrice * l.quantity;
                    const taxable = Math.max(0, gross - l.discount);
                    return (
                      <div key={i} className="text-xs">
                        <div className="flex justify-between font-semibold" style={{ color: 'var(--t-text)' }}>
                          <span>{l.name}{l.variantLabel ? ` (${l.variantLabel})` : ''}</span>
                          <span>{INR(gross)}</span>
                        </div>
                        <div className="flex justify-between" style={{ color: 'var(--t-muted)' }}>
                          <span>{l.quantity} × {INR(l.unitPrice)}{l.discount ? ` − ${INR(l.discount)} disc.` : ''}</span>
                          <span>tax {l.taxRate}%: {INR(l.taxAmount)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]" style={{ color: 'var(--t-muted)' }}>
                          <span>taxable {INR(taxable)}</span>
                          <span className="font-semibold" style={{ color: 'var(--t-text)' }}>{INR(l.lineTotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 space-y-1 text-sm border-t" style={{ borderColor: 'var(--t-border)' }}>
                  {[
                    ['Gross', preview.totals.grossTotal],
                    ['Discount', -preview.totals.discountTotal],
                    ['Taxable value', preview.totals.taxableValue],
                    ['Tax', preview.totals.totalTax],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between" style={{ color: 'var(--t-muted)' }}>
                      <span>{k}</span><span>{INR(v)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-black text-base pt-1" style={{ color: 'var(--t-text)' }}>
                    <span>Grand total</span><span>{INR(preview.totals.grandTotal)}</span>
                  </div>
                </div>
                <p className="text-[11px] mt-2" style={{ color: 'var(--t-muted)' }}>
                  {preview.gstBreakdown?.isInterstate
                    ? `IGST ${preview.gstBreakdown.igst} — inter-state (${preview.registration.state} → ${customerState || 'customer state not set'})`
                    : `CGST ${preview.gstBreakdown?.cgst ?? 0} + SGST ${preview.gstBreakdown?.sgst ?? 0} — intra-state`}
                </p>
              </>
            )}
            {!preview && !previewing && !previewError && (
              <p className="text-sm" style={{ color: 'var(--t-muted)' }}>
                Add at least one catalog item to see the authoritative totals.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>Payment received now</SectionTitle>
            <div className="space-y-3">
              <label className="block text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>
                Amount
                <div className="flex gap-2 mt-0.5">
                  <input type="number" min="0" step="0.01" value={pay.amount}
                    onChange={(e) => { setPayTouched(true); setPay((p) => ({ ...p, amount: e.target.value })); }}
                    className="flex-1 px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
                  <button type="button" onClick={() => { setPayTouched(false); setPay((p) => ({ ...p, amount: String(preview?.totals.grandTotal ?? '') })); }}
                    className="px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}
                    title="Pay the full bill">
                    Full
                  </button>
                </div>
              </label>
              <label className="block text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>
                Method
                <select value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))}
                  className="mt-0.5 w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle}>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <input value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))}
                placeholder="Reference / UTR (optional)" className="w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <input value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))}
                placeholder="Note (optional)" className="w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle} />
              <button type="submit" disabled={submitting || !preview}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--t-primary)' }}>
                {submitting ? <Loader size={14} className="animate-spin" /> : <Receipt size={14} />}
                {submitting ? 'Finalizing…' : 'Finalize Bill'}
              </button>
              <p className="text-[11px]" style={{ color: 'var(--t-muted)' }}>
                The invoice number is issued at finalization. Partial payments are allowed; the balance
                is tracked on the bill and can be settled later.
              </p>
            </div>
          </Card>
        </div>
      </form>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Recent manual bills</SectionTitle>
          <button onClick={loadRecent} className="p-1.5 rounded-lg border"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }} title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
        {recentLoading ? (
          <p className="text-sm" style={{ color: 'var(--t-muted)' }}>Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--t-muted)' }}>No manual bills yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--t-border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--t-primary)', color: 'white' }}>
                  {['Invoice #', 'Customer', 'Date', 'Total', 'Paid', 'Outstanding', 'Status', ''].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((inv, i) => (
                  <tr key={inv._id} style={{
                    borderTop: '1px solid var(--t-border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--t-bg)',
                  }}>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--t-primary)' }}>
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--t-text)' }}>
                      {inv.customerName}
                      <div style={{ color: 'var(--t-muted)' }}>{inv.customerPhone || '—'}</div>
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--t-muted)' }}>
                      {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--t-text)' }}>{INR(inv.grandTotal)}</td>
                    <td className="px-3 py-2" style={{ color: '#15803d' }}>{INR(inv.amountPaid)}</td>
                    <td className="px-3 py-2 font-semibold"
                      style={{ color: (inv.outstandingAfter || 0) > 0 ? '#b91c1c' : '#15803d' }}>
                      {INR(inv.outstandingAfter)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          background: inv.status === 'active' ? '#dcfce7' : '#fee2e2',
                          color: inv.status === 'active' ? '#15803d' : '#b91c1c',
                        }}>
                        {String(inv.status).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <button onClick={() => openBill(inv)} title="Payments"
                          className="p-1.5 rounded border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
                          <IndianRupee size={12} />
                        </button>
                        {/* eslint-disable-next-line react/jsx-no-target-blank -- same-origin admin link; keeping window.opener preserves session auth */}
                        <a href={`/invoice/view/${inv.invoiceNumber}`} target="_blank" rel="opener" title="View invoice"
                          className="p-1.5 rounded border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
                          <Eye size={12} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
