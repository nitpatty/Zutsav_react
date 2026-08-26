import React, { useEffect, useState, useRef } from 'react';
import { MapPin, Search, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { getImageUrl } from '../config';
import { useLanguage } from '../context/LanguageContext';

function TempleCard({ temple }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  // The whole card opens the temple's detail page — image, overlay CTA and
  // footer link all navigate to /temples/:id.
  const openDetails = () => navigate(`/temples/${temple._id}`);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="overflow-hidden transition-all duration-500 group rounded-2xl"
      style={{
        background: 'var(--t-card)',
        border: '1px solid var(--t-border)',
        boxShadow: hovered
          ? '0 16px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(212,175,55,0.1)'
          : '0 2px 20px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
      }}>
      {/* Image */}
      <div className="relative overflow-hidden cursor-pointer h-44" onClick={openDetails}>
        {(temple.coverImage || temple.images?.length > 0) ? (
          <img
            src={getImageUrl(temple.coverImage || temple.images[0])}
            alt={temple.name}
            className="object-cover w-full h-full transition-transform duration-700"
            style={{ transform: hovered ? 'scale(1.06)' : 'scale(1)' }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full"
               style={{ background: 'linear-gradient(135deg, #1B1F3B 0%, #2d3160 100%)' }}>
            <span className="text-6xl">🛕</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
             style={{
               background: 'rgba(27,31,59,0.72)',
               opacity: hovered ? 1 : 0,
               pointerEvents: hovered ? 'auto' : 'none',
             }}>
          <button
            onClick={(e) => { e.stopPropagation(); openDetails(); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-transform duration-200 hover:scale-105"
            style={{ background: 'var(--t-secondary)', color: 'var(--t-text-inv, #1B1F3B)' }}>
            {t('temples.viewDetails', 'View Details')} <ArrowRight size={14} />
          </button>
        </div>

        {/* State chip */}
        <div className="absolute pointer-events-none top-3 right-3">
          <span className="bg-white/90 backdrop-blur-sm text-gray-700 text-[10px] font-bold px-2.5 py-1 rounded-full">
            {temple.state}
          </span>
        </div>
      </div>

      <div className="p-4 cursor-pointer" onClick={openDetails}>
        <h3 className="font-bold leading-tight mb-1.5"
            style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '1.15rem', color: 'var(--t-text)' }}>
          {temple.name}
        </h3>
        <div className="flex items-center gap-1 mb-2 text-sm" style={{ color: 'var(--t-muted)' }}>
          <MapPin size={12} style={{ color: 'var(--t-primary)' }} className="shrink-0" />
          <span>{temple.city}, {temple.state}</span>
        </div>
        {temple.description && (
          <p className="mb-3 text-sm line-clamp-2" style={{ color: 'var(--t-muted)' }}>{temple.description}</p>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); openDetails(); }}
          className="flex items-center gap-1.5 text-sm font-semibold transition-colors"
          style={{ color: 'var(--t-primary)' }}
          onMouseOver={(e) => e.currentTarget.style.color = 'var(--t-secondary)'}
          onMouseOut={(e) => e.currentTarget.style.color = 'var(--t-primary)'}>
          {t('temples.viewDetails', 'View Details')} <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

export default function TempleDirectory() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [temples,     setTemples]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [stateFilter, setStateFilter] = useState('');

  // `load` is called both reactively (language switch) and imperatively
  // (search button, Enter key) — a per-effect cleanup flag can't cover both
  // call sites, so a shared "latest request wins" token does: any response
  // whose token no longer matches the most recent call is a stale request
  // (e.g. a slow fetch for a language the user has since switched away
  // from) and is discarded instead of overwriting fresher state.
  const requestIdRef = useRef(0);
  const load = (s = '', st = '') => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    API.get(`/temples?search=${s}&state=${st}&limit=50`)
      .then(({ data }) => { if (requestIdRef.current === requestId) setTemples(data.temples); })
      .catch(() => { if (requestIdRef.current === requestId) toast.error(t('temples.couldNotLoadTemples', 'Could not load temples')); })
      .finally(() => { if (requestIdRef.current === requestId) setLoading(false); });
  };

  useEffect(() => { load(); }, [lang]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--t-bg)' }}>
      {/* Header */}
      <div className="relative overflow-hidden sacred-pattern" style={{ background: 'var(--t-primary)' }}>
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
        <div className="relative px-4 py-12 mx-auto max-w-7xl md:py-16">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-5 h-px" style={{ background: 'rgba(212,175,55,0.5)' }} />
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#D4AF37' }}>{t('home.sacredPlaces', 'Sacred Places')}</span>
            <span className="w-5 h-px" style={{ background: 'rgba(212,175,55,0.5)' }} />
          </div>
          <h1 className="mb-2 text-4xl font-bold text-white md:text-5xl"
              style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', letterSpacing: '-0.02em' }}>
            {t('temples.directoryTitle', 'Temple Directory')}
          </h1>
          <p className="font-sans text-sm text-white/40">{t('temples.directorySubtitle', 'Discover sacred temples and watch live aartis & darshan')}</p>
        </div>
      </div>

      <div className="px-4 py-8 mx-auto max-w-7xl">
        {/* Search bar */}
        <div className="flex flex-wrap gap-3 mb-8">
          <div className="flex items-center flex-1 gap-2 px-4 py-3 transition-colors shadow-sm min-w-56 rounded-xl"
               style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
            <Search size={15} className="text-gray-400 shrink-0" />
            <input
              className="flex-1 text-sm placeholder-gray-400 bg-transparent outline-none"
            style={{ color: 'var(--t-text)' }}
              placeholder={t('temples.searchPlaceholder', 'Search temple by name...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(search, stateFilter)}
            />
          </div>
          <input
            className="text-sm input w-44"
            placeholder={t('temples.filterByState', 'Filter by state...')}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          />
          <button
            onClick={() => load(search, stateFilter)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
            style={{ background: 'var(--t-primary)' }}>
            {t('temples.search', 'Search')}
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl"
                   style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>
                <div className="rounded-none skeleton h-44" style={{ borderRadius: 0 }} />
                <div className="p-4 space-y-2.5">
                  <div className="w-40 h-5 rounded skeleton" />
                  <div className="h-3 rounded skeleton w-28" />
                  <div className="w-full h-3 rounded skeleton" />
                  <div className="w-3/4 h-3 rounded skeleton" />
                </div>
              </div>
            ))}
          </div>
        ) : temples.length === 0 ? (
          <div className="py-20 text-center">
            <div className="flex items-center justify-center w-20 h-20 mx-auto mb-5 rounded-3xl"
                 style={{ background: 'var(--t-surface)' }}>
              <span className="text-4xl">🛕</span>
            </div>
            <h3 className="mb-2 text-2xl font-bold"
                style={{ fontFamily: '"Cormorant Garamond"', color: 'var(--t-text)' }}>
              {t('temples.noTemplesFound', 'No Temples Found')}
            </h3>
            <p className="text-sm" style={{ color: 'var(--t-muted)' }}>{t('temples.tryDifferentSearch', 'Try a different search term or state')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {temples.map((t) => <TempleCard key={t._id} temple={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}
