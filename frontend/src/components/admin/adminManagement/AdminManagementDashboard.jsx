import React, { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, Radio, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';
import { getImageUrl } from '../../../config';
import { ZutsavLoaderInline } from '../../shared/ZutsavLoader';

const TILES = [
  { key: 'total',     label: 'Total Admins',     icon: Users,    color: '#1B1F3B' },
  { key: 'active',    label: 'Active',           icon: UserCheck, color: '#059669' },
  { key: 'suspended', label: 'Suspended',        icon: UserX,     color: '#DC2626' },
  { key: 'online',    label: 'Online Now',       icon: Radio,     color: '#2563EB' },
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminManagementDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/admin-management/dashboard')
      .then(({ data }) => setStats(data.stats))
      .catch(() => toast.error('Failed to load dashboard stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ZutsavLoaderInline />;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TILES.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${color}14` }}>
              <Icon size={16} style={{ color }} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats[key] ?? 0}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Clock size={15} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800">Recently Created</h2>
        </div>
        {!stats.recentlyCreated?.length ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">No admin accounts yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {stats.recentlyCreated.map((a) => (
              <li key={a._id} className="px-6 py-3 flex items-center gap-3">
                {a.profilePhoto ? (
                  <img src={getImageUrl(a.profilePhoto)} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
                    {a.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                  <p className="text-xs text-gray-400 truncate">{a.email || a.phone}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
