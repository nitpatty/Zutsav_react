import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Generic confirmation dialog — mirrors the ad-hoc "Delete Pandit Account"
// modal pattern already used in AdminDashboard.jsx, extracted so new modules
// (starting with Temple Directory) don't need window.confirm().
export default function ConfirmModal({
  open, title = 'Are you sure?', message, itemName, note,
  confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true,
  loading = false, onConfirm, onCancel,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${danger ? 'bg-red-100' : 'bg-saffron-100'}`}>
          <AlertTriangle size={22} className={danger ? 'text-red-600' : 'text-saffron-600'} />
        </div>
        <h3 className="font-bold text-gray-800 text-lg mb-1">{title}</h3>
        {message && <p className="text-sm text-gray-500 mb-1">{message}</p>}
        {itemName && <p className="text-sm font-semibold text-gray-800 mb-4">"{itemName}"</p>}
        {note && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-5">{note}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel} disabled={loading} className="btn-outline flex-1 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-saffron-500 hover:bg-saffron-600'
            }`}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
