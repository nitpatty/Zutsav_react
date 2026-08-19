import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Edit3, Trash2, Calendar, X, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useTheme } from '../context/ThemeContext';

/* ── Relationship options ─────────────────────────────────────────────── */
const RELATIONSHIPS = [
  'Father', 'Mother', 'Son', 'Daughter', 'Spouse',
  'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Other',
];

/* ── Animation variants ──────────────────────────────────────────────── */
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

/* ── Empty state ─────────────────────────────────────────────────────── */
function EmptyState({ onAdd }) {
  return (
    <motion.div
      variants={fadeUp}
      className="flex flex-col items-center justify-center py-16 rounded-3xl border border-dashed"
      style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}
    >
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: 'var(--t-nav-active-bg)' }}
      >
        <Users size={36} style={{ color: 'var(--t-primary)', opacity: 0.6 }} />
      </div>
      <h3
        className="text-xl font-bold mb-2"
        style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}
      >
        No Family Members Yet
      </h3>
      <p className="text-sm mb-6 text-center max-w-xs" style={{ color: 'var(--t-muted)' }}>
        Add your family members to easily book poojas and services for them.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg"
        style={{ background: 'var(--t-primary)' }}
      >
        <Plus size={16} />
        Add Family Member
      </button>
    </motion.div>
  );
}

/* ── Family member card ──────────────────────────────────────────────── */
function FamilyMemberCard({ member, onEdit, onDelete }) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const formattedDob = member.dateOfBirth
    ? new Date(member.dateOfBirth).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <motion.div
      variants={fadeUp}
      layout
      className="flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 group"
      style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--t-primary)';
        e.currentTarget.style.boxShadow = '0 4px 20px var(--t-glow)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--t-border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
        style={{ background: 'var(--t-primary)' }}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--t-text)' }}>
          {member.name}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--t-muted)' }}>
          {member.relationship}
        </p>
        {formattedDob && (
          <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--t-muted)' }}>
            <Calendar size={10} />
            {formattedDob}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => onEdit(member)}
          className="p-2 rounded-xl transition-colors duration-200"
          style={{ color: 'var(--t-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--t-nav-active-bg)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Edit"
        >
          <Edit3 size={15} />
        </button>
        <button
          onClick={() => onDelete(member)}
          className="p-2 rounded-xl transition-colors duration-200 text-red-500"
          onMouseEnter={(e) => (e.currentTarget.style.background = '#FEE2E2')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Family member form modal ────────────────────────────────────────── */
function FamilyMemberForm({ member, onClose, onSave }) {
  const [form, setForm] = useState({
    name: member?.name || '',
    relationship: member?.relationship || '',
    dateOfBirth: member?.dateOfBirth
      ? new Date(member.dateOfBirth).toISOString().split('T')[0]
      : '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.relationship) errs.relationship = 'Relationship is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        relationship: form.relationship,
        dateOfBirth: form.dateOfBirth || null,
      };

      if (member?._id) {
        await API.patch(`/users/family-members/${member._id}`, payload);
      } else {
        await API.post('/users/family-members', payload);
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save family member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md my-auto rounded-3xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--t-card)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: 'var(--t-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--t-nav-active-bg)' }}
            >
              <Users size={16} style={{ color: 'var(--t-primary)' }} />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--t-text)' }}>
                {member ? 'Edit Family Member' : 'Add Family Member'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--t-muted)' }}>
                {member ? 'Update member details' : 'Add a new family member'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ color: 'var(--t-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--t-nav-active-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="label">Full Name</label>
            <input
              className="input"
              placeholder="Enter full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.name}
              </p>
            )}
          </div>

          {/* Relationship */}
          <div>
            <label className="label">Relationship</label>
            <select
              className="input"
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            >
              <option value="">Select relationship</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.relationship && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.relationship}
              </p>
            )}
          </div>

          {/* Date of Birth */}
          <div>
            <label className="label">Date of Birth (optional)</label>
            <input
              type="date"
              className="input"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--t-primary)' }}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Saving...
                </span>
              ) : member ? (
                'Update Member'
              ) : (
                'Add Member'
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ── Delete confirmation modal ───────────────────────────────────────── */
function DeleteConfirmModal({ member, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await API.delete(`/users/family-members/${member._id}`);
      onConfirm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete family member');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--t-card)' }}
      >
        <div className="p-6 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={24} className="text-red-600" />
          </div>
          <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--t-text)' }}>
            Delete Family Member?
          </h3>
          <p className="text-sm mb-1" style={{ color: 'var(--t-muted)' }}>
            Are you sure you want to remove
          </p>
          <p className="font-semibold text-sm mb-4" style={{ color: 'var(--t-text)' }}>
            {member.name} ({member.relationship})?
          </p>
          <p className="text-xs mb-6" style={{ color: 'var(--t-muted)' }}>
            This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn-outline flex-1"
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Main Family Members page ────────────────────────────────────────── */
export default function FamilyMembers() {
  const { currentTheme } = useTheme();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [deletingMember, setDeletingMember] = useState(null);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await API.get('/users/family-members');
      setMembers(data.familyMembers || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load family members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSave = () => {
    setShowForm(false);
    setEditingMember(null);
    fetchMembers();
    toast.success(editingMember ? 'Family member updated!' : 'Family member added!');
  };

  const handleDelete = () => {
    setDeletingMember(null);
    fetchMembers();
    toast.success('Family member removed!');
  };

  const handleEdit = (member) => {
    setEditingMember(member);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen py-10">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4"
        >
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}
            >
              Family Members
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--t-muted)' }}>
              Manage your family members for pooja bookings and spiritual services.
            </p>
          </div>
          {members.length > 0 && (
            <button
              onClick={() => {
                setEditingMember(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg flex-shrink-0"
              style={{ background: 'var(--t-primary)' }}
            >
              <Plus size={16} />
              Add Member
            </button>
          )}
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="flex flex-col items-center justify-center py-12 rounded-2xl border"
            style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}
          >
            <AlertCircle size={32} className="mb-3 text-red-400" />
            <p className="text-sm font-medium" style={{ color: 'var(--t-muted)' }}>
              {error}
            </p>
            <button
              onClick={fetchMembers}
              className="mt-3 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              style={{ background: 'var(--t-nav-active-bg)', color: 'var(--t-primary)' }}
            >
              Try Again
            </button>
          </motion.div>
        ) : members.length === 0 ? (
          <EmptyState onAdd={() => { setEditingMember(null); setShowForm(true); }} />
        ) : (
          <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-3">
            {members.map((member) => (
              <FamilyMemberCard
                key={member._id}
                member={member}
                onEdit={handleEdit}
                onDelete={setDeletingMember}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showForm && (
          <FamilyMemberForm
            member={editingMember}
            onClose={() => { setShowForm(false); setEditingMember(null); }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingMember && (
          <DeleteConfirmModal
            member={deletingMember}
            onClose={() => setDeletingMember(null)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
