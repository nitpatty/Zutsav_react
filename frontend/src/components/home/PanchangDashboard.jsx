import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EyebrowTag, useInView } from './shared';

export default function PanchangDashboard({ mantra, quote, dateStr, panchang, loading }) {
  const { t } = useTranslation();
  const [panchangRef, panchangInView] = useInView();

  const val = (v) => (loading ? t('home.loading', 'Loading…') : (v || t('home.panchangUnavailable', 'Panchang temporarily unavailable')));
  const rahuKaalStr = panchang?.rahuKaal ? `${panchang.rahuKaal.start} – ${panchang.rahuKaal.end}` : null;

  const cards = [
    { icon: '🌅', title: t('home.pdSunrise', 'Sunrise'), value: val(panchang?.sunrise), sub: t('home.pdDayBegins', 'Day begins'), gFrom: 'from-yellow-50', gTo: 'to-orange-50', border: 'border-yellow-100', textColor: 'text-orange-600' },
    { icon: '🌇', title: t('home.pdSunset', 'Sunset'), value: val(panchang?.sunset), sub: t('home.pdDayEnds', 'Day ends'), gFrom: 'from-rose-50', gTo: 'to-orange-50', border: 'border-rose-100', textColor: 'text-rose-600' },
    { icon: '⚠️', title: t('home.pdRahuKaal', 'Rahu Kaal'), value: val(rahuKaalStr), sub: t('home.pdAvoidPeriod', 'Avoid this period'), gFrom: 'from-red-50', gTo: 'to-rose-50', border: 'border-red-100', textColor: 'text-red-600' },
    { icon: '✨', title: t('home.pdBrahmaMuhurta', 'Brahma Muhurta'), value: val(panchang?.muhurta), sub: t('home.pdMostAuspicious', 'Most auspicious time'), gFrom: 'from-emerald-50', gTo: 'to-green-50', border: 'border-emerald-100', textColor: 'text-emerald-600' },
    { icon: '📿', title: t('home.pdTodaysDeity', "Today's Deity"), value: mantra.deity, sub: t('home.pdDayOfDevotion', 'Day of devotion'), gFrom: 'from-violet-50', gTo: 'to-purple-50', border: 'border-violet-100', textColor: 'text-violet-600' },
    { icon: '🕉️', title: t('home.pdTodaysMantra', "Today's Mantra"), value: mantra.mantra, sub: mantra.en, isMantra: true, gFrom: 'from-saffron-50', gTo: 'to-amber-50', border: 'border-saffron-100', textColor: 'text-saffron-700' },
    { icon: '💬', title: t('home.pdTodaysWisdom', "Today's Wisdom"), value: quote.text, sub: `— ${quote.src}`, isQuote: true, gFrom: 'from-sky-50', gTo: 'to-blue-50', border: 'border-sky-100', textColor: 'text-sky-600' },
  ];

  return (
    <section className="section-pad" style={{ background: '#FAF6EE' }}>
      <div ref={panchangRef} className="container-pad">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <EyebrowTag>{t('home.dailySacredGuide', 'Daily Sacred Guide')}</EyebrowTag>
            <h2 className="section-title">{t('home.spiritualDashboard', "Today's Spiritual Dashboard")}</h2>
            <p className="section-subtitle">{dateStr}</p>
          </div>
          <Link to="/panchang" className="text-saffron-600 font-semibold text-sm flex items-center gap-1.5 hover:gap-2.5 transition-all font-sans">
            {t('home.fullPanchang', 'Full Panchang')} <ArrowRight size={14} />
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4">
          {cards.map(({ icon, title, value, sub, isMantra, isQuote, gFrom, gTo, border, textColor }, i) => (
            <div
              key={title}
              className={`shrink-0 w-56 bg-gradient-to-br ${gFrom} ${gTo} border ${border} rounded-3xl p-5 transition-all duration-500 hover:shadow-card hover:-translate-y-1 ${panchangInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
              style={{ transitionDelay: `${i * 70}ms` }}
            >
              <div className="text-2xl mb-3">{icon}</div>
              <p className={`text-xs font-bold tracking-widest uppercase mb-2 font-sans ${textColor}`}>{title}</p>
              <p className={`font-display font-bold leading-snug mb-1 ${isMantra ? 'text-lg' : isQuote ? 'text-xs leading-relaxed' : 'text-xl'} text-gray-900`}
                style={{ letterSpacing: isMantra ? '0.02em' : '-0.01em' }}>
                {value}
              </p>
              <p className="text-xs text-gray-500 font-sans leading-snug">{sub}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 font-sans mt-4 text-center">
          {t('home.timingsApproximate', 'Timings are approximate. For precise values, view')}{' '}
          <Link to="/panchang" className="text-saffron-600 font-semibold hover:underline">{t('home.fullPanchangArrow', 'Full Panchang →')}</Link>
        </p>
      </div>
    </section>
  );
}
