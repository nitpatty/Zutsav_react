import React from 'react';
import { CheckCircle, X } from 'lucide-react';

export default function KitItemsModal({ kit, onClose }) {
  const items = kit?.items?.map(it => it.productId?.name).filter(Boolean) || [];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--t-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor:'var(--t-border)', background:'var(--t-surface)' }}>
          <div>
            <h3 className="font-bold text-gray-900 text-base">{kit?.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{items.length} items included</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <X size={14} className="text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 max-h-72 overflow-y-auto">
          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((name, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle size={12} className="text-green-600" />
                  </div>
                  <span className="text-sm text-gray-700">{name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">Item list not available</p>
          )}
        </div>

        <div className="px-6 pb-5">
          <p className="text-[11px] text-gray-400 text-center">
            All items are sourced fresh and delivered to your address before the ceremony.
          </p>
        </div>
      </div>
    </div>
  );
}
