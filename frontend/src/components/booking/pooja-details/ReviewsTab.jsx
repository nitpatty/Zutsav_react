import React from 'react';
import { Star } from 'lucide-react';

export default function ReviewsTab({ reviewsData, reviewsLoading }) {
  const { reviews = [], summary = { averageRating: 0, totalReviews: 0 } } = reviewsData || {};

  if (reviewsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
    );
  }

  if (reviews.length === 0) {
    return <p className="text-sm text-gray-400">No reviews yet — be the first to book and rate this ceremony.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-4xl font-bold text-gray-900" style={{ fontFamily:"'Cormorant Garamond',serif" }}>{summary.averageRating}</span>
        <div>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={14} className={i < Math.round(summary.averageRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{summary.totalReviews} reviews</p>
        </div>
      </div>

      <div className="space-y-3">
        {reviews.map((r, i) => (
          <div key={i} className="rounded-2xl border p-4" style={{ borderColor:'var(--t-border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">{r.userName}</span>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, si) => (
                  <Star key={si} size={11} className={si < r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
                ))}
              </div>
            </div>
            {r.review && <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{r.review}</p>}
            {r.ratingDate && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                {new Date(r.ratingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
