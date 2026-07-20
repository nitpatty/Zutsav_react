import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EyebrowTag, useInView } from './shared';

export default function FestivalsSection({ festivals, loading }) {
  const { t } = useTranslation();
  const [festivalRef, festivalInView] = useInView();

  return (
    <section
      ref={festivalRef}
      className="section-pad text-white overflow-hidden relative"
      style={{ background: 'linear-gradient(145deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}
    >
      <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
      <div className="container-pad relative">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <EyebrowTag light>{t('home.celebrateTogether', 'Celebrate Together')}</EyebrowTag>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white" style={{ letterSpacing: '-0.03em' }}>
              {t('home.upcomingFestivals', 'Upcoming Festivals')}
            </h2>
          </div>
          <Link to="/festivals" className="flex items-center gap-2 font-semibold text-sm hover:gap-3 transition-all font-sans" style={{ color: '#C9A84C' }}>
            {t('home.fullCalendar', 'Full Calendar')} <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="flex gap-5 overflow-hidden">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="shrink-0 w-56 h-52 rounded-3xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        ) : festivals.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🪔</div>
            <p className="text-gray-300 font-sans">{t('home.noUpcomingFestivals', 'No upcoming festivals.')} <Link to="/festivals" className="text-saffron-400 hover:underline">{t('home.viewCalendar', 'View calendar →')}</Link></p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute top-9 left-0 right-0 h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent)' }} />

            <div className="flex gap-5 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4">
              {festivals.map((f, i) => {
                const fd = new Date(f.date);
                const today2 = new Date(); today2.setHours(0, 0, 0, 0);
                const daysLeft = Math.ceil((fd - today2) / 86400000);
                return (
                  <div
                    key={f._id}
                    className={`shrink-0 w-52 rounded-3xl p-6 border transition-all duration-400 hover:-translate-y-1 hover:border-saffron-500/40 cursor-pointer ${festivalInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.10)', transitionDelay: `${i * 90}ms` }}
                  >
                    <div className="relative flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full shrink-0 border-2"
                        style={{ background: daysLeft === 0 ? '#FF6B00' : '#C9A84C', borderColor: daysLeft === 0 ? '#FF6B00' : '#C9A84C' }} />
                      {daysLeft === 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full font-sans" style={{ background: 'rgba(255,107,0,0.25)', color: '#ffb85a' }}>{t('home.today', 'Today!')}</span>
                      ) : daysLeft > 0 ? (
                        <span className="text-[10px] font-semibold text-gray-400 font-sans">{t('home.daysLeft', '{{n}}d left', { n: daysLeft })}</span>
                      ) : null}
                    </div>

                    <div className="text-2xl mb-3">🎉</div>
                    <h3 className="font-display font-bold text-base leading-snug mb-2" style={{ color: '#C9A84C', letterSpacing: '-0.01em' }}>{f.name}</h3>
                    <p className="text-xs text-gray-400 font-sans">
                      {fd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {f.tithiDate && <p className="text-xs text-gray-500 font-sans mt-0.5">{f.tithiDate}</p>}
                    <div className="mt-5 pt-4 border-t border-white/[0.08]">
                      <Link to="/poojas" className="text-xs font-semibold flex items-center gap-1 hover:gap-2 transition-all font-sans" style={{ color: '#FF6B00' }}>
                        {t('home.ctaBookPuja', 'Book a Puja')} <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
