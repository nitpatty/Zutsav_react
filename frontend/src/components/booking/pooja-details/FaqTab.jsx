import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FaqTab({ pooja }) {
  const faqs = pooja.faqs || [];
  const [openIdx, setOpenIdx] = useState(null);

  if (faqs.length === 0) {
    return <p className="text-sm text-gray-400">No FAQs have been added for this pooja yet.</p>;
  }

  return (
    <div>
      <h3 className="font-bold text-gray-900 text-xl mb-4" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
        Frequently Asked Questions
      </h3>
      <div className="space-y-2">
        {faqs.map((f, i) => (
          <div key={i} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
            <button
              type="button"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
            >
              {f.question}
              <ChevronDown size={16} className={`shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} />
            </button>
            {openIdx === i && (
              <div
                className="rte-content pooja-content px-4 pb-4 text-sm text-gray-600 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: f.answer }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
