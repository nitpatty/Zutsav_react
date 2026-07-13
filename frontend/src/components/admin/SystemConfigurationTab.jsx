import React, { useEffect, useState, useCallback } from 'react';
import {
  Globe, Building2, MonitorSmartphone, Smartphone, MessageCircle, Shield,
  Plug, History, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Info,
  Save, ExternalLink, Copy, RotateCcw, ChevronDown, ChevronRight, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import { validateField } from '../../utils/configValidation';
import LegalDocumentsSection from './LegalDocumentsSection';

// ─── Sub-tab nav ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'deployment',    label: 'Deployment',    icon: Globe },
  { id: 'company',       label: 'Company',       icon: Building2 },
  { id: 'frontend',      label: 'Frontend',      icon: MonitorSmartphone },
  { id: 'mobile',        label: 'Mobile',        icon: Smartphone },
  { id: 'communication', label: 'Communication', icon: MessageCircle },
  { id: 'security',      label: 'Security',      icon: Shield },
  { id: 'integrations',  label: 'Integrations',  icon: Plug },
  { id: 'advanced',      label: 'Advanced',      icon: History },
];

const STATUS_META = {
  healthy:        { color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200',  icon: CheckCircle2, dot: '🟢' },
  configured:     { color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200',  icon: CheckCircle2, dot: '🟢' },
  warning:        { color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: AlertTriangle, dot: '🟡' },
  not_configured: { color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: AlertTriangle, dot: '🟡' },
  error:          { color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    icon: XCircle, dot: '🔴' },
  offline:        { color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    icon: XCircle, dot: '🔴' },
  info:           { color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: Info, dot: 'ℹ️' },
};

function StatusBadge({ status, message }) {
  const meta = STATUS_META[status] || STATUS_META.info;
  const Icon = meta.icon;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${meta.bg} ${meta.border}`}>
      <Icon size={15} className={meta.color} />
      <span className={`text-xs ${meta.color}`}>{message}</span>
    </div>
  );
}

// ─── Generic manifest-driven field ─────────────────────────────────────────
function ConfigField({ field, value, onChange, error }) {
  const inputType = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {field.label} {field.required && <span className="text-red-500">*</span>}
        {!field.liveApply && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            Requires rebuild
          </span>
        )}
      </label>
      <input
        type={inputType}
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.helpText || ''}
        className={`input w-full ${error ? 'border-red-400 focus:ring-red-300' : ''}`}
      />
      {field.helpText && <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function ReadOnlyRef({ label, value, hint }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-gray-700 font-medium break-all">{value || '— not set —'}</div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

function SaveBanner({ applied, requiresRebuild }) {
  if (!applied?.length && !requiresRebuild?.length) return null;
  return (
    <div className="space-y-2">
      {applied.length > 0 && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span><strong>Applied immediately:</strong> {applied.join(', ')}</span>
        </div>
      )}
      {requiresRebuild.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span><strong>Requires rebuild &amp; redeploy to take effect:</strong> {requiresRebuild.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Editable section (Deployment / Company / Frontend / Communication / Mobile)
// ═══════════════════════════════════════════════════════════════════════════
function EditableSection({ section, fields, values, onValuesChange, onSaved, extra }) {
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const handleChange = (key, value) => {
    onValuesChange({ ...values, [key]: value });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
  };

  const handleSave = async () => {
    const newErrors = {};
    const payload = {};
    for (const field of fields) {
      const v = values[field.key] ?? '';
      const err = validateField(field, v);
      if (err) newErrors[field.key] = err;
      payload[field.key] = v;
    }
    setErrors(newErrors);
    if (Object.values(newErrors).some(Boolean)) {
      toast.error('Fix the highlighted fields before saving');
      return;
    }

    setSaving(true);
    setBanner(null);
    try {
      const { data } = await API.patch(`/admin/config-center/${section}`, payload);
      if (data.unchanged) {
        toast('No changes to save', { icon: 'ℹ️' });
      } else {
        toast.success('Saved successfully');
        setBanner({ applied: data.appliedImmediately || [], requiresRebuild: data.requiresRebuild || [] });
        onSaved && onSaved();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{TABS.find((t) => t.id === section)?.label}</h3>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-saffron-500 text-white px-3 py-1.5 rounded-lg hover:bg-saffron-600 transition-colors disabled:opacity-50">
          <Save size={13} /> {saving ? 'Saving…' : 'Save Section'}
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        {extra}
        {fields.map((field) => (
          <ConfigField
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={handleChange}
            error={errors[field.key]}
          />
        ))}
        {banner && <SaveBanner {...banner} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Advanced — Version History
// ═══════════════════════════════════════════════════════════════════════════
function AdvancedTab({ onRestored }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [restoring, setRestoring] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/config-center/history');
      setVersions(data.versions || []);
    } catch {
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (id) => {
    if (!window.confirm('Restore this version? This will overwrite the current configuration for its section and create a new version entry.')) return;
    setRestoring(id);
    try {
      await API.post(`/admin/config-center/history/${id}/restore`);
      toast.success('Configuration restored');
      await load();
      onRestored && onRestored();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restore failed');
    } finally {
      setRestoring(null);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading version history…</div>;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Version History</h3>
        <p className="text-xs text-gray-400 mt-0.5">Every System Configuration change is recorded here — who, when, from where, and what changed.</p>
      </div>
      <div className="divide-y divide-gray-100">
        {versions.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No configuration changes yet.</div>
        )}
        {versions.map((v) => (
          <div key={v._id} className="px-6 py-4">
            <button className="w-full flex items-center justify-between text-left" onClick={() => setExpanded(expanded === v._id ? null : v._id)}>
              <div className="flex items-center gap-3">
                {expanded === v._id ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    <span className="capitalize">{v.section}</span>
                    {v.action === 'restore' && <span className="ml-2 text-[10px] uppercase bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5">Restore</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {v.updatedByName || 'Admin'} · {new Date(v.createdAt).toLocaleString()} · {v.ipAddress || 'unknown IP'}
                  </div>
                </div>
              </div>
              <span className="text-xs text-gray-400">{v.changedFields?.length || 0} field(s) changed</span>
            </button>
            {expanded === v._id && (
              <div className="mt-3 ml-6 space-y-2">
                {(v.changedFields || []).map((c) => (
                  <div key={c.field} className="text-xs bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-gray-700">{c.field}</span>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-red-500 line-through">{c.oldValue || '(empty)'}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-green-600">{c.newValue || '(empty)'}</span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => handleRestore(v._id)}
                  disabled={restoring === v._id}
                  className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 mt-2"
                >
                  <RotateCcw size={12} /> {restoring === v._id ? 'Restoring…' : 'Restore this version'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Integrations — read-only status, no secrets
// ═══════════════════════════════════════════════════════════════════════════
function IntegrationsTab({ verifyResults }) {
  const rows = (verifyResults || []).filter((r) => !['website', 'backendApi', 'mobileApi', 'database'].includes(r.key));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Integrations</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Status only — credentials are managed in{' '}
          <a href="/admin?tab=system-settings" className="text-saffron-600 hover:underline inline-flex items-center gap-1">
            System Settings <ExternalLink size={11} />
          </a>{' '}for security. Nothing here can ever expose a secret.
        </p>
      </div>
      <div className="px-6 py-5 space-y-2">
        {rows.length === 0 && <p className="text-sm text-gray-400">Click "Verify Configuration" above to load integration status.</p>}
        {rows.map((r) => <StatusBadge key={r.key} status={r.status} message={`${r.label}: ${r.message}`} />)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Security — informational, recent changes feed
// ═══════════════════════════════════════════════════════════════════════════
function SecurityTab() {
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    API.get('/admin/config-center/history').then(({ data }) => setRecent((data.versions || []).slice(0, 10))).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={18} className="text-saffron-500" />
          <h3 className="font-semibold text-gray-900">Access &amp; Audit</h3>
        </div>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
          <li>Only Admin accounts can view, edit, save, or restore System Configuration.</li>
          <li>Every change is logged with who, when, what changed, and from which IP address.</li>
          <li>Secrets (API keys, tokens, passwords) are never readable or writable through this module — see the Integrations tab.</li>
        </ul>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Recent Changes</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {recent.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">No changes yet.</div>}
          {recent.map((v) => (
            <div key={v._id} className="px-6 py-3 text-sm flex items-center justify-between">
              <span className="text-gray-700">
                <span className="capitalize font-medium">{v.section}</span> updated by {v.updatedByName || 'Admin'}
              </span>
              <span className="text-xs text-gray-400">{new Date(v.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SystemConfigurationTab() {
  const [tab, setTab] = useState('deployment');
  const [manifest, setManifest] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState(null);
  const [showVerify, setShowVerify] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [manifestRes, valuesRes] = await Promise.all([
        API.get('/admin/config-center/manifest'),
        API.get('/admin/config-center'),
      ]);
      setManifest(manifestRes.data.manifest);
      setValues(valuesRes.data.values);
    } catch {
      toast.error('Failed to load System Configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async () => {
    setVerifying(true);
    setShowVerify(true);
    try {
      const { data } = await API.get('/admin/config-center/verify');
      setVerifyResults(data.results);
    } catch {
      toast.error('Verification failed to run');
    } finally {
      setVerifying(false);
    }
  };

  const copyEasSnippet = () => {
    const snippet = JSON.stringify({
      EXPO_PUBLIC_API_URL: values.deployMobileApiUrl || values.deployApiUrl || '',
      EXPO_PUBLIC_BASE_URL: (values.deployMobileApiUrl || values.deployApiUrl || '').replace(/\/api\/?$/, ''),
      EXPO_PUBLIC_WEB_URL: values.deployWebsiteUrl || '',
    }, null, 2);
    navigator.clipboard.writeText(snippet);
    toast.success('Copied — paste into mobile-app/eas.json under build.<profile>.env');
  };

  if (loading || !manifest) {
    return <div className="text-center py-20 text-gray-400 text-sm">Loading System Configuration…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Manage deployment URLs, branding, and support contact details — no code changes or server access required.</p>
        </div>
        <button onClick={handleVerify} disabled={verifying}
          className="flex items-center gap-2 bg-charcoal text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
          <RefreshCw size={15} className={verifying ? 'animate-spin' : ''} /> Verify Configuration
        </button>
      </div>

      {/* Verify results panel */}
      {showVerify && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Configuration Health</h3>
            <button onClick={() => setShowVerify(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>
          {verifying ? (
            <div className="text-center py-8 text-gray-400 text-sm">Checking backend, database, and integrations…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(verifyResults || []).map((r) => <StatusBadge key={r.key} status={r.status} message={`${r.label}: ${r.message}`} />)}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab bar */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-gray-100 rounded-2xl p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'deployment' && (
        <EditableSection section="deployment" fields={manifest.deployment} values={values} onValuesChange={setValues} onSaved={load} />
      )}

      {tab === 'company' && (
        <EditableSection
          section="company"
          fields={manifest.company}
          values={values}
          onValuesChange={setValues}
          onSaved={load}
          extra={
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 mb-2">
              Company name, logo, support email, and support phone are managed in{' '}
              <a href="/admin?tab=system-settings" className="underline font-medium">System Settings → General</a>.
              This tab covers legal/tax details used on generated invoices.
            </div>
          }
        />
      )}

      {tab === 'frontend' && <LegalDocumentsSection />}

      {tab === 'mobile' && (
        <EditableSection
          section="mobile"
          fields={manifest.mobile}
          values={values}
          onValuesChange={setValues}
          onSaved={load}
          extra={
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                <ReadOnlyRef label="Mobile API URL" value={values.deployMobileApiUrl || values.deployApiUrl} hint="Edit in Deployment tab" />
                <ReadOnlyRef label="Website URL (referral links)" value={values.deployWebsiteUrl} hint="Edit in Deployment tab" />
              </div>
              <button onClick={copyEasSnippet}
                className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors mb-2">
                <Copy size={12} /> Copy as eas.json env block
              </button>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                Mobile app URLs are compiled into the app at build time. Changing these values requires a new EAS build for already-installed apps to pick them up.
              </div>
            </>
          }
        />
      )}

      {tab === 'communication' && (
        <EditableSection section="communication" fields={manifest.communication} values={values} onValuesChange={setValues} onSaved={load} />
      )}

      {tab === 'security' && <SecurityTab />}
      {tab === 'integrations' && <IntegrationsTab verifyResults={verifyResults} />}
      {tab === 'advanced' && <AdvancedTab onRestored={load} />}
    </div>
  );
}
