import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag, Sparkles } from 'lucide-react';
import { getImageUrl as IMG } from '../../config';
import { EyebrowTag, useInView } from './shared';

const JOURNEY_INTENTS = [
  { id: 'career',     label: 'Career',       emoji: '💼', desc: 'Growth & Success',    gFrom: 'from-blue-50',    gTo: 'to-indigo-50',   bdr: 'border-blue-100',   keywords: ['saraswati','lakshmi','ganesha','career','success'] },
  { id: 'marriage',   label: 'Marriage',     emoji: '💑', desc: 'Love & Union',        gFrom: 'from-pink-50',    gTo: 'to-rose-50',     bdr: 'border-pink-100',   keywords: ['vivah','marriage','manglik','love'] },
  { id: 'health',     label: 'Health',       emoji: '🌿', desc: 'Wellness & Healing',  gFrom: 'from-green-50',   gTo: 'to-emerald-50',  bdr: 'border-green-100',  keywords: ['mahamrityunjaya','health','dhanvantari','healing'] },
  { id: 'business',   label: 'Business',     emoji: '📈', desc: 'Prosperity & Growth', gFrom: 'from-amber-50',   gTo: 'to-yellow-50',   bdr: 'border-amber-100',  keywords: ['lakshmi','kuber','vyapar','business','prosperity'] },
  { id: 'new-home',   label: 'New Home',     emoji: '🏠', desc: 'Gruhapravesh',        gFrom: 'from-orange-50',  gTo: 'to-saffron-50',  bdr: 'border-orange-100', keywords: ['gruhapravesh','vastu','home','ganesha'] },
  { id: 'child',      label: 'Child',        emoji: '👶', desc: 'Blessing & Joy',      gFrom: 'from-yellow-50',  gTo: 'to-amber-50',    bdr: 'border-yellow-100', keywords: ['santana','child','baby','gopal'] },
  { id: 'prosperity', label: 'Prosperity',   emoji: '🪙', desc: 'Wealth & Abundance',  gFrom: 'from-temple-50',  gTo: 'to-yellow-50',   bdr: 'border-temple-100', keywords: ['lakshmi','kuber','akshaya','wealth'] },
  { id: 'peace',      label: 'Peace',        emoji: '🕊️', desc: 'Inner Calm',          gFrom: 'from-sky-50',     gTo: 'to-blue-50',     bdr: 'border-sky-100',    keywords: ['shanti','satyanarayan','peace','rudra'] },
  { id: 'protection', label: 'Protection',   emoji: '🛡️', desc: 'Safety & Guard',      gFrom: 'from-rose-50',    gTo: 'to-red-50',      bdr: 'border-rose-100',   keywords: ['sudarshana','hanuman','kavach','protection'] },
];

export default function JourneyPicker({ featuredPoojas, handleAiSubmit }) {
  const [journeyRef, journeyInView] = useInView();
  const [activeJourney, setActiveJourney] = useState(null);

  const selectedIntent = JOURNEY_INTENTS.find((j) => j.id === activeJourney);
  const journeyRecs = selectedIntent
    ? featuredPoojas.filter((p) => {
        const hay = (p.name + ' ' + (p.shortDesc || '')).toLowerCase();
        return selectedIntent.keywords.some((kw) => hay.includes(kw));
      }).slice(0, 3)
    : [];
  const staticJourneyRecs = selectedIntent
    ? selectedIntent.keywords.slice(0, 3).map((kw, i) => ({
        name: kw.charAt(0).toUpperCase() + kw.slice(1) + ' Puja',
        slug: kw,
        _id: `static-${i}`,
      }))
    : [];
  const recsToShow = journeyRecs.length > 0 ? journeyRecs : staticJourneyRecs;

  return (
    <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
      <div ref={journeyRef} className="container-pad">
        <div className="text-center mb-14">
          <EyebrowTag>Personalized for You</EyebrowTag>
          <h2 className="section-title">Why Are You Here Today?</h2>
          <p className="section-subtitle mx-auto text-center">
            Select your intent and we'll guide you to the right puja, products, and wisdom.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-3 mb-10">
          {JOURNEY_INTENTS.map((intent, i) => (
            <button
              key={intent.id}
              onClick={() => setActiveJourney(activeJourney === intent.id ? null : intent.id)}
              className={`flex flex-col items-center p-4 rounded-3xl border-2 transition-all duration-300 text-center group hover:-translate-y-1 hover:shadow-card ${journeyInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}
                ${activeJourney === intent.id
                  ? `bg-gradient-to-br ${intent.gFrom} ${intent.gTo} ${intent.bdr} shadow-card scale-105`
                  : `bg-white border-gray-100 hover:${intent.bdr}`}`}
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              <span className="text-2xl mb-2 group-hover:scale-110 transition-transform duration-200">{intent.emoji}</span>
              <span className="text-xs font-bold text-gray-700 font-sans">{intent.label}</span>
              <span className="text-[10px] text-gray-400 font-sans mt-0.5 hidden sm:block">{intent.desc}</span>
            </button>
          ))}
        </div>

        <div className={`transition-all duration-500 ${activeJourney ? 'opacity-100 max-h-[600px]' : 'opacity-0 max-h-0 overflow-hidden'}`}>
          {selectedIntent && (
            <div className="bg-white rounded-3xl p-8 shadow-card border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{selectedIntent.emoji}</span>
                <div>
                  <h3 className="font-display font-bold text-xl text-gray-900" style={{ letterSpacing: '-0.01em' }}>
                    Recommended for {selectedIntent.label}
                  </h3>
                  <p className="text-sm text-gray-400 font-sans">{selectedIntent.desc}</p>
                </div>
              </div>

              {recsToShow.length > 0 && (
                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  {recsToShow.map((p) => (
                    <Link key={p._id} to={p.slug && !p._id.startsWith('static') ? `/book/${p.slug}` : '/poojas'}
                      className="group flex items-center gap-3 p-4 rounded-2xl border border-gray-100 hover:border-saffron-200 hover:bg-saffron-50/30 transition-all duration-200">
                      <div className="w-12 h-12 bg-gradient-to-br from-saffron-50 to-orange-50 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                        {IMG(p.image)
                          ? <img src={IMG(p.image)} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                          : <span className="text-xl">🙏</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 text-sm font-sans truncate group-hover:text-saffron-700 transition-colors">{p.name}</p>
                        {p.salePrice && <p className="text-xs text-saffron-600 font-sans">₹{p.salePrice.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>}
                      </div>
                      <ArrowRight size={14} className="text-gray-300 group-hover:text-saffron-500 transition-colors shrink-0 ml-auto" />
                    </Link>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
                <Link to="/poojas" className="btn-primary text-sm px-6 py-2.5 rounded-2xl inline-flex items-center gap-2">
                  View All Poojas <ArrowRight size={14} />
                </Link>
                <Link to="/marketplace" className="btn-secondary text-sm px-6 py-2.5 rounded-2xl inline-flex items-center gap-2">
                  Shop Samagri <ShoppingBag size={14} />
                </Link>
                <button onClick={() => handleAiSubmit(`Best puja for ${selectedIntent.label.toLowerCase()}`)}
                  className="btn-ghost text-sm px-6 py-2.5 rounded-2xl inline-flex items-center gap-2">
                  Ask AI Guide <Sparkles size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
