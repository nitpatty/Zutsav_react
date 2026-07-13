import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import { getImageUrl as IMG } from '../../config';
import { EyebrowTag, useInView } from './shared';

const FALLBACK_GRADIENTS = [
  ['from-orange-100', 'to-amber-50'],
  ['from-saffron-100', 'to-yellow-50'],
  ['from-rose-100', 'to-pink-50'],
  ['from-sky-100', 'to-blue-50'],
  ['from-emerald-100', 'to-teal-50'],
  ['from-violet-100', 'to-purple-50'],
];

export default function TempleExplorerSection({ temples, loading }) {
  const [templeRef, templeInView] = useInView();

  if (!loading && temples.length === 0) return null;

  return (
    <section className="section-pad bg-white">
      <div ref={templeRef} className="container-pad">
        <div className="text-center mb-14">
          <EyebrowTag>Sacred Places</EyebrowTag>
          <h2 className="section-title">Temple Explorer</h2>
          <p className="section-subtitle mx-auto text-center">
            Explore India's most revered temples and plan your sacred journey
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-80 skeleton rounded-3xl" />)
            : temples.map((t, i) => {
                const [gFrom, gTo] = FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length];
                const image = t.images?.[0];
                return (
                  <div key={t._id}
                    className={`group rounded-3xl overflow-hidden border border-gray-100 hover:border-saffron-200 hover:shadow-premium transition-all duration-500 hover:-translate-y-2 ${templeInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                    style={{ transitionDelay: `${i * 80}ms` }}>
                    <div className={`h-40 bg-gradient-to-br ${gFrom} ${gTo} flex items-center justify-center relative overflow-hidden`}>
                      {image ? (
                        <img src={IMG(image)} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                      ) : (
                        <>
                          <span className="text-7xl opacity-20 absolute">🛕</span>
                          <span className="text-5xl relative z-10">🛕</span>
                        </>
                      )}
                    </div>
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-display font-bold text-xl text-gray-900" style={{ letterSpacing: '-0.01em' }}>{t.name}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 mb-3">
                        <MapPin size={12} className="text-saffron-500 shrink-0" />
                        <p className="text-xs text-gray-400 font-sans">{t.city}, {t.state}</p>
                      </div>
                      <p className="text-sm text-gray-500 font-sans leading-relaxed mb-5 line-clamp-3">{t.description}</p>
                      <Link to="/temples"
                        className="inline-flex items-center gap-2 text-saffron-600 font-semibold text-sm hover:gap-3 transition-all font-sans group-hover:text-saffron-700">
                        Explore <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                );
              })}
        </div>

        <div className="text-center mt-12">
          <Link to="/temples" className="btn-outline inline-flex items-center gap-2">
            View All Temples <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
