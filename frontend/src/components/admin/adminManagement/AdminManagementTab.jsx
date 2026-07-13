import React, { useState } from 'react';
import { ShieldAlert, LayoutDashboard, Users, ScrollText } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import AdminManagementDashboard from './AdminManagementDashboard';
import AdminListPanel from './AdminListPanel';
import AuditLogViewer from './AuditLogViewer';

const SECTIONS = [
  { key: 'overview', label: 'Dashboard',  icon: LayoutDashboard, Panel: AdminManagementDashboard },
  { key: 'admins',   label: 'Admins',     icon: Users,           Panel: AdminListPanel },
  { key: 'audit',    label: 'Audit Logs', icon: ScrollText,      Panel: AuditLogViewer },
];

export default function AdminManagementTab() {
  const { user } = useAuth();
  const [section, setSection] = useState('overview');

  // Defense-in-depth only — the backend's authorize('system_admin') is the
  // real authority. This just avoids rendering the module for a plain admin
  // who navigates here directly by URL.
  if (user?.role !== 'system_admin') {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert size={40} className="text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-700">Access Restricted</h2>
        <p className="text-sm text-gray-400 mt-1 max-w-sm">
          This module is restricted to System Administrators.
        </p>
      </div>
    );
  }

  const Active = SECTIONS.find((s) => s.key === section)?.Panel || AdminManagementDashboard;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(27,31,59,0.08)' }}>
          <ShieldAlert size={18} style={{ color: '#1B1F3B' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"' }}>Admin Management</h1>
          <p className="text-xs text-gray-400">Provision Admin accounts, review sessions, and audit every admin-tier action</p>
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="hidden md:flex flex-col gap-1 w-48 flex-shrink-0">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                section === key ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={section === key ? { background: '#1B1F3B' } : {}}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </aside>

        <div className="md:hidden w-full">
          <select className="input mb-4" value={section} onChange={(e) => setSection(e.target.value)}>
            {SECTIONS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <Active />
        </div>
      </div>
    </div>
  );
}
