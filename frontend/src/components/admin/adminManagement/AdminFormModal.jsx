import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';

export default function AdminFormModal({ mode, admin, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    name: admin?.name || '',
    email: admin?.email || '',
    phone: admin?.phone || '',
    password: '',
    employeeId: admin?.employeeId || '',
    department: admin?.department || '',
    designation: admin?.designation || '',
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || (!isEdit && !form.password)) {
      toast.error('Name, phone, and password are required');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'password' && isEdit) return; // password not editable here — use Reset Password
        if (v) fd.append(k, v);
      });
      if (file) fd.append('profilePhoto', file);

      if (isEdit) {
        await API.patch(`/admin-management/admins/${admin._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Admin updated');
      } else {
        await API.post('/admin-management/admins', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Admin created');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save admin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{isEdit ? 'Edit Admin' : 'Create Admin'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={set('phone')} required />
            </div>
          </div>
          {!isEdit && (
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={form.password} onChange={set('password')} required minLength={6} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Employee ID <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className="input" value={form.employeeId} onChange={set('employeeId')} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" value={form.department} onChange={set('department')} />
            </div>
          </div>
          <div>
            <label className="label">Designation</label>
            <input className="input" value={form.designation} onChange={set('designation')} />
          </div>
          <div>
            <label className="label">Profile Photo</label>
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => setFile(e.target.files[0])} className="text-sm" />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-60">
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
