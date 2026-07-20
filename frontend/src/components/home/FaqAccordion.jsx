import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EyebrowTag } from './shared';

const FAQS = [
  { i18nQ: 'home.faq1Q', q: 'How does Zutsav work?', i18nA: 'home.faq1A', a: 'Select a pooja, enter your details, make payment, and we assign a verified pandit to your home for the ceremony.' },
  { i18nQ: 'home.faq2Q', q: 'Are the pandits verified?', i18nA: 'home.faq2A', a: 'Yes. Every pandit undergoes KYC verification including government ID check and background screening before joining.' },
  { i18nQ: 'home.faq3Q', q: 'Can I book for a specific date?', i18nA: 'home.faq3A', a: 'Absolutely. You choose the exact date and time during the booking flow and we accommodate your schedule.' },
  { i18nQ: 'home.faq4Q', q: 'What is the payment process?', i18nA: 'home.faq4A', a: 'We use PhonePe for secure UPI, card, and net-banking payments. All transactions are fully encrypted.' },
  { i18nQ: 'home.faq5Q', q: 'How do I get pandit contact info?', i18nA: 'home.faq5A', a: 'Once admin assigns a pandit, you receive their name and contact via WhatsApp notification immediately.' },
  { i18nQ: 'home.faq6Q', q: 'Do you provide puja samagri?', i18nA: 'home.faq6A', a: 'Yes! Choose the optional Samagri Kit during booking and we deliver everything fresh to your doorstep before the puja.' },
];

function FaqItem({ faq, index, open, toggle, t }) {
  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${open ? 'border-saffron-200 shadow-sacred' : 'border-gray-100 bg-white'}`}>
      <button
        onClick={() => toggle(index)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between px-6 py-5 text-left font-semibold text-gray-800 transition-colors ${open ? 'bg-saffron-50/40' : 'bg-white hover:bg-gray-50/60'}`}
      >
        <span className="pr-4 font-sans text-sm md:text-base">{t(faq.i18nQ, faq.q)}</span>
        <ChevronDown size={18} className={`text-saffron-500 transition-transform duration-300 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-500 text-sm leading-relaxed border-t border-saffron-100/60 pt-4 animate-slide-up font-sans bg-saffron-50/20">
          {t(faq.i18nA, faq.a)}
        </div>
      )}
    </div>
  );
}

export default function FaqAccordion({ handleAiSubmit }) {
  const { t } = useTranslation();
  const [faqOpen, setFaqOpen] = useState(null);
  const toggleFaq = (i) => setFaqOpen(faqOpen === i ? null : i);

  return (
    <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-14">
          <EyebrowTag>{t('home.faqEyebrow', 'Help & Support')}</EyebrowTag>
          <h2 className="section-title">{t('home.faqTitle', 'Frequently Asked')}</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <FaqItem key={i} faq={faq} index={i} open={faqOpen === i} toggle={toggleFaq} t={t} />
          ))}
        </div>
        <div className="text-center mt-10">
          <p className="text-gray-500 font-sans text-sm">
            {t('home.faqStillQuestions', 'Still have questions?')}{' '}
            <button onClick={() => handleAiSubmit('')} className="text-saffron-600 font-semibold hover:underline">
              {t('home.faqAskAi', 'Ask our AI Guide →')}
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
