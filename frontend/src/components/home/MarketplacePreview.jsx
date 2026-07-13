import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl as IMG } from '../../config';
import { EyebrowTag, useInView } from './shared';

export default function MarketplacePreview({ products }) {
  const [mktRef, mktInView] = useInView();
  const carouselRef = useRef(null);

  const scrollCarousel = (dir) => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
    }
  };

  if (products.length === 0) return null;

  return (
    <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
      <div ref={mktRef} className="container-pad">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <EyebrowTag>Sacred Store</EyebrowTag>
            <h2 className="section-title">Trending Samagri</h2>
            <p className="section-subtitle">Authentic puja essentials delivered to your doorstep</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => scrollCarousel(-1)}
              className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-saffron-300 flex items-center justify-center shadow-sm transition-all hover:-translate-y-0.5">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <button onClick={() => scrollCarousel(1)}
              className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-saffron-300 flex items-center justify-center shadow-sm transition-all hover:-translate-y-0.5">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
            <Link to="/marketplace" className="text-saffron-600 font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all font-sans">
              View All <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <div ref={carouselRef} className="flex gap-5 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4">
          {products.map((p, i) => (
            <Link key={p._id} to={`/marketplace/product/${p.slug}`}
              className={`group shrink-0 w-56 bg-white rounded-3xl overflow-hidden shadow-card hover:shadow-premium hover:-translate-y-2 transition-all duration-400 ${mktInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
              style={{ transitionDelay: `${i * 60}ms` }}>
              <div className="h-44 bg-gradient-to-br from-saffron-50 to-orange-50 overflow-hidden">
                {IMG(p.images?.[0] || p.image)
                  ? <img src={IMG(p.images?.[0] || p.image)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center text-4xl">🪔</div>}
              </div>
              <div className="p-4">
                <h4 className="font-semibold text-gray-800 text-sm font-sans line-clamp-2 mb-2 group-hover:text-saffron-700 transition-colors">{p.name}</h4>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-lg text-saffron-600">₹{(p.salePrice || p.price).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                  <span className="text-[10px] bg-green-50 text-green-600 font-semibold px-2 py-0.5 rounded-full font-sans">In Stock</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
