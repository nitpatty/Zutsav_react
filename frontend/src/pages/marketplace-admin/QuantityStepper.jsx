import React from 'react';
import { Minus, Plus } from 'lucide-react';

// [-] N [+] control, minimum 1.
export default function QuantityStepper({ value, onChange }) {
  const qty = Number(value) || 1;
  const dec = () => onChange(Math.max(1, qty - 1));
  const inc = () => onChange(qty + 1);

  return (
    <div className="flex items-center rounded-xl border overflow-hidden shrink-0" style={{ borderColor: 'var(--t-border)' }}>
      <button type="button" onClick={dec} disabled={qty <= 1}
        className="w-8 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
        <Minus size={13} />
      </button>
      <span className="w-8 text-center text-sm font-semibold text-gray-700">{qty}</span>
      <button type="button" onClick={inc}
        className="w-8 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
        <Plus size={13} />
      </button>
    </div>
  );
}
