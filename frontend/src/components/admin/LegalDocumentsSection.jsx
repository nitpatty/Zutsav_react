import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, UploadCloud, RefreshCw, Eye, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import { resolveViewUrl } from '../../utils/legalDocs';

const ALLOWED_EXT = /\.(pdf|doc|docx)$/i;
const MAX_SIZE = 10 * 1024 * 1024;

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function DocumentCard({ doc, onChanged }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const validate = (f) => {
    if (!ALLOWED_EXT.test(f.name)) return 'Only PDF, DOC, or DOCX files are allowed';
    if (f.size > MAX_SIZE) return 'File must be 10 MB or smaller';
    return null;
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validate(f);
    if (err) {
      toast.error(err);
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Choose a file first');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const method = doc.exists ? 'put' : 'post';
      await API[method](`/admin/documents/${doc.documentType}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`${doc.label} ${doc.exists ? 'replaced' : 'uploaded'}`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${doc.label}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await API.delete(`/admin/documents/${doc.documentType}`);
      toast.success(`${doc.label} deleted`);
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleView = () => {
    window.open(resolveViewUrl(doc), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-saffron-50 flex items-center justify-center shrink-0">
          <FileText size={16} className="text-saffron-500" />
        </div>
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">{doc.label}</h4>
          {doc.exists ? (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {doc.originalName} {doc.size ? `· ${formatSize(doc.size)}` : ''}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">No document uploaded</p>
          )}
        </div>
      </div>

      {doc.exists && (
        <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-gray-400 uppercase tracking-wide mb-0.5">Uploaded By</div>
            <div className="text-gray-700 font-medium truncate">{doc.uploadedByName || '—'}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-gray-400 uppercase tracking-wide mb-0.5">Updated</div>
            <div className="text-gray-700 font-medium">
              {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
          Choose File
          <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
        </label>
        {file && <span className="text-xs text-gray-500 truncate max-w-[140px]">{file.name}</span>}

        <button onClick={handleUpload} disabled={busy || !file}
          className="flex items-center gap-1.5 text-xs bg-saffron-500 text-white px-3 py-1.5 rounded-lg hover:bg-saffron-600 transition-colors disabled:opacity-50">
          <UploadCloud size={13} /> {busy ? 'Working…' : doc.exists ? 'Replace' : 'Upload'}
        </button>

        {doc.exists && (
          <>
            <button onClick={handleView}
              className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors">
              <Eye size={13} /> View
            </button>
            <button onClick={handleDelete} disabled={busy}
              className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              <Trash2 size={13} /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LegalDocumentsSection() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get('/documents');
      setDocuments(data.documents || []);
    } catch {
      toast.error('Failed to load legal documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading legal documents…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-gray-500">Upload, replace, view, or delete the legal documents shown across the website. Changes apply immediately — no rebuild needed.</p>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 shrink-0">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documents.map((doc) => (
          <DocumentCard key={doc.documentType} doc={doc} onChanged={load} />
        ))}
      </div>
    </div>
  );
}
