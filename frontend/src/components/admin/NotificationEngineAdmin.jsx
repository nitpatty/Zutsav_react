import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Zap, Bell, BellOff, Settings, Search, RefreshCw, ChevronDown, ChevronUp,
  ChevronRight, Plus, Edit3, Trash2, ToggleLeft, ToggleRight, Send, Copy,
  Download, Upload, History, X, Save, Loader, Activity, MessageSquare,
  RotateCcw, CheckSquare, Square, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';

// ─── Shared constants ───────────────────────────────────────────────────────
const CHANNEL_LABELS = { whatsapp: 'WhatsApp', email: 'Email', inapp: 'In-App' };
const RECIPIENT_LABELS = { user: 'Customer', pandit: 'Pandit', admin: 'Admin', referral_pandit: 'Referral Pandit' };
const CHANNEL_COLORS = {
  whatsapp: { bg: '#dcfce7', text: '#166534' },
  email:    { bg: '#dbeafe', text: '#1e40af' },
  inapp:    { bg: '#ede9fe', text: '#6d28d9' },
};
const LOG_STATUS_COLORS = {
  delivered: '#059669', sent: '#166534', failed: '#dc2626', dead_letter: '#991b1b',
  processing: '#b45309', queued: '#6b7280', retrying: '#b45309', skipped: '#6b7280', cancelled: '#6b7280',
};

const TOP_TABS = [
  { key: 'mappings', label: 'Mappings', Icon: Zap },
  { key: 'whatsapp',  label: 'WhatsApp Sync', Icon: MessageSquare },
  { key: 'logs',      label: 'Logs', Icon: Activity },
];

