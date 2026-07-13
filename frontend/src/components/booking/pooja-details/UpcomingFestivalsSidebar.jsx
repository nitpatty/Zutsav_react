import React from 'react';
import { Link } from 'react-router-dom';

export default function UpcomingFestivalsSidebar({ festivals }) {
  if (!festivals || festivals.length === 0) return null;
  return (
    <div className="card rounded-2xl p-4">
      <h3 className="font-bold text-gray-900 text-sm mb-3">Upcoming Festivals</h3>
      <div className="space-y-3">
        {festivals.map(f => (
          <Link key={f._id} to="/festivals" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ background:'var(--t-surface)' }}>
              🪔
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-orange-600 transition-colors">{f.name || 'Festival'}</p>
              <p className="text-[11px] text-gray-400">
                {new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <Link to="/festivals" className="block mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">
        View All Festivals →
      </Link>
    </div>
  );
}
