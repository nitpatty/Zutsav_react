import React, { useState } from 'react';
import { Sparkles, Coins, Smile, TrendingUp, Package } from 'lucide-react';

const BENEFIT_ICONS = [Package, Coins, Smile, TrendingUp, Sparkles];
const DESC_LIMIT = 320;

export default function OverviewTab({ pooja }) {
  const [showFull, setShowFull] = useState(false);
  const descLong = (pooja.description || '').length > DESC_LIMIT;
  const visibleDesc = descLong && !showFull
    ? pooja.description.slice(0, DESC_LIMIT).trimEnd() + '…'
    : pooja.description;

  const quickBenefits = (pooja.benefits || []).slice(0, 4);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2">
        <h3 className="font-bold text-gray-900 text-xl mb-3" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
          About {pooja.name}
        </h3>
        {pooja.shortDesc && <p className="text-gray-600 text-sm leading-relaxed mb-3">{pooja.shortDesc}</p>}
        {pooja.description && (
          <>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{visibleDesc}</p>
            {descLong && (
              <button
                onClick={() => setShowFull(v => !v)}
                className="mt-2 text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors"
              >
                {showFull ? '▲ Show less' : '▼ Show more'}
              </button>
            )}
          </>
        )}
      </div>

      {quickBenefits.length > 0 && (
        <div className="card rounded-2xl p-4" style={{ background:'var(--t-surface)' }}>
          <div className="space-y-3">
            {quickBenefits.map((b, i) => {
              const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length];
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
                    <Icon size={16} className="text-orange-500" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{b}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
