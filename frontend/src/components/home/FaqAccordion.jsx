import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { EyebrowTag } from './shared';

const FAQS = [
  { q: 'How does Zutsav work?', a: 'Select a pooja, enter your details, make payment, and we assign a verified pandit to your home for the ceremony.' },
  { q: 'Are the pandits verified?', a: 'Yes. Every pandit undergoes KYC verification including government ID check and background screening before joining.' },
  { q: 'Can I book for a specific date?', a: 'Absolutely. You choose the exact date and time during the booking flow and we accommodate your schedule.' },
  { q: 'What is the payment process?', a: 'We use PhonePe for secure UPI, card, and net-banking payments. All transactions are fully encrypted.' },
  { q: 'How do I get pandit contact info?', a: 'Once admin assigns a pandit, you receive their name and contact via WhatsApp notification immediately.' },
  { q: 'Do you provide puja samagri?', a: 'Yes! Choose the optional Samagri Kit during booking and we deliver everything fresh to your doorstep before the puja.' },
];

function FaqItem({ faq, index, open, toggle }) {
  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${open ? 'border-saffron-200 shadow-sacred' : 'border-gray-100 bg-white'}`}>
      <button
        onClick={() => toggle(index)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between px-6 py-5 text-left font-semibold text-gray-800 transition-colors ${open ? 'bg-saffron-50/40' : 'bg-white hover:bg-gray-50/60'}`}
      >
        <span className="pr-4 font-sans text-sm md:text-base">{faq.q}</span>
        <ChevronDown size={18} className={`text-saffron-500 transition-transform duration-300 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-500 text-sm leading-relaxed border-t border-saffron-100/60 pt-4 animate-slide-up font-sans bg-saffron-50/20">
          {faq.a}
        </div>
      )}
    </div>
  );
}

export default function FaqAccordion({ handleAiSubmit }) {
  const [faqOpen, setFaqOpen] = useState(null);
  const toggleFaq = (i) => setFaqOpen(faqOpen === i ? null : i);

  return (
    <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-14">
          <EyebrowTag>Help &amp; Support</EyebrowTag>
          <h2 className="section-title">Frequently Asked</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <FaqItem key={i} faq={faq} index={i} open={faqOpen === i} toggle={toggleFaq} />
          ))}
        </div>
        <div className="text-center mt-10">
          <p className="text-gray-500 font-sans text-sm">
            Still have questions?{' '}
            <button onClick={() => handleAiSubmit('')} className="text-saffron-600 font-semibold hover:underline">
              Ask our AI Guide →
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
