import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getImageUrl as IMG } from '../../config';
import { EyebrowTag, useInView } from './shared';

const CAT_GRADIENTS = [
  'from-amber-50 to-orange-50 border-orange-100 hover:border-orange-200',
  'from-rose-50 to-pink-50 border-rose-100 hover:border-rose-200',
  'from-violet-50 to-purple-50 border-violet-100 hover:border-violet-200',
  'from-emerald-50 to-teal-50 border-emerald-100 hover:border-emerald-200',
  'from-sky-50 to-blue-50 border-sky-100 hover:border-sky-200',
  'from-yellow-50 to-amber-50 border-yellow-100 hover:border-yellow-200',
];
const CAT_ICON_BG = [
  'bg-orange-100 text-orange-600',
  'bg-rose-100 text-rose-600',
  'bg-violet-100 text-violet-600',
  'bg-emerald-100 text-emerald-600',
  'bg-sky-100 text-sky-600',
  'bg-yellow-100 text-yellow-600',
];

export default function PujaCategoryGrid({ categories, loading }) {
  const [catRef, catInView] = useInView();

  return (
    <section className="section-pad bg-white">
      <div ref={catRef} className="container-pad">
        <div className="text-center mb-14">
          <EyebrowTag>Our Services</EyebrowTag>
          <h2 className="section-title">Browse by Category</h2>
          <p className="section-subtitle mx-auto text-center">
            From Gruhapravesh to Satyanarayan — find the perfect puja for every occasion
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 skeleton rounded-2xl" />)
            : categories.map((cat, i) => (
                <Link key={cat._id} to={`/poojas/${cat.slug}`}
                  className={`group flex flex-col items-center p-5 rounded-3xl bg-gradient-to-br ${CAT_GRADIENTS[i % CAT_GRADIENTS.length]} border transition-all duration-300 text-center hover:shadow-card hover:-translate-y-1.5 ${catInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
                  style={{ transitionDelay: `${i * 60}ms` }}>
                  <div className={`w-14 h-14 ${CAT_ICON_BG[i % CAT_ICON_BG.length]} rounded-2xl flex items-center justify-center mb-3 overflow-hidden transition-transform duration-300 group-hover:scale-110`}>
                    {cat.image
                      ? <img src={IMG(cat.image)} alt={cat.name} className="w-full h-full object-cover" loading="lazy" />
                      : <span className="text-2xl">🙏</span>}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 group-hover:text-saffron-700 transition-colors leading-tight font-sans">{cat.name}</span>
                </Link>
              ))}
        </div>

        <div className="text-center mt-12">
          <Link to="/poojas" className="btn-outline inline-flex items-center gap-2">
            View All Categories <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
