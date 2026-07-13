import React from 'react';
import { formatINR } from '../../utils/priceEngine';

export default function PriceLine({ label, amount, muted = false, highlight = false, sub }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-700'}`}>{label}</span>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-medium shrink-0 ${highlight ? 'text-orange-600 font-bold' : muted ? 'text-gray-600' : 'text-gray-800'}`}>
        {formatINR(amount)}
      </span>
    </div>
  );
}
