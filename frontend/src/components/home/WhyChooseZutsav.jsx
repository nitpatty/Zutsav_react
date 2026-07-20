import React from 'react';
import { Shield, Clock, CreditCard, TrendingUp, Award, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EyebrowTag, useInView } from './shared';

const FEATURES = [
  { icon: Shield,     i18nTitle: 'home.feature1Title', title: 'KYC-Verified Pandits', i18nDesc: 'home.feature1Desc', desc: 'Government ID check and background verification before every pandit joins.' },
  { icon: Clock,      i18nTitle: 'home.feature2Title', title: 'On-Time, Every Time',  i18nDesc: 'home.feature2Desc', desc: 'Punctual, professional ceremony delivery at your scheduled time.' },
  { icon: CreditCard, i18nTitle: 'home.feature3Title', title: 'Secure Payments',      i18nDesc: 'home.feature3Desc', desc: 'Encrypted PhonePe UPI & card payments. Fully safe, fully transparent.' },
  { icon: TrendingUp, i18nTitle: 'home.feature4Title', title: 'Live Tracking',        i18nDesc: 'home.feature4Desc', desc: 'Real-time WhatsApp notifications for every booking milestone.' },
  { icon: Award,      i18nTitle: 'home.feature5Title', title: 'Premium Experience',   i18nDesc: 'home.feature5Desc', desc: 'Authentic rituals delivered with modern convenience and grace.' },
  { icon: FileText,   i18nTitle: 'home.feature6Title', title: 'GST Invoice',          i18nDesc: 'home.feature6Desc', desc: 'Official GST invoices for every service. Ethical, transparent pricing.' },
];

export default function WhyChooseZutsav() {
  const { t } = useTranslation();
  const [featuresRef, featuresInView] = useInView();

  return (
    <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
      <div ref={featuresRef} className="container-pad">
        <div className="text-center mb-16">
          <EyebrowTag>{t('home.whyChooseEyebrow', 'The Zutsav Promise')}</EyebrowTag>
          <h2 className="section-title">{t('home.whyChooseTitle', 'Why Choose Zutsav')}</h2>
          <p className="section-subtitle mx-auto text-center">
            {t('home.whyChooseSubtitle', 'Premium spiritual services built on transparency, trust, and tradition')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc, i18nTitle, i18nDesc }, i) => (
            <div key={title}
              className={`group p-8 rounded-3xl bg-white border border-gray-100 hover:border-saffron-200 hover:shadow-sacred transition-all duration-300 hover:-translate-y-1.5 ${featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
              style={{ transitionDelay: `${i * 90}ms` }}>
              <div className="w-14 h-14 bg-gradient-to-br from-saffron-50 to-orange-50 group-hover:from-saffron-100 group-hover:to-orange-100 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-105">
                <Icon size={24} className="text-saffron-600" />
              </div>
              <h3 className="font-display font-bold text-gray-900 text-xl mb-3" style={{ letterSpacing: '-0.01em' }}>{t(i18nTitle, title)}</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-sans">{t(i18nDesc, desc)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
