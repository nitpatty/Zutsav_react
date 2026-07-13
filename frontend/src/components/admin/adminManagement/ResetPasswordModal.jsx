import React, { useState } from 'react';
import { X, KeyRound, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';

export default function ResetPasswordModal({ admin, onClose }) {
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [copied, setCopied] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      const { data } = await API.post(`/admin-management/admins/${admin._id}/reset-password`);
      setTempPassword(data.tempPassword);
      toast.success('Password reset — all active sessions were revoked');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><KeyRound size={16} /> Reset Password</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!tempPassword ? (
            <>
              <p className="text-sm text-gray-600">
                Generate a new temporary password for <strong>{admin.name}</strong>. All of their active sessions will be revoked immediately.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="button" onClick={reset} disabled={busy} className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
                  {busy ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">Share this temporary password with {admin.name} securely. It will not be shown again.</p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 font-mono text-sm">
                <span className="flex-1 select-all">{tempPassword}</span>
                <button type="button" onClick={copy} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={onClose} className="btn-primary text-sm px-4 py-2">Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
