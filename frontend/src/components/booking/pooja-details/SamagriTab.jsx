import React from 'react';
import { Package } from 'lucide-react';

export default function SamagriTab({ pooja }) {
  const items = pooja.requirements || [];
  const hasNotes = !!pooja.samagriNotes;

  if (items.length === 0 && !hasNotes) {
    return <p className="text-sm text-gray-400">Samagri details for this ceremony will be shared by your pandit.</p>;
  }

  return (
    <div>
      <h3 className="font-bold text-gray-900 text-xl mb-4" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
        Samagri / Requirements
      </h3>
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((item, i) => (
            <div key={i} className="card-stat rounded-2xl p-4 text-center flex flex-col items-center gap-2">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background:'var(--t-surface)' }}>
                <Package size={18} className="text-orange-500" />
              </div>
              <span className="text-xs font-medium text-gray-700 leading-snug">{item}</span>
            </div>
          ))}
        </div>
      )}
      {hasNotes && (
        <div
          className={`rte-content pooja-content text-gray-600 text-sm leading-relaxed ${items.length > 0 ? 'mt-6' : ''}`}
          dangerouslySetInnerHTML={{ __html: pooja.samagriNotes }}
        />
      )}
    </div>
  );
}
