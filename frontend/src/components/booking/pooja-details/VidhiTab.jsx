import React from 'react';
import { Sparkles } from 'lucide-react';

// No dedicated "vidhi" (procedure) field exists on the Pooja model — this
// reuses the same real pooja.description content, framed as the ceremony
// procedure, rather than inventing step-by-step data that isn't in the backend.
export default function VidhiTab({ pooja }) {
  return (
    <div>
      <h3 className="font-bold text-gray-900 text-xl mb-4" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
        Puja Vidhi
      </h3>
      {pooja.description ? (
        <div className="flex items-start gap-3 card rounded-2xl p-4" style={{ background:'var(--t-surface)' }}>
          <Sparkles size={16} className="text-orange-500 shrink-0 mt-0.5" />
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{pooja.description}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Your assigned pandit will guide the complete ceremony procedure (vidhi) on the day of the puja.</p>
      )}
    </div>
  );
}
