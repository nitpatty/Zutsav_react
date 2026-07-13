import React, { useEffect, useState } from 'react';
import { Monitor, LogOut, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SessionsPanel({ adminId, onChanged }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    API.get(`/admin-management/admins/${adminId}/sessions`)
      .then(({ data }) => setSessions(data.sessions || []))
      .catch(() => toast.error('Failed to load sessions'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [adminId]);

  const revoke = async (sid) => {
    setBusy(true);
    try {
      await API.post(`/admin-management/admins/${adminId}/sessions/${sid}/revoke`);
      toast.success('Session revoked');
      load();
      onChanged?.();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to revoke session'); }
    finally { setBusy(false); }
  };

  const forceLogoutAll = async () => {
    if (!window.confirm('Force logout this admin from every active session?')) return;
    setBusy(true);
    try {
      const { data } = await API.post(`/admin-management/admins/${adminId}/force-logout`);
      toast.success(data.message);
      load();
      onChanged?.();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to force logout'); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="text-sm text-gray-400 py-4">Loading sessions…</p>;

  const active = sessions.filter((s) => s.isActive);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{active.length} active session{active.length !== 1 ? 's' : ''}</p>
        {active.length > 0 && (
          <button type="button" onClick={forceLogoutAll} disabled={busy} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 disabled:opacity-50">
            <ShieldOff size={13} /> Force logout all
          </button>
        )}
      </div>

      {!sessions.length ? (
        <p className="text-sm text-gray-400 py-2">No session history yet.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.sid} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <Monitor size={15} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-xs">
                <p className="text-gray-700 font-medium truncate">{s.browser || 'Unknown browser'} · {s.os || 'Unknown OS'}</p>
                <p className="text-gray-400">{s.ipAddress || 'Unknown IP'} · Since {formatDate(s.createdAt)}</p>
              </div>
              {s.isActive ? (
                <button type="button" onClick={() => revoke(s.sid)} disabled={busy} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 flex-shrink-0 disabled:opacity-50">
                  <LogOut size={13} /> Revoke
                </button>
              ) : (
                <span className="text-xs text-gray-400 flex-shrink-0">{s.revokedReason || 'Ended'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
