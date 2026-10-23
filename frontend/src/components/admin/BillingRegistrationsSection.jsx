import React, { useState } from 'react';
import {
  Plus, Trash2, Save, AlertTriangle, ShieldCheck, RefreshCw, Star,
} from 'lucide-react';
import API from '../../api/axios';
import toast from 'react-hot-toast';

const inputStyle = {
  background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)',
};

const newId = () =>
  `reg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function detailText(err) {
  const data = err?.response?.data;
  if (Array.isArray(data?.details) && data.details.length) {
    return `${data.message || 'Validation failed'} — ${data.details.join('; ')}`;
  }
  return data?.message || err?.message || 'Save failed';
}

export default function BillingRegistrationsSection({ form, setForm }) {
  const [saving, setSaving] = useState(false);
  const rows = Array.isArray(form.companyBillingRegistrations)
    ? form.companyBillingRegistrations
    : [];

  const setRows = (next) =>
    setForm((f) => ({ ...f, companyBillingRegistrations: next }));

  const update = (id, patch) =>
    setRows(rows.map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows([
      ...rows,
      {
        id: newId(),
        legalName: '', gstin: '', pan: '', address: '', state: '',
        stateCode: '', isActive: true, isDefault: rows.length === 0,
      },
    ]);

  const removeRow = (id) => setRows(rows.filter((r) => String(r.id) !== String(id)));

  const makeDefault = (id) =>
    setRows(rows.map((r) => ({ ...r, isDefault: String(r.id) === String(id) })));

  const save = async () => {
    setSaving(true);
    try {
      await API.patch('/admin/settings', { companyBillingRegistrations: rows });
      const { data } = await API.get('/admin/settings');
      setForm((f) => ({
        ...f,
        companyBillingRegistrations: data.settings?.companyBillingRegistrations || [],
      }));
      toast.success('Billing registrations saved');
    } catch (err) {
      toast.error(detailText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">Company Billing / GST Registrations</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            The "Bill From" identities offered on manual tax invoices. Details are snapshotted onto
            each issued invoice, so later edits never change history.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={addRow}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border"
            style={{ borderColor: '#e5e7eb', color: '#374151' }}>
            <Plus size={14} /> Add
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl text-white disabled:opacity-60"
            style={{ background: '#1B1F3B' }}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Registrations'}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {rows.length === 0 && (
          <div className="rounded-xl p-4 text-sm flex items-start gap-2"
            style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              No registration is configured. Manual tax invoices will use the built-in fallback
              identity (GSTIN 07AACCZ8054C1ZB, Delhi) and the admin must explicitly confirm it on
              every invoice. Configure the real registration here to remove that confirmation step.
            </div>
          </div>
        )}

        {rows.map((r, idx) => {
          const derivedStateCode = String(r.gstin || '').trim().slice(0, 2);
          return (
            <div key={r.id} className="rounded-xl border p-4 space-y-3"
              style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--t-text)' }}>
                  Registration {idx + 1}
                  {r.isDefault && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: '#fef3c7', color: '#b45309' }}>
                      <Star size={10} /> DEFAULT
                    </span>
                  )}
                  {r.isActive === false && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: '#f3f4f6', color: '#6b7280' }}>
                      INACTIVE
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!r.isDefault && (
                    <button type="button" onClick={() => makeDefault(r.id)}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold border"
                      style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
                      Make default
                    </button>
                  )}
                  <button type="button" onClick={() => removeRow(r.id)}
                    className="p-1.5 rounded-lg border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  Legal business name *
                  <input value={r.legalName || ''} onChange={(e) => update(r.id, { legalName: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle}
                    placeholder="Zutsav Enterprises Pvt. Ltd." />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  GSTIN *
                  <input value={r.gstin || ''} onChange={(e) => update(r.id, { gstin: e.target.value.toUpperCase() })}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm border font-mono" style={inputStyle}
                    placeholder="07AACCZ8054C1ZB" maxLength={15} />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  PAN
                  <input value={r.pan || ''} onChange={(e) => update(r.id, { pan: e.target.value.toUpperCase() })}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm border font-mono" style={inputStyle}
                    placeholder="AACCZ8054C" maxLength={10} />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Registered state *
                  <input value={r.state || ''} onChange={(e) => update(r.id, { state: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle}
                    placeholder="Delhi" />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  State code (derived from GSTIN)
                  <input value={derivedStateCode} readOnly
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm border font-mono opacity-70"
                    style={inputStyle} placeholder="07" />
                </label>
                <label className="text-xs font-medium text-gray-600 md:col-span-2">
                  Registered address
                  <input value={r.address || ''} onChange={(e) => update(r.id, { address: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm border" style={inputStyle}
                    placeholder="Plot no, street, city, state, pincode" />
                </label>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--t-text)' }}>
                  <input type="checkbox" checked={r.isActive !== false}
                    onChange={(e) => update(r.id, { isActive: e.target.checked })} />
                  Active (offered on new bills)
                </label>
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--t-text)' }}>
                  <input type="checkbox" checked={Boolean(r.isDefault)}
                    onChange={(e) => (e.target.checked ? makeDefault(r.id) : update(r.id, { isDefault: false }))} />
                  Default for new bills
                </label>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl p-3 text-xs flex items-start gap-2"
          style={{ background: '#f0f9ff', color: '#0c4a6e', border: '1px solid #bae6fd' }}>
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <div>
            GSTIN is checked structurally (state prefix, embedded PAN, check-character shape).
            Format validity is not proof of registration — the legal accuracy of these details
            remains an admin responsibility.
          </div>
        </div>
      </div>
    </div>
  );
}
