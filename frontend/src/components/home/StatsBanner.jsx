import React from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatedStat, useInView } from './shared';

const STATS = [
  { end: 10000, suffix: '+',  i18nKey: 'home.statPujas',     label: 'Pujas Completed',  icon: '🙏', large: true },
  { end: 500,   suffix: '+',  i18nKey: 'home.statPandits',   label: 'Verified Pandits', icon: '📿' },
  { end: 50,    suffix: '+',  i18nKey: 'home.statCities',    label: 'Cities Covered',   icon: '🛕' },
  { end: 98,    suffix: '%',  i18nKey: 'home.statFamilies',  label: 'Happy Families',   icon: '🏠' },
  { end: 49,    suffix: '★',  i18nKey: 'home.statRating',    label: 'Customer Rating',  icon: '⭐', isRating: true },
];

export default function StatsBanner() {
  const { t } = useTranslation();
  const [statsRef, statsInView] = useInView();
  return (
    <section className="relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}>
      <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
      <div ref={statsRef} className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-y-2 md:divide-y-0 md:divide-x divide-white/[0.06]">
          {STATS.map((s, i) => (
            <AnimatedStat key={s.label} stat={{ ...s, label: t(s.i18nKey, s.label) }} inView={statsInView} delay={i * 100} />
          ))}
        </div>
      </div>
    </section>
  );
}
