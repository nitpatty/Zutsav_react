import React from 'react';

export default function StepHeader({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background:'linear-gradient(135deg,var(--t-primary),var(--t-primary-light))' }}>
        {Icon && <Icon size={20} className="text-white" />}
      </div>
      <div>
        <h2 className="font-bold text-gray-900 text-xl" style={{ fontFamily:"'Cormorant Garamond',serif", letterSpacing:'-0.01em' }}>{title}</h2>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </div>
  );
}
