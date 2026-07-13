import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';
import { ZutsavLoaderInline } from '../../shared/ZutsavLoader';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SEVERITY_STYLES = {
  info:     'bg-gray-100 text-gray-600',
  warning:  'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-600',
};

export default function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    API.get('/admin-management/audit-logs', { params: { module: module || undefined, page, limit: 25 } })
      .then(({ data }) => { setLogs(data.logs); setTotalPages(data.totalPages || 1); })
      .catch(() => toast.error('Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, [module, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <p className="text-xs text-gray-400">Showing the last 30 days by default. Every record here is immutable.</p>
        <select className="input text-sm w-auto" value={module} onChange={(e) => { setPage(1); setModule(e.target.value); }}>
          <option value="">All Modules</option>
          <option value="auth">Auth</option>
          <option value="admin_management">Admin Management</option>
          <option value="marketplace">Marketplace</option>
          <option value="booking">Booking</option>
          <option value="payment">Payment</option>
          <option value="invoice">Invoice</option>
          <option value="pandit">Pandit</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <ZutsavLoaderInline />
        ) : !logs.length ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">No audit log entries in this window.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {logs.map((log) => {
              const expanded = expandedId === log._id;
              return (
                <li key={log._id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : log._id)}
                    className="w-full px-6 py-3.5 flex items-center gap-3 text-left hover:bg-gray-50/60"
                  >
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${SEVERITY_STYLES[log.severity] || SEVERITY_STYLES.info}`}>
                      {log.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        <span className="font-medium">{log.performedByName}</span> — {log.action.replace(/_/g, ' ')}
                        {log.targetName ? <span className="text-gray-500"> · {log.targetName}</span> : ''}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(log.createdAt)} · {log.module || '—'} · {log.ipAddress || 'unknown IP'}</p>
                    </div>
                    {expanded ? <ChevronUp size={15} className="text-gray-300 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-300 flex-shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="px-6 pb-4 -mt-1 text-xs text-gray-600 space-y-2">
                      <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4">
                        <div><span className="text-gray-400">Admin ID:</span> {log.performedBy}</div>
                        <div><span className="text-gray-400">Role:</span> {log.performedByRole}</div>
                        <div><span className="text-gray-400">Browser:</span> {log.browser || '—'}</div>
                        <div><span className="text-gray-400">OS:</span> {log.os || '—'}</div>
                        <div><span className="text-gray-400">Request ID:</span> <span className="font-mono">{log.requestId || '—'}</span></div>
                        <div><span className="text-gray-400">Session ID:</span> <span className="font-mono">{log.sessionId ? `${log.sessionId.slice(0, 8)}…` : '—'}</span></div>
                      </div>
                      {(log.oldValues || log.newValues) && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-red-50/60 rounded-xl p-3">
                            <p className="text-red-600 font-medium mb-1">Before</p>
                            <pre className="whitespace-pre-wrap break-words text-red-700">{log.oldValues ? JSON.stringify(log.oldValues, null, 2) : '—'}</pre>
                          </div>
                          <div className="bg-emerald-50/60 rounded-xl p-3">
                            <p className="text-emerald-700 font-medium mb-1">After</p>
                            <pre className="whitespace-pre-wrap break-words text-emerald-800">{log.newValues ? JSON.stringify(log.newValues, null, 2) : '—'}</pre>
                          </div>
                        </div>
                      )}
                      {log.note && <p><span className="text-gray-400">Note:</span> {log.note}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
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
    </div>
  );
}
