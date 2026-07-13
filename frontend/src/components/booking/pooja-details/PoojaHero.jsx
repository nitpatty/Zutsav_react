import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clock, Home, BadgeCheck, Star } from 'lucide-react';
import { formatDuration } from '../../../utils/durationFormatter';
import { getImageUrl } from '../../../config';

export default function PoojaHero({ pooja, reviewsSummary }) {
  const category = pooja.categoryIds?.[0] || pooja.categoryId;
  const rating = reviewsSummary?.averageRating ?? pooja.rating ?? 0;
  const reviewCount = reviewsSummary?.totalReviews ?? 0;

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link to="/" className="flex items-center gap-1 hover:text-orange-600 transition-colors"><Home size={12} /> Home</Link>
        <ChevronRight size={12} className="text-gray-300" />
        <Link to="/poojas" className="hover:text-orange-600 transition-colors">Poojas</Link>
        {category?.name && (
          <>
            <ChevronRight size={12} className="text-gray-300" />
            <span className="text-gray-700 font-medium">{category.name}</span>
          </>
        )}
        <ChevronRight size={12} className="text-gray-300" />
        <span className="text-gray-700 font-medium truncate">{pooja.name}</span>
      </div>

      <div className="relative rounded-3xl overflow-hidden card-premium h-72 md:h-80">
        {pooja.image ? (
          <img src={getImageUrl(pooja.image)} alt={pooja.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-8xl" style={{ background:'linear-gradient(135deg,var(--t-primary),var(--t-primary-light))' }}>🪔</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <h1 className="font-bold text-white text-3xl md:text-4xl" style={{ fontFamily:"'Cormorant Garamond',serif" }}>{pooja.name}</h1>

          {rating > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={14} className={i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-white/30'} />
              ))}
              <span className="text-white font-semibold text-sm ml-1">{rating}</span>
              {reviewCount > 0 && <span className="text-white/70 text-sm">({reviewCount} Reviews)</span>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {formatDuration(pooja) && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Clock size={12} /> {formatDuration(pooja)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
