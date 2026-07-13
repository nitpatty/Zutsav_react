import React, { useCallback, useEffect, useState } from 'react';
import { Search, Plus, Pencil, Ban, CheckCircle2, KeyRound, Trash2, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';
import { getImageUrl, handleImageError } from '../../../config';
import { ZutsavLoaderInline } from '../../shared/ZutsavLoader';
import AdminFormModal from './AdminFormModal';
import AdminDetailDrawer from './AdminDetailDrawer';
import ResetPasswordModal from './ResetPasswordModal';

function formatDate(dateStr) {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminListPanel() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const [modal, setModal] = useState(null);       // { mode: 'create'|'edit', admin }
  const [detailId, setDetailId] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    API.get('/admin-management/admins', { params: { search, status: status === 'all' ? undefined : status, page, limit: 20 } })
      .then(({ data }) => { setAdmins(data.admins); setTotalPages(data.totalPages || 1); })
      .catch(() => toast.error('Failed to load admins'))
      .finally(() => setLoading(false));
  }, [search, status, page]);

  useEffect(() => { load(); }, [load]);

  const suspend = async (a) => {
    if (!window.confirm(`Suspend ${a.name}? They will be logged out immediately.`)) return;
    setBusyId(a._id);
    try {
      await API.patch(`/admin-management/admins/${a._id}/suspend`);
      toast.success('Admin suspended');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to suspend'); }
    finally { setBusyId(null); }
  };

  const activate = async (a) => {
    setBusyId(a._id);
    try {
      await API.patch(`/admin-management/admins/${a._id}/activate`);
      toast.success('Admin activated');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to activate'); }
    finally { setBusyId(null); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.name}'s account? This is a soft delete — the record and audit history are preserved.`)) return;
    setBusyId(a._id);
    try {
      await API.delete(`/admin-management/admins/${a._id}`);
      toast.success('Admin deleted');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9 text-sm w-64"
              placeholder="Search name, email, phone, department…"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
          <select className="input text-sm w-auto" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <button type="button" onClick={() => setModal({ mode: 'create' })} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
          <Plus size={14} /> Create Admin
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <ZutsavLoaderInline />
        ) : !admins.length ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">No admin accounts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-6 py-3 font-medium">Admin</th>
                  <th className="px-6 py-3 font-medium">Department</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Last Login</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((a) => (
                  <tr key={a._id} className="hover:bg-gray-50/60">
                    <td className="px-6 py-3">
                      <button type="button" onClick={() => setDetailId(a._id)} className="flex items-center gap-3 text-left">
                        {a.profilePhoto ? (
                          <img src={getImageUrl(a.profilePhoto)} alt="" onError={handleImageError} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0">
                            {a.name?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <span>
                          <span className="block font-medium text-gray-800 flex items-center gap-1">{a.name} <ExternalLink size={11} className="text-gray-300" /></span>
                          <span className="block text-xs text-gray-400">{a.email || a.phone}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{a.department || '—'}{a.designation ? ` · ${a.designation}` : ''}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${a.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {a.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{formatDate(a.lastLoginAt)}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" title="Edit" onClick={() => setModal({ mode: 'edit', admin: a })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" disabled={busyId === a._id}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" title="Reset password" onClick={() => setResetTarget(a)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" disabled={busyId === a._id}>
                          <KeyRound size={14} />
                        </button>
                        {a.isActive ? (
                          <button type="button" title="Suspend" onClick={() => suspend(a)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" disabled={busyId === a._id}>
                            <Ban size={14} />
                          </button>
                        ) : (
                          <button type="button" title="Activate" onClick={() => activate(a)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" disabled={busyId === a._id}>
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        <button type="button" title="Delete" onClick={() => remove(a)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" disabled={busyId === a._id}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-400">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <AdminFormModal
          mode={modal.mode}
          admin={modal.admin}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
      {detailId && (
        <AdminDetailDrawer
          adminId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          admin={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
