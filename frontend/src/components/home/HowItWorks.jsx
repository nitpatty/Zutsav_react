import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EyebrowTag } from './shared';

const STEPS = [
  { num: '01', i18nTitle: 'home.step1Title', title: 'Choose Your Pooja', i18nDesc: 'home.step1Desc', desc: 'Browse curated poojas and havans for every occasion.', icon: '🙏' },
  { num: '02', i18nTitle: 'home.step2Title', title: 'Select Date & Time', i18nDesc: 'home.step2Desc', desc: 'Pick a slot that works for you — we work around your schedule.', icon: '📅' },
  { num: '03', i18nTitle: 'home.step3Title', title: 'Pandit Arrives', i18nDesc: 'home.step3Desc', desc: 'A verified pandit arrives with all required samagri.', icon: '🪔' },
];

export default function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section className="section-pad bg-white">
      <div className="container-pad">
        <div className="text-center mb-16">
          <EyebrowTag>{t('home.howItWorksEyebrow', 'Simple & Seamless')}</EyebrowTag>
          <h2 className="section-title">{t('home.howItWorksTitle', 'How Zutsav Works')}</h2>
          <p className="section-subtitle mx-auto text-center">
            {t('home.howItWorksSubtitle', 'Book a verified pandit in minutes — from anywhere in India')}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-[2.75rem] left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px border-t-2 border-dashed border-saffron-200 z-0" />
          {STEPS.map(({ num, title, desc, icon, i18nTitle, i18nDesc }, i) => (
            <div key={num} className="relative text-center z-10">
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-glow-saffron"
                  style={{ background: 'linear-gradient(135deg, #D4602A, #ff9020)' }}>
                  <span className="text-3xl">{icon}</span>
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 bg-charcoal text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm font-sans">
                  {i + 1}
                </div>
              </div>
              <h3 className="font-display font-bold text-gray-900 text-xl mb-3" style={{ letterSpacing: '-0.01em' }}>{t(i18nTitle, title)}</h3>
              <p className="text-gray-500 text-sm leading-relaxed font-sans">{t(i18nDesc, desc)}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-14">
          <Link to="/poojas" className="btn-primary inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base shadow-glow-saffron">
            {t('home.ctaFirstPuja', 'Book Your First Puja')} <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
