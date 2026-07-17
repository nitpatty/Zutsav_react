import React from 'react';

const STATUS_META = {
  draft:     { label: 'Draft',     bg: '#FFFBEB', border: '#FDE68A', pill: 'bg-amber-500',  text: 'This temple is saved as draft and is not visible on the site.' },
  published: { label: 'Published', bg: '#F0FDF4', border: '#BBF7D0', pill: 'bg-green-500',  text: 'This temple is live and visible in the public directory.' },
  hidden:    { label: 'Hidden',    bg: '#EFF6FF', border: '#BFDBFE', pill: 'bg-blue-500',   text: 'This temple is saved but temporarily hidden from the public directory.' },
  archived:  { label: 'Archived',  bg: '#F3F4F6', border: '#E5E7EB', pill: 'bg-gray-400',   text: 'This temple is archived.' },
};
const ORDER = ['draft', 'published', 'hidden', 'archived'];

// Sidebar status control for the Temple form — 4-state equivalent of
// Marketplace's boolean ProductStatusCard.
export default function TempleStatusCard({ status, onChange, disabled }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <div className="rounded-2xl p-4" style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Temple Status</p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold text-white ${meta.pill}`}>{meta.label}</span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed mb-3">{meta.text}</p>
      {onChange && (
        <div className="grid grid-cols-2 gap-1.5">
          {ORDER.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onChange(s)}
              className={`text-[11px] font-semibold py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                status === s ? 'bg-white border-gray-800 text-gray-800' : 'border-transparent bg-white/60 text-gray-500 hover:bg-white'
              }`}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
