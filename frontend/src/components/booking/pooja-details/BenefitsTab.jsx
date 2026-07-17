import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function BenefitsTab({ pooja }) {
  const benefits = pooja.benefits || [];
  const hasContent = !!pooja.benefitsContent;

  if (benefits.length === 0 && !hasContent) {
    return <p className="text-sm text-gray-400">Benefits for this ceremony haven't been added yet.</p>;
  }

  return (
    <div>
      <h3 className="font-bold text-gray-900 text-xl mb-4" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
        Benefits of {pooja.name}
      </h3>
      {benefits.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor:'var(--t-border)' }}>
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle size={15} className="text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">{b}</span>
            </div>
          ))}
        </div>
      )}
      {hasContent && (
        <div
          className={`rte-content pooja-content text-gray-600 text-sm leading-relaxed ${benefits.length > 0 ? 'mt-6' : ''}`}
          dangerouslySetInnerHTML={{ __html: pooja.benefitsContent }}
        />
      )}
    </div>
  );
}
