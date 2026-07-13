import React from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { formatDuration } from '../../../utils/durationFormatter';
import { formatINR } from '../../../utils/priceEngine';
import { getImageUrl } from '../../../config';

export default function SimilarPoojasSidebar({ poojas }) {
  if (!poojas || poojas.length === 0) return null;
  return (
    <div className="card rounded-2xl p-4">
      <h3 className="font-bold text-gray-900 text-sm mb-3">Similar Poojas</h3>
      <div className="space-y-3">
        {poojas.map(p => (
          <Link
            key={p._id}
            to={`/book/${p.slug}`}
            className="flex items-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-orange-50 shrink-0">
              {p.image
                ? <img src={getImageUrl(p.image)} alt={p.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-lg">🪔</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-orange-600 transition-colors">{p.name}</p>
              {formatDuration(p) && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={10} /> {formatDuration(p)}</p>
              )}
            </div>
            <span className="text-xs font-bold text-orange-600 shrink-0">{formatINR(p.salePrice || p.price)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
