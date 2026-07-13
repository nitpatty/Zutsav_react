import React, { useEffect, useState } from 'react';
import { X, Mail, Phone, Building2, Badge, Calendar, History } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';
import { getImageUrl, handleImageError } from '../../../config';
import SessionsPanel from './SessionsPanel';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const EVENT_LABELS = {
  login_success: 'Login',
  login_failed:  'Failed login',
  logout:        'Logout',
  force_logout:  'Force logout',
};

export default function AdminDetailDrawer({ adminId, onClose, onChanged }) {
  const [admin, setAdmin] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      API.get(`/admin-management/admins/${adminId}`),
      API.get(`/admin-management/admins/${adminId}/login-history`, { params: { limit: 10 } }),
    ])
      .then(([detailRes, historyRes]) => {
        setAdmin(detailRes.data.admin);
        setHistory(historyRes.data.history || []);
      })
      .catch(() => toast.error('Failed to load admin details'))
      .finally(() => setLoading(false));
  }, [adminId]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-800">Admin Profile</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        {loading || !admin ? (
          <p className="text-sm text-gray-400 px-6 py-10 text-center">Loading…</p>
        ) : (
          <div className="px-6 py-5 space-y-6">
            <div className="flex items-center gap-4">
              {admin.profilePhoto ? (
                <img src={getImageUrl(admin.profilePhoto)} alt="" onError={handleImageError} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-xl font-semibold text-gray-500">
                  {admin.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-800">{admin.name}</p>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium inline-block mt-1 ${admin.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {admin.isActive ? 'Active' : 'Suspended'}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {admin.email && <p className="flex items-center gap-2 text-gray-600"><Mail size={14} className="text-gray-400" /> {admin.email}</p>}
              <p className="flex items-center gap-2 text-gray-600"><Phone size={14} className="text-gray-400" /> {admin.phone}</p>
              {admin.department && <p className="flex items-center gap-2 text-gray-600"><Building2 size={14} className="text-gray-400" /> {admin.department}{admin.designation ? ` · ${admin.designation}` : ''}</p>}
              {admin.employeeId && <p className="flex items-center gap-2 text-gray-600"><Badge size={14} className="text-gray-400" /> {admin.employeeId}</p>}
              <p className="flex items-center gap-2 text-gray-600"><Calendar size={14} className="text-gray-400" /> Created {formatDate(admin.createdAt)}{admin.createdBy?.name ? ` by ${admin.createdBy.name}` : ''}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Active Sessions</h3>
              <SessionsPanel adminId={adminId} onChanged={onChanged} />
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <History size={13} /> Login History
              </h3>
              {!history.length ? (
                <p className="text-sm text-gray-400">No login history yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h._id} className="text-xs flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className={h.event === 'login_failed' ? 'text-red-600 font-medium' : 'text-gray-600 font-medium'}>
                        {EVENT_LABELS[h.event] || h.event}
                      </span>
                      <span className="text-gray-400">{formatDate(h.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
