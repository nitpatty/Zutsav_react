import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link2, FileText, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, ExternalLink, UploadCloud, X, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import { useSettings } from '../../context/SettingsContext';
import { validateFooterLinkForm, formatFileSize, MAX_LABEL } from '../../utils/footerLinks';

const EMPTY_FORM = { label: '', linkType: 'url', url: '', file: null, enabled: true };
const RESERVED_NAMES = 'Privacy Policy, Terms & Conditions, Refund & Cancellation Policy, About Us, Vision, Mission & Core Values';

const messageOf = (err, fallback) => err?.response?.data?.message || fallback;

function Field({ label, error, children }) {
  return (
    <label className="block text-xs font-medium text-gray-600">
      {label}
      <div className="mt-1">{children}</div>
      {error && <p role="alert" className="text-[11px] text-red-600 mt-1">{error}</p>}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-saffron-200';

/**
 * Add / edit form. `existing` null → create. The destination type is an explicit,
 * mutually exclusive choice: only the matching input is shown.
 */
function LinkForm({ existing, onCancel, onSaved }) {
  const [form, setForm] = useState(() => (existing
    ? { label: existing.label, linkType: existing.linkType, url: existing.url || '', file: null, enabled: existing.enabled }
    : EMPTY_FORM));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return; // no duplicate submissions
    const found = validateFooterLinkForm(form, existing);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setProgress(null);
    try {
      const fields = { label: form.label, linkType: form.linkType, enabled: String(form.enabled) };
      let body;
      if (form.linkType === 'url') {
        body = { ...fields, url: form.url.trim() };
      } else {
        body = new FormData();
        Object.entries(fields).forEach(([k, v]) => body.append(k, v));
        if (form.file) body.append('file', form.file);
      }
      const config = form.linkType === 'document' && form.file
        ? { onUploadProgress: (p) => p.total && setProgress(Math.round((p.loaded / p.total) * 100)) }
        : undefined;
      const { data } = existing
        ? await API.patch(`/admin/footer-links/${existing.id}`, body, config)
        : await API.post('/admin/footer-links', body, config);
      toast.success(existing ? 'Footer link updated' : 'Footer link added');
      onSaved(data.link);
    } catch (err) {
      toast.error(messageOf(err, 'Could not save the footer link'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const typeBtn = (value, text, Icon) => (
    // `relative` matters: the radio below is `sr-only` (position:absolute). Without a positioned
    // ancestor it anchors to the page instead of the scrolling admin panel, escapes the panel's
    // overflow clipping and stretches the whole document (a blank white area below the layout).
    <label className={`relative flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
      form.linkType === value ? 'border-saffron-500 bg-saffron-50 text-saffron-700 font-semibold' : 'border-gray-200 text-gray-600'}`}>
      <input type="radio" name="footer-link-type" value={value} checked={form.linkType === value}
        onChange={() => { set({ linkType: value }); setErrors((er) => ({ ...er, url: undefined, file: undefined })); }}
        className="sr-only" />
      <Icon size={14} /> {text}
    </label>
  );

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-saffron-200 shadow-sm px-5 py-5 space-y-4" aria-label={existing ? 'Edit footer link' : 'Add footer link'}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">{existing ? `Edit “${existing.label}”` : 'Add Footer Link'}</h4>
        <button type="button" onClick={onCancel} aria-label="Close form" className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      <Field label="Display Name" error={errors.label}>
        <input value={form.label} maxLength={MAX_LABEL + 20} onChange={(e) => set({ label: e.target.value })}
          placeholder="e.g. Cookie Policy" className={inputCls} />
        <span className="text-[11px] text-gray-400">Shown in the website footer. Names of the fixed legal documents are reserved.</span>
      </Field>

      <div>
        <div className="text-xs font-medium text-gray-600 mb-1">Link Type</div>
        <div className="flex gap-2" role="radiogroup" aria-label="Link type">
          {typeBtn('url', 'Attach URL', Link2)}
          {typeBtn('document', 'Upload Document', UploadCloud)}
        </div>
        {errors.linkType && <p role="alert" className="text-[11px] text-red-600 mt-1">{errors.linkType}</p>}
      </div>

      {form.linkType === 'url' ? (
        <Field label="URL" error={errors.url}>
          <input value={form.url} onChange={(e) => set({ url: e.target.value })} inputMode="url" autoComplete="off"
            placeholder="https://example.com/page" className={inputCls} />
          <span className="text-[11px] text-gray-400">Must start with http:// or https://. It opens in a new tab.</span>
        </Field>
      ) : (
        <Field label="Document" error={errors.file}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg cursor-pointer">
              {existing?.linkType === 'document' ? 'Choose replacement file' : 'Choose file'}
              <input ref={fileRef} type="file" className="hidden"
                onChange={(e) => { set({ file: e.target.files?.[0] || null }); setErrors((er) => ({ ...er, file: undefined })); }} />
            </label>
            <span className="text-xs text-gray-500 break-all min-w-0 flex-1 basis-40"
              title={form.file ? form.file.name : existing?.document?.originalName || ''}>
              {form.file ? `${form.file.name} · ${formatFileSize(form.file.size)}`
                : existing?.linkType === 'document' ? `Current: ${existing.document?.originalName || ''}` : 'No file chosen'}
            </span>
          </div>
          <span className="text-[11px] text-gray-400">
            Documents, images, spreadsheets, presentations, archives and other ordinary files, up to 10 MB. PDFs and images open
            in the browser; other files download. Programs, scripts, macro-enabled Office files and web pages are not allowed.
            Visitors can open it without logging in.
          </span>
        </Field>
      )}

      {existing && existing.linkType !== form.linkType && (
        <p className="text-xs rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">
          Switching type: the {existing.linkType === 'document' ? 'uploaded file will be removed' : 'saved URL will be replaced'} when you save.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Show this link in the footer
      </label>

      {progress !== null && (
        <div aria-label="Upload progress" className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-saffron-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="text-xs px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={busy} className="text-xs px-4 py-2 rounded-lg bg-saffron-500 text-white hover:bg-saffron-600 disabled:opacity-50">
          {busy ? (progress !== null ? `Uploading… ${progress}%` : 'Saving…') : existing ? 'Save changes' : 'Add link'}
        </button>
      </div>
    </form>
  );
}

function LinkRow({ link, index, count, busy, onEdit, onToggle, onDelete, onMove }) {
  const isDoc = link.linkType === 'document';
  return (
    <li className={`bg-white rounded-2xl border shadow-sm px-4 py-3 flex flex-wrap items-center gap-3 ${link.enabled ? 'border-gray-100' : 'border-gray-200 opacity-75'}`}>
      <div className="w-9 h-9 rounded-xl bg-saffron-50 flex items-center justify-center shrink-0">
        {isDoc ? <FileText size={16} className="text-saffron-500" /> : <Link2 size={16} className="text-saffron-500" />}
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 break-words">{link.label}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{isDoc ? 'Document' : 'URL'}</span>
          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${link.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {link.enabled ? 'Shown' : 'Hidden'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate"
          title={isDoc ? link.document?.originalName || '' : link.url}>
          {isDoc ? `${link.document?.originalName || ''}${link.document?.size ? ` · ${formatFileSize(link.document.size)}` : ''}` : link.url}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label={`Move ${link.label} up`} title="Move up"
          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"><ArrowUp size={13} /></button>
        <button type="button" disabled={busy || index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move ${link.label} down`} title="Move down"
          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"><ArrowDown size={13} /></button>
        <a href={isDoc ? link.publicPath : link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.label}`} title={isDoc ? 'Preview document' : 'Open URL'}
          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><ExternalLink size={13} /></a>
        <button type="button" disabled={busy} onClick={() => onToggle(link)} aria-label={link.enabled ? `Hide ${link.label}` : `Show ${link.label}`} title={link.enabled ? 'Hide from footer' : 'Show in footer'}
          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">{link.enabled ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        <button type="button" disabled={busy} onClick={() => onEdit(link)} aria-label={`Edit ${link.label}`} title="Edit"
          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"><Pencil size={13} /></button>
        <button type="button" disabled={busy} onClick={() => onDelete(link)} aria-label={`Delete ${link.label}`} title="Delete"
          className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"><Trash2 size={13} /></button>
      </div>
    </li>
  );
}

/** System Configuration → Frontend → Custom Footer Links. */
export default function CustomFooterLinksSection() {
  const { reload: reloadPublicSettings } = useSettings();
  const [links, setLinks] = useState([]);
  const [max, setMax] = useState(20);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | link
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get('/admin/footer-links');
      setLinks(data.links || []);
      setMax(data.max || 20);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Refresh the live footer for this session too (other visitors pick the change up on their next page load).
  const afterChange = useCallback(async () => {
    await load();
    if (typeof reloadPublicSettings === 'function') reloadPublicSettings();
  }, [load, reloadPublicSettings]);

  const run = async (fn, okMsg, failMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await afterChange();
    } catch (err) {
      toast.error(messageOf(err, failMsg));
    } finally {
      setBusy(false);
    }
  };

  const onToggle = (link) => run(
    () => API.patch(`/admin/footer-links/${link.id}`, { enabled: !link.enabled }),
    link.enabled ? `“${link.label}” hidden from the footer` : `“${link.label}” is now shown in the footer`,
    'Could not update the link'
  );
  const onDelete = (link) => {
    const what = link.linkType === 'document' ? ' Its uploaded file will also be removed.' : '';
    if (!window.confirm(`Delete the footer link “${link.label}”?${what} This cannot be undone.`)) return;
    run(() => API.delete(`/admin/footer-links/${link.id}`), 'Footer link deleted', 'Could not delete the link');
  };
  const onMove = (index, delta) => {
    const ids = links.map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => API.put('/admin/footer-links/order', { ids }), null, 'Could not reorder the links');
  };

  const atLimit = links.length >= max;

  return (
    <section className="space-y-4" aria-labelledby="custom-footer-links-heading">
      <div className="flex items-start justify-between gap-3 px-1 flex-wrap">
        <div>
          <h3 id="custom-footer-links-heading" className="text-base font-bold text-gray-900">Custom Footer Links</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Add extra links to the website footer — either a web address or an uploaded document. They appear in the footer’s
            Company column, after the fixed legal documents above. Changes apply immediately — no rebuild needed.
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Reserved names (managed above): {RESERVED_NAMES}.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={load} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"><RefreshCw size={13} /> Refresh</button>
          <button type="button" onClick={() => setEditing('new')} disabled={atLimit || editing === 'new'}
            title={atLimit ? `Limit of ${max} links reached` : undefined}
            className="flex items-center gap-1.5 text-xs bg-saffron-500 text-white px-3 py-2 rounded-lg hover:bg-saffron-600 disabled:opacity-50">
            <Plus size={13} /> Add Footer Link
          </button>
        </div>
      </div>

      {editing && (
        <LinkForm
          key={editing === 'new' ? 'new' : editing.id}
          existing={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await afterChange(); }}
        />
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading footer links…</div>
      ) : loadError ? (
        <div role="alert" className="text-center py-6 text-sm text-red-600">
          Could not load footer links. <button type="button" onClick={load} className="underline font-medium">Try again</button>
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
          No custom footer links yet. Use “Add Footer Link” to create one.
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((link, i) => (
            <LinkRow key={link.id} link={link} index={i} count={links.length} busy={busy}
              onEdit={setEditing} onToggle={onToggle} onDelete={onDelete} onMove={onMove} />
          ))}
        </ul>
      )}
    </section>
  );
}
