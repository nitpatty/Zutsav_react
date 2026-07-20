import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getImageUrl as IMG } from '../../config';
import { formatDuration } from '../../utils/durationFormatter';
import { EyebrowTag, useInView } from './shared';

export default function PopularPujasSection({ poojas, loading }) {
  const { t } = useTranslation();
  const [poojaRef, poojaInView] = useInView();

  if (!loading && poojas.length === 0) return null;

  return (
    <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
      <div ref={poojaRef} className="container-pad">
        <div className="flex items-end justify-between mb-14 flex-wrap gap-4">
          <div>
            <EyebrowTag>{t('home.mostBooked', 'Most Booked')}</EyebrowTag>
            <h2 className="section-title">{t('home.popularPoojas', 'Popular Poojas')}</h2>
          </div>
          <Link to="/poojas" className="text-saffron-600 font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all font-sans">
            {t('home.viewAll', 'View All')} <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-96 skeleton rounded-3xl" />)
            : poojas.map((p, i) => (
                <div key={p._id}
                  className={`group bg-white rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-premium hover:-translate-y-2 ${poojaInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                  style={{ transitionDelay: `${i * 80}ms`, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

                  <div className="relative h-56 bg-gradient-to-br from-saffron-50 to-orange-50 overflow-hidden">
                    {IMG(p.image)
                      ? <img src={IMG(p.image)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-6xl">🪔</div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
                    <div className="absolute top-3 left-3 flex gap-2">
                      {p.isFeatured && (
                        <span className="text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm font-sans"
                          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C85A)' }}>
                          ✦ {t('home.featured', 'Featured')}
                        </span>
                      )}
                      {formatDuration(p) && (
                        <span className="bg-black/40 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full font-sans backdrop-blur-sm">
                          ⏱ {formatDuration(p)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-6">
                    <h3 className="font-display font-bold text-gray-900 text-xl leading-snug mb-2" style={{ letterSpacing: '-0.01em' }}>
                      {p.name}
                    </h3>
                    <p className="text-sm text-gray-400 line-clamp-2 mb-5 font-sans leading-relaxed">{p.shortDesc}</p>

                    <div className="h-px bg-gray-100 mb-5" />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 font-sans mb-0.5">{t('home.startingFrom', 'Starting from')}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-2xl font-bold text-saffron-600">
                            ₹{(p.salePrice || p.price).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                          {p.mrp && p.mrp > (p.salePrice || p.price) && (
                            <span className="text-sm text-gray-300 line-through font-sans">₹{p.mrp.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                          )}
                        </div>
                      </div>
                      <Link to={`/book/${p.slug}`} onClick={(e) => e.stopPropagation()}
                        className="btn-primary text-sm px-6 py-2.5 rounded-2xl shadow-glow-saffron">
                        {t('home.bookNow', 'Book Now')}
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
