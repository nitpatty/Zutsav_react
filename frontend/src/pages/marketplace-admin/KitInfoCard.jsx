import React from 'react';
import { Sparkles } from 'lucide-react';

export default function KitInfoCard() {
  return (
    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#EFF6FF', border: '1px solid #DBEAFE' }}>
      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
        <Sparkles size={14} />
      </div>
      <div>
        <p className="text-xs font-bold text-blue-900 mb-0.5">This is a preview</p>
        <p className="text-xs text-blue-700 leading-relaxed">Actual details, pricing and availability will be visible on the marketplace after publishing.</p>
      </div>
    </div>
  );
}