const inputStyle = { background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' };

// ═════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════
export default function NotificationEngineAdmin() {
  const [tab, setTab] = useState('mappings');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--t-text)' }}>Notification Engine</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--t-muted)' }}>
            One event-driven system for every notification — configure mappings, sync WhatsApp templates, and watch delivery logs.
          </p>
        </div>
        <div className="flex gap-2">
          {TOP_TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === key ? 'text-white' : 'border'}`}
              style={tab === key ? { background: 'var(--t-primary)' } : { borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
              <Icon className="w-4 h-4 inline mr-1" />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'mappings' && <MappingsView />}
      {tab === 'whatsapp' && <WhatsAppSyncView />}
      {tab === 'logs' && <LogsView />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// MAPPINGS VIEW
// ═════════════════════════════════════════════════════════════════════════
function MappingsView() {
  const [events, setEvents] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [waTemplates, setWaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [testModal, setTestModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const importInputRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, mapRes, tmplRes] = await Promise.all([
        API.get('/admin/notifications/events'),
        API.get('/admin/notifications/mappings', { params: { limit: 500 } }),
        API.get('/admin/notifications/whatsapp-templates'),
      ]);
      setEvents(evRes.data.events || []);
      setMappings(mapRes.data.mappings || []);
      setWaTemplates(tmplRes.data.templates || []);
    } catch { toast.error('Failed to load notification data'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveMapping(form) {
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await API.post('/admin/notifications/mappings', form);
        toast.success('Mapping created');
      } else {
        await API.patch(`/admin/notifications/mappings/${modal.mapping._id}`, form);
        toast.success('Mapping updated');
      }
      setModal(null);
      await loadData();
    } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  }

  async function toggleMapping(id, enabled) {
    try {
      await API.patch(`/admin/notifications/mappings/${id}/toggle`, { enabled: !enabled });
      setMappings((m) => m.map((x) => (x._id === id ? { ...x, enabled: !enabled } : x)));
    } catch { toast.error('Toggle failed'); }
  }

  async function deleteMapping(id) {
    if (!window.confirm('Delete this mapping? This cannot be undone (though version history is preserved).')) return;
    try {
      await API.delete(`/admin/notifications/mappings/${id}`);
      setMappings((m) => m.filter((x) => x._id !== id));
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  }

  async function cloneMapping(id) {
    try {
      const { data } = await API.post(`/admin/notifications/mappings/${id}/clone`);
      toast.success('Cloned — new mapping starts disabled');
      setMappings((m) => [...m, data.mapping]);
    } catch (e) { toast.error(e.response?.data?.message || 'Clone failed'); }
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runBulk(action) {
    if (!selected.size) return;
    if (action === 'delete' && !window.confirm(`Delete ${selected.size} mapping(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      await API.post('/admin/notifications/mappings/bulk', { ids: [...selected], action });
      toast.success(`Bulk ${action} applied to ${selected.size} mapping(s)`);
      setSelected(new Set());
      await loadData();
    } catch (e) { toast.error(e.response?.data?.message || 'Bulk action failed'); }
    setBulkBusy(false);
  }

  async function exportMappings() {
    try {
      const { data } = await API.get('/admin/notifications/mappings/export');
      const blob = new Blob([JSON.stringify(data.mappings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notification-mappings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.count} mapping(s)`);
    } catch { toast.error('Export failed'); }
  }

  async function importMappings(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.mappings;
      if (!Array.isArray(list)) throw new Error('File must contain a JSON array of mappings');
      const { data } = await API.post('/admin/notifications/mappings/import', { mappings: list });
      toast.success(`Imported ${data.createdCount} mapping(s)${data.errorCount ? `, ${data.errorCount} error(s)` : ''}`);
      if (data.errorCount) console.warn('Import errors:', data.errors);
      await loadData();
    } catch (e2) { toast.error(e2.message || 'Import failed — check the file is valid JSON'); }
    e.target.value = '';
  }

  const categories = [...new Set(events.map((e) => e.category))].sort();
  const q = filterText.trim().toLowerCase();
  const filteredEvents = events.filter((e) =>
    (!q || (e.name || '').toLowerCase().includes(q) || (e.label || '').toLowerCase().includes(q)) &&
    (!filterCategory || e.category === filterCategory)
  );
  const groupedByCategory = categories.reduce((acc, cat) => {
    acc[cat] = filteredEvents.filter((e) => e.category === cat);
    return acc;
  }, {});
  const getMappingsForEvent = (eventName) => mappings.filter((m) => m.eventName === eventName);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader className="animate-spin w-8 h-8" style={{ color: 'var(--t-primary)' }} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: events.length, color: '#1B1F3B', Icon: Zap },
          { label: 'Active Mappings', value: mappings.filter((m) => m.enabled).length, color: '#059669', Icon: Bell },
          { label: 'Disabled Mappings', value: mappings.filter((m) => !m.enabled).length, color: '#dc2626', Icon: BellOff },
          { label: 'Total Mappings', value: mappings.length, color: '#7c3aed', Icon: Settings },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="rounded-2xl border p-4" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2" style={{ background: color + '15' }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--t-text)' }}>{value}</div>
                <div className="text-xs" style={{ color: 'var(--t-muted)' }}>{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--t-muted)' }} />
          <input placeholder="Search events…" value={filterText} onChange={(e) => setFilterText(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-xl border text-sm w-56" style={inputStyle} />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border text-sm" style={inputStyle}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={loadData} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
          <RefreshCw className="w-4 h-4" />
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={exportMappings} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
            <Download className="w-4 h-4" />Export
          </button>
          <button onClick={() => importInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
            <Upload className="w-4 h-4" />Import
          </button>
          <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={importMappings} />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ background: 'var(--t-primary)10', borderColor: 'var(--t-primary)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>{selected.size} selected</span>
          <button disabled={bulkBusy} onClick={() => runBulk('enable')} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#059669' }}>Enable</button>
          <button disabled={bulkBusy} onClick={() => runBulk('disable')} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--t-bg)', color: 'var(--t-text)' }}>Disable</button>
          <button disabled={bulkBusy} onClick={() => runBulk('delete')} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#dc2626' }}>Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs" style={{ color: 'var(--t-muted)' }}>Clear</button>
        </div>
      )}

      <div className="space-y-3">
        {categories.filter((cat) => groupedByCategory[cat]?.length > 0).map((cat) => (
          <div key={cat} className="rounded-2xl border overflow-hidden" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
            <button onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-80 transition-opacity">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm" style={{ color: 'var(--t-text)' }}>{cat}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--t-primary)15', color: 'var(--t-primary)' }}>
                  {groupedByCategory[cat].length} events
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>
                  {groupedByCategory[cat].reduce((n, e) => n + getMappingsForEvent(e.name).filter((m) => m.enabled).length, 0)} active
                </span>
              </div>
              {expandedCategory === cat ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--t-muted)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--t-muted)' }} />}
            </button>
            {expandedCategory === cat && (
              <div className="divide-y" style={{ borderColor: 'var(--t-border)' }}>
                {groupedByCategory[cat].map((event) => (
                  <NotifEventRow key={event.name} event={event}
                    mappings={getMappingsForEvent(event.name)}
                    selected={selected}
                    onSelect={toggleSelect}
                    onAdd={() => setModal({ mode: 'create', mapping: { eventName: event.name, channel: 'whatsapp', recipientType: 'user', enabled: true, priority: 0 } })}
                    onEdit={(m) => setModal({ mode: 'edit', mapping: m })}
                    onToggle={(m) => toggleMapping(m._id, m.enabled)}
                    onDelete={(m) => deleteMapping(m._id)}
                    onClone={(m) => cloneMapping(m._id)}
                    onTest={(m) => setTestModal(m)}
                    onHistory={(m) => setHistoryModal(m)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <MappingModal mode={modal.mode} initial={modal.mapping} waTemplates={waTemplates}
          onSave={saveMapping} onClose={() => setModal(null)} saving={saving} />
      )}
      {testModal && <TestDryRunModal mapping={testModal} onClose={() => setTestModal(null)} />}
      {historyModal && <HistoryDrawer mapping={historyModal} onClose={() => setHistoryModal(null)} onRestored={loadData} />}
    </div>
  );
}

function NotifEventRow({ event, mappings, selected, onSelect, onAdd, onEdit, onToggle, onDelete, onClone, onTest, onHistory }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="font-medium text-sm" style={{ color: 'var(--t-text)' }}>{event.label}</span>
          <code className="text-xs mt-0.5 block" style={{ color: 'var(--t-muted)' }}>{event.name}</code>
        </div>
        <button onClick={onAdd} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0" style={{ background: 'var(--t-primary)' }}>
          <Plus className="w-3 h-3" />Add
        </button>
      </div>
      {mappings.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--t-muted)' }}>No mappings — this event fires silently.</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => (
            <div key={m._id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--t-bg)', opacity: m.enabled ? 1 : 0.55 }}>
              <button onClick={() => onSelect(m._id)} className="shrink-0">
                {selected.has(m._id) ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--t-primary)' }} /> : <Square className="w-4 h-4" style={{ color: 'var(--t-muted)' }} />}
              </button>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (CHANNEL_COLORS[m.channel] || CHANNEL_COLORS.inapp).bg, color: (CHANNEL_COLORS[m.channel] || CHANNEL_COLORS.inapp).text }}>
                {CHANNEL_LABELS[m.channel] || m.channel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
                {RECIPIENT_LABELS[m.recipientType] || m.recipientType}
              </span>
              {(m.whatsappTemplateName || m.emailTemplateName) && (
                <span className="text-xs font-mono" style={{ color: 'var(--t-muted)' }}>{m.whatsappTemplateName || m.emailTemplateName}</span>
              )}
              {m.label && <span className="text-xs" style={{ color: 'var(--t-muted)' }}>{m.label}</span>}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => onTest(m)} title="Test / Dry-run" className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  <Send className="w-3.5 h-3.5" style={{ color: '#7c3aed' }} />
                </button>
                <button onClick={() => onHistory(m)} title="Version history" className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  <History className="w-3.5 h-3.5" style={{ color: 'var(--t-muted)' }} />
                </button>
                <button onClick={() => onClone(m)} title="Clone" className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  <Copy className="w-3.5 h-3.5" style={{ color: 'var(--t-muted)' }} />
                </button>
                <button onClick={() => onEdit(m)} title="Edit" className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--t-muted)' }} />
                </button>
                <button onClick={() => onToggle(m)} title={m.enabled ? 'Disable' : 'Enable'} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  {m.enabled ? <ToggleRight className="w-4 h-4" style={{ color: '#059669' }} /> : <ToggleLeft className="w-4 h-4" style={{ color: '#6b7280' }} />}
                </button>
                <button onClick={() => onDelete(m)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// MAPPING MODAL (create/edit)
// ═════════════════════════════════════════════════════════════════════════
function MappingModal({ mode, initial, waTemplates, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    eventName:            initial.eventName            || '',
    recipientType:        initial.recipientType        || 'user',
    channel:              initial.channel              || 'whatsapp',
    whatsappTemplateName: initial.whatsappTemplateName || '',
    whatsappLanguage:     initial.whatsappLanguage     || 'en',
    whatsappVariables:    initial.whatsappVariables    || [],
    whatsappButtonType:        initial.whatsappButtonType        || 'none',
    whatsappButtonPayloadPath: initial.whatsappButtonPayloadPath || '',
    emailTemplateName:    initial.emailTemplateName    || '',
    emailSubject:         initial.emailSubject         || '',
    emailHtml:            initial.emailHtml            || '',
    inAppType:            initial.inAppType            || '',
    inAppTitle:           initial.inAppTitle           || '',
    inAppMessage:         initial.inAppMessage         || '',
    enabled:              initial.enabled !== false,
    priority:             initial.priority             || 0,
    label:                initial.label               || '',
  });
  const [varInput, setVarInput] = useState({ position: '', payloadPath: '', label: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addVar = () => {
    if (!varInput.position || !varInput.payloadPath) return;
    set('whatsappVariables', [...form.whatsappVariables, { ...varInput, position: Number(varInput.position) }]);
    setVarInput({ position: '', payloadPath: '', label: '' });
  };
  const removeVar = (i) => set('whatsappVariables', form.whatsappVariables.filter((_, idx) => idx !== i));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" style={{ background: 'var(--t-card)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--t-border)' }}>
          <h3 className="font-bold text-lg" style={{ color: 'var(--t-text)' }}>{mode === 'create' ? 'Add Notification Mapping' : 'Edit Mapping'}</h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--t-muted)' }} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Event</label>
              <input value={form.eventName} readOnly className="w-full px-3 py-2 rounded-xl border text-sm font-mono cursor-default opacity-70" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Label</label>
              <input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. WhatsApp to customer" className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Channel</label>
              <select value={form.channel} onChange={(e) => set('channel', e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="inapp">In-App</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Recipient</label>
              <select value={form.recipientType} onChange={(e) => set('recipientType', e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle}>
                <option value="user">Customer</option>
                <option value="pandit">Pandit</option>
                <option value="admin">Admin</option>
                <option value="referral_pandit">Referral Pandit</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Priority</label>
              <input type="number" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
            </div>
          </div>

          {form.channel === 'whatsapp' && (
            <div className="space-y-3 rounded-xl p-4 border" style={{ borderColor: '#bbf7d0', background: '#dcfce715' }}>
              <h4 className="text-sm font-semibold" style={{ color: '#166534' }}>WhatsApp Config</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Template (Meta-synced)</label>
                  <select value={form.whatsappTemplateName} onChange={(e) => set('whatsappTemplateName', e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle}>
                    <option value="">— select template —</option>
                    {waTemplates.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.language || 'en'})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Language</label>
                  <input value={form.whatsappLanguage} onChange={(e) => set('whatsappLanguage', e.target.value)} placeholder="en" className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--t-muted)' }}>Body Variables (positional)</label>
                {form.whatsappVariables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--t-bg)', color: 'var(--t-muted)', minWidth: 28 }}>#{v.position}</span>
                    <span className="text-xs font-mono flex-1" style={{ color: 'var(--t-text)' }}>{v.payloadPath}</span>
                    {v.label && <span className="text-xs" style={{ color: 'var(--t-muted)' }}>{v.label}</span>}
                    <button onClick={() => removeVar(i)} className="p-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input type="number" placeholder="#" value={varInput.position} onChange={(e) => setVarInput((v) => ({ ...v, position: e.target.value }))}
                    className="w-16 px-2 py-1.5 rounded-lg border text-xs" style={inputStyle} />
                  <input placeholder="payload.path (e.g. customer.name)" value={varInput.payloadPath} onChange={(e) => setVarInput((v) => ({ ...v, payloadPath: e.target.value }))}
                    className="flex-1 px-2 py-1.5 rounded-lg border text-xs font-mono" style={inputStyle} />
                  <input placeholder="label" value={varInput.label} onChange={(e) => setVarInput((v) => ({ ...v, label: e.target.value }))}
                    className="w-24 px-2 py-1.5 rounded-lg border text-xs" style={inputStyle} />
                  <button onClick={addVar} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#166534' }}><Plus className="w-3 h-3" /></button>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--t-muted)' }}>
                  Paths: customer.name · customer.phone · booking.number · booking.poojaName · order.number · payment.amount · otp.code
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: '#bbf7d0' }}>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Button Type</label>
                  <select value={form.whatsappButtonType} onChange={(e) => set('whatsappButtonType', e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle}>
                    <option value="none">None</option>
                    <option value="copy_code">Copy Code (OTP)</option>
                  </select>
                </div>
                {form.whatsappButtonType === 'copy_code' && (
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Button Payload Path</label>
                    <input value={form.whatsappButtonPayloadPath} onChange={(e) => set('whatsappButtonPayloadPath', e.target.value)} placeholder="otp.code"
                      className="w-full px-3 py-2 rounded-xl border text-sm font-mono" style={inputStyle} />
                  </div>
                )}
              </div>
            </div>
          )}

          {form.channel === 'email' && (
            <div className="space-y-3 rounded-xl p-4 border" style={{ borderColor: '#bfdbfe', background: '#dbeafe15' }}>
              <h4 className="text-sm font-semibold" style={{ color: '#1e40af' }}>Email Config</h4>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Subject</label>
                <input value={form.emailSubject} onChange={(e) => set('emailSubject', e.target.value)} placeholder="Booking Confirmed - {{booking.number}}"
                  className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>HTML Body (supports {'{{customer.name}}'})</label>
                <textarea rows={6} value={form.emailHtml} onChange={(e) => set('emailHtml', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm font-mono" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
          )}

          {form.channel === 'inapp' && (
            <div className="space-y-3 rounded-xl p-4 border" style={{ borderColor: '#ddd6fe', background: '#ede9fe15' }}>
              <h4 className="text-sm font-semibold" style={{ color: '#6d28d9' }}>In-App Config</h4>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Notification Type</label>
                <input value={form.inAppType} onChange={(e) => set('inAppType', e.target.value)} placeholder="e.g. booking_confirmed"
                  className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Title (supports {'{{variables}}'})</label>
                <input value={form.inAppTitle} onChange={(e) => set('inAppTitle', e.target.value)} placeholder="Booking #{{booking.number}} confirmed"
                  className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Message (supports {'{{variables}}'})</label>
                <textarea rows={3} value={form.inAppMessage} onChange={(e) => set('inAppMessage', e.target.value)} placeholder="Your {{booking.poojaName}} is confirmed for {{booking.date}}"
                  className="w-full px-3 py-2 rounded-xl border text-sm" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => set('enabled', !form.enabled)}>
              {form.enabled ? <ToggleRight className="w-8 h-8" style={{ color: '#059669' }} /> : <ToggleLeft className="w-8 h-8" style={{ color: '#6b7280' }} />}
            </button>
            <span className="text-sm" style={{ color: 'var(--t-text)' }}>{form.enabled ? 'Enabled — will fire on event' : 'Disabled — will be skipped'}</span>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--t-primary)' }}>
            {saving ? <Loader className="w-4 h-4 animate-spin inline mr-1" /> : <Save className="w-4 h-4 inline mr-1" />}
            {mode === 'create' ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// TEST / DRY-RUN MODAL
// ═════════════════════════════════════════════════════════════════════════
function TestDryRunModal({ mapping, onClose }) {
  const [overridePhone, setOverridePhone] = useState('');
  const [overrideEmail, setOverrideEmail] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const runDryRun = useCallback(async (send = false) => {
    if (send) setSending(true); else setLoading(true);
    try {
      const { data } = await API.post(`/admin/notifications/mappings/${mapping._id}/test`, {
        overridePhone: overridePhone || undefined,
        overrideEmail: overrideEmail || undefined,
        send,
      });
      setPreview(data);
      if (send) {
        if (data.sent) toast.success('Test notification sent');
        else toast.error(data.sendError || 'Not sent — see details below');
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Dry-run failed');
    }
    setLoading(false);
    setSending(false);
  }, [mapping._id, overridePhone, overrideEmail]);

  useEffect(() => { runDryRun(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" style={{ background: 'var(--t-card)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--t-border)' }}>
          <h3 className="font-bold" style={{ color: 'var(--t-text)' }}>Test / Dry-Run</h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--t-muted)' }} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--t-bg)', color: 'var(--t-muted)' }}>
            <span className="font-mono">{mapping.eventName}</span> → <strong>{CHANNEL_LABELS[mapping.channel]}</strong> → <strong>{RECIPIENT_LABELS[mapping.recipientType]}</strong>
          </div>

          {mapping.channel === 'whatsapp' && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Override Phone</label>
              <input value={overridePhone} onChange={(e) => setOverridePhone(e.target.value)} placeholder="91XXXXXXXXXX" className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
            </div>
          )}
          {mapping.channel === 'email' && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Override Email</label>
              <input value={overrideEmail} onChange={(e) => setOverrideEmail(e.target.value)} placeholder="test@example.com" type="email" className="w-full px-3 py-2 rounded-xl border text-sm" style={inputStyle} />
            </div>
          )}

          <button onClick={() => runDryRun(false)} disabled={loading} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
            <RefreshCw className={`w-3 h-3 inline mr-1 ${loading ? 'animate-spin' : ''}`} />Re-render preview
          </button>

          {loading ? (
            <div className="flex justify-center py-8"><Loader className="animate-spin w-6 h-6" style={{ color: 'var(--t-primary)' }} /></div>
          ) : preview && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {preview.valid ? (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#059669' }}><CheckCircle2 className="w-4 h-4" />All required variables present</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#dc2626' }}>
                    <AlertTriangle className="w-4 h-4" />
                    {(preview.blockingReasons && preview.blockingReasons.length > 0)
                      ? preview.blockingReasons.join('; ')
                      : `Missing: ${preview.missingVariables.join(', ')}`}
                  </span>
                )}
              </div>

              {mapping.channel === 'whatsapp' && preview.whatsappChecklist && (
                <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>
                      Variable Checklist — {preview.whatsappChecklist.templateName || '(no template)'}
                    </p>
                    <span className="text-xs font-mono" style={{ color: preview.whatsappChecklist.countMatches ? '#059669' : '#dc2626' }}>
                      {preview.whatsappChecklist.configuredCount}/{preview.whatsappChecklist.expectedCount ?? '?'} configured
                    </span>
                  </div>
                  {!preview.whatsappChecklist.templateFound && (
                    <p className="text-xs flex items-center gap-1" style={{ color: '#dc2626' }}>
                      <AlertTriangle className="w-3 h-3" />Template not found in synced WhatsAppTemplate collection
                    </p>
                  )}
                  {preview.whatsappChecklist.rows.length > 0 && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ color: 'var(--t-muted)' }}>
                          <th className="text-left font-medium py-1">#</th>
                          <th className="text-left font-medium py-1">Payload Path</th>
                          <th className="text-left font-medium py-1">Resolved Value</th>
                          <th className="text-left font-medium py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.whatsappChecklist.rows.map((row) => (
                          <tr key={row.position} style={{ borderTop: '1px solid var(--t-border)' }}>
                            <td className="py-1" style={{ color: 'var(--t-text)' }}>{row.position}</td>
                            <td className="py-1 font-mono" style={{ color: 'var(--t-text)' }}>{row.payloadPath || '—'}</td>
                            <td className="py-1 font-mono truncate max-w-[140px]" style={{ color: row.ok ? 'var(--t-text)' : '#dc2626' }} title={row.ok ? String(row.value ?? '') : (row.reason || '')}>
                              {row.ok ? String(row.value ?? '') : (row.reason || '—')}
                            </td>
                            <td className="py-1">
                              {row.ok
                                ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#059669' }} />
                                : <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>Rendered Content</p>
                {mapping.channel === 'email' && (
                  <>
                    <p className="text-xs" style={{ color: 'var(--t-muted)' }}><strong>Subject:</strong> {preview.rendered.subject || '(empty)'}</p>
                    <div className="text-xs max-h-40 overflow-y-auto whitespace-pre-wrap font-mono" style={{ color: 'var(--t-text)' }}>{preview.rendered.html || '(empty)'}</div>
                  </>
                )}
                {mapping.channel === 'whatsapp' && (
                  <>
                    <p className="text-xs" style={{ color: 'var(--t-muted)' }}><strong>Template:</strong> {preview.rendered.templateName || '(none)'} ({preview.rendered.languageCode})</p>
                    <pre className="text-xs max-h-40 overflow-y-auto" style={{ color: 'var(--t-text)' }}>{JSON.stringify(preview.rendered.components, null, 2)}</pre>
                  </>
                )}
                {mapping.channel === 'inapp' && (
                  <>
                    <p className="text-xs" style={{ color: 'var(--t-muted)' }}><strong>Title:</strong> {preview.rendered.title || '(empty)'}</p>
                    <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--t-text)' }}>{preview.rendered.message || '(empty)'}</p>
                  </>
                )}
              </div>

              {preview.sendResult?.skip && (
                <p className="text-xs" style={{ color: '#b45309' }}>Last send attempt was skipped: {preview.sendResult.reason}</p>
              )}
            </div>
          )}

          <p className="text-xs" style={{ color: 'var(--t-muted)' }}>Rendered against fabricated sample data — no real booking/order required.</p>
        </div>
        <div className="flex gap-3 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Close</button>
          <button onClick={() => runDryRun(true)} disabled={sending || loading || !preview?.valid} className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: '#7c3aed' }}>
            {sending ? <Loader className="w-4 h-4 animate-spin inline mr-1" /> : <Send className="w-4 h-4 inline mr-1" />}Send Test
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// VERSION HISTORY DRAWER
// ═════════════════════════════════════════════════════════════════════════
function HistoryDrawer({ mapping, onClose, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [restoring, setRestoring] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get(`/admin/notifications/mappings/${mapping._id}/history`);
      setVersions(data.versions || []);
    } catch { toast.error('Failed to load version history'); }
    setLoading(false);
  }, [mapping._id]);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (versionId) => {
    if (!window.confirm('Restore this version? This will overwrite the mapping\'s current content and create a new version entry.')) return;
    setRestoring(versionId);
    try {
      await API.post(`/admin/notifications/mappings/${mapping._id}/history/${versionId}/restore`);
      toast.success('Mapping restored');
      await load();
      onRestored && onRestored();
    } catch (e) { toast.error(e.response?.data?.message || 'Restore failed'); }
    setRestoring(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" style={{ background: 'var(--t-card)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--t-border)' }}>
          <div>
            <h3 className="font-bold" style={{ color: 'var(--t-text)' }}>Version History</h3>
            <code className="text-xs" style={{ color: 'var(--t-muted)' }}>{mapping.eventName} · {CHANNEL_LABELS[mapping.channel]}</code>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--t-muted)' }} /></button>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--t-border)' }}>
          {loading ? (
            <div className="flex justify-center py-12"><Loader className="animate-spin w-6 h-6" style={{ color: 'var(--t-primary)' }} /></div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--t-muted)' }}>No changes recorded yet.</div>
          ) : versions.map((v) => (
            <div key={v._id} className="px-5 py-4">
              <button className="w-full flex items-center justify-between text-left" onClick={() => setExpanded(expanded === v._id ? null : v._id)}>
                <div className="flex items-center gap-3">
                  {expanded === v._id ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--t-muted)' }} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--t-muted)' }} />}
                  <div>
                    <div className="text-sm font-medium capitalize" style={{ color: 'var(--t-text)' }}>
                      {v.action}
                      {v.note && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--t-muted)' }}>({v.note})</span>}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--t-muted)' }}>{v.updatedByName || 'Admin'} · {new Date(v.createdAt).toLocaleString()} · {v.ipAddress || 'unknown IP'}</div>
                  </div>
                </div>
                <span className="text-xs" style={{ color: 'var(--t-muted)' }}>{v.changedFields?.length || 0} field(s)</span>
              </button>
              {expanded === v._id && (
                <div className="mt-3 ml-6 space-y-2">
                  {(v.changedFields || []).map((c) => (
                    <div key={c.field} className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--t-bg)' }}>
                      <span className="font-medium" style={{ color: 'var(--t-text)' }}>{c.field}</span>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="line-through" style={{ color: '#dc2626' }}>{c.oldValue || '(empty)'}</span>
                        <span style={{ color: 'var(--t-muted)' }}>→</span>
                        <span style={{ color: '#059669' }}>{c.newValue || '(empty)'}</span>
                      </div>
                    </div>
                  ))}
                  {v.action !== 'delete' && (
                    <button onClick={() => handleRestore(v._id)} disabled={restoring === v._id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 mt-2"
                      style={{ background: 'var(--t-bg)', color: 'var(--t-text)' }}>
                      <RotateCcw className="w-3 h-3" />{restoring === v._id ? 'Restoring…' : 'Restore this version'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// WHATSAPP SYNC VIEW
// ═════════════════════════════════════════════════════════════════════════
function WhatsAppSyncView() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/comm/wa-templates');
      setTemplates(data.templates || []);
    } catch { toast.error('Failed to load WhatsApp templates'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await API.post('/comm/wa-templates/sync');
      toast.success(data.message);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Sync failed — check WhatsApp credentials in System Settings');
    }
    setSyncing(false);
  };

  const toggleActive = async (t) => {
    setToggling((s) => ({ ...s, [t._id]: true }));
    try {
      await API.patch(`/comm/wa-templates/${t._id}`, { isActive: !t.isActive });
      setTemplates((prev) => prev.map((tmpl) => (tmpl._id === t._id ? { ...tmpl, isActive: !t.isActive } : tmpl)));
    } catch (e) {
      toast.error(e.response?.data?.message || 'Toggle failed');
    }
    setToggling((s) => ({ ...s, [t._id]: false }));
  };

  const enabledCount = templates.filter((t) => t.isActive && t.status === 'APPROVED').length;

  if (loading) return (
    <div className="flex items-center justify-center py-24"><Loader className="animate-spin w-8 h-8" style={{ color: 'var(--t-primary)' }} /></div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--t-text)' }}>WhatsApp Templates</h3>
          {enabledCount > 0 && <p className="text-xs mt-0.5" style={{ color: '#059669' }}>{enabledCount} template{enabledCount !== 1 ? 's' : ''} active</p>}
        </div>
        <button onClick={sync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--t-primary)' }}>
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing…' : 'Sync from Meta'}
        </button>
      </div>

      <div className="rounded-xl p-4 text-sm space-y-1" style={{ background: '#fef3c7', color: '#92400e' }}>
        <p>Templates are managed in <strong>Meta Business Manager</strong> and synced here. Only <strong>APPROVED</strong> templates can be used in a mapping.</p>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No templates yet — click "Sync from Meta" to import your approved templates.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t._id} className="rounded-2xl border p-4" style={{ background: 'var(--t-card)', borderColor: t.isActive && t.status === 'APPROVED' ? '#bbf7d0' : 'var(--t-border)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold font-mono text-sm" style={{ color: 'var(--t-text)' }}>{t.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--t-bg)', color: 'var(--t-muted)' }}>{t.status}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--t-bg)', color: 'var(--t-muted)' }}>{t.category?.toLowerCase()}</span>
                    <span className="text-xs" style={{ color: 'var(--t-muted)' }}>{t.language}</span>
                    {t.isActive && t.status === 'APPROVED' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>Active</span>
                    )}
                  </div>
                  {t.syncedAt && <p className="text-xs mt-1" style={{ color: 'var(--t-muted)' }}>Synced {new Date(t.syncedAt).toLocaleString('en-IN')}</p>}
                </div>
                <button onClick={() => toggleActive(t)} disabled={toggling[t._id] || t.status !== 'APPROVED'}
                  title={t.status !== 'APPROVED' ? `Cannot enable — status is ${t.status}` : (t.isActive ? 'Disable' : 'Enable')}
                  className="shrink-0 disabled:opacity-40">
                  {t.isActive ? <ToggleRight className="w-6 h-6" style={{ color: '#059669' }} /> : <ToggleLeft className="w-6 h-6" style={{ color: '#9ca3af' }} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// LOGS VIEW
// ═════════════════════════════════════════════════════════════════════════
function LogsView() {
  const [events, setEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [retrying, setRetrying] = useState(null);

  useEffect(() => {
    API.get('/admin/notifications/events').then((res) => setEvents(res.data.events || [])).catch(() => {});
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filterEvent) params.event = filterEvent;
      if (filterStatus) params.status = filterStatus;
      const { data } = await API.get('/admin/notifications/logs', { params });
      setLogs(data.logs || []);
      setMeta({ total: data.total || 0, page: data.page || 1, pages: data.pages || 1 });
    } catch { toast.error('Failed to load logs'); }
    setLoading(false);
  }, [page, filterEvent, filterStatus]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function retry(log) {
    setRetrying(log._id);
    try {
      await API.post(`/admin/notifications/logs/${log._id}/retry`);
      toast.success('Job re-queued for retry');
      await loadLogs();
    } catch (e) { toast.error(e.response?.data?.message || 'Retry failed'); }
    setRetrying(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select value={filterEvent} onChange={(e) => { setFilterEvent(e.target.value); setPage(1); }} className="px-3 py-2 rounded-xl border text-sm" style={inputStyle}>
          <option value="">All Events</option>
          {events.map((e) => <option key={e.name} value={e.name}>{e.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="px-3 py-2 rounded-xl border text-sm" style={inputStyle}>
          <option value="">All Statuses</option>
          {['delivered', 'failed', 'dead_letter', 'processing', 'queued', 'retrying', 'skipped', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={loadLogs} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader className="animate-spin w-6 h-6" style={{ color: 'var(--t-primary)' }} /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No logs found</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border overflow-x-auto" style={{ borderColor: 'var(--t-border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--t-bg)', color: 'var(--t-muted)', borderBottom: '1px solid var(--t-border)' }}>
                  {['Event', 'Channel', 'Recipient', 'Template', 'Status', 'Retries', 'Time', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} className="border-t hover:bg-black/5 transition-colors" style={{ borderColor: 'var(--t-border)', background: 'var(--t-card)' }}>
                    <td className="px-4 py-3"><span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--t-bg)', color: 'var(--t-muted)' }}>{log.event || log.type}</span></td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (CHANNEL_COLORS[log.type] || CHANNEL_COLORS.inapp).bg, color: (CHANNEL_COLORS[log.type] || CHANNEL_COLORS.inapp).text }}>
                        {CHANNEL_LABELS[log.type] || log.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--t-muted)' }}>{log.recipientName || log.recipientEmail || log.recipientPhone || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--t-muted)' }}>{log.templateName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold" style={{ color: LOG_STATUS_COLORS[log.status] || '#6b7280' }}>{log.status}</span>
                      {log.error && <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: '#dc2626' }} title={log.error}>{log.error}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-center" style={{ color: 'var(--t-muted)' }}>{log.retryCount || 0}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--t-muted)' }}>
                      {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      {(log.status === 'failed' || log.status === 'dead_letter') && log.jobId && (
                        <button onClick={() => retry(log)} disabled={retrying === log._id} className="text-xs font-semibold px-2 py-1 rounded-lg border disabled:opacity-50" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
                          {retrying === log._id ? '…' : 'Retry'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta.pages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--t-muted)' }}>{meta.total} logs · Page {meta.page} of {meta.pages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Prev</button>
                <button onClick={() => setPage((p) => Math.min(meta.pages, p + 1))} disabled={page === meta.pages} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
