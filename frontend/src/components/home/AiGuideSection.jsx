import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { EyebrowTag, useInView } from './shared';

const AI_QUESTIONS = [
  'What pooja should I do for my new home?',
  'Best muhurat for marriage in 2025?',
  'Importance of Satyanarayan Katha?',
  'How to perform Diwali puja at home?',
  'When is the next Ekadashi fast?',
];

export default function AiGuideSection({ handleAiSubmit }) {
  const [aiRef, aiInView] = useInView();
  const [aiQuery, setAiQuery] = useState('');

  const submit = (q) => {
    handleAiSubmit(q || aiQuery);
  };

  return (
    <section
      ref={aiRef}
      className="section-pad relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}
    >
      <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-64 h-64 bg-saffron-500 rounded-full blur-[100px] opacity-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-temple-500 rounded-full blur-[100px] opacity-8 pointer-events-none" />

      <div className="container-pad relative">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className={`transition-all duration-700 ${aiInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <EyebrowTag light>✨ Powered by Gemini AI</EyebrowTag>
            <h2 className="font-display font-bold text-white mb-4" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', letterSpacing: '-0.03em' }}>
              Need Spiritual
              <br />
              <span style={{ color: '#C9A84C' }}>Guidance?</span>
            </h2>
            <p className="text-gray-300 font-sans mb-8 text-base leading-relaxed max-w-md">
              Ask Zutsav AI anything about pujas, temples, astrology, festivals, rituals, or Hindu traditions. Your personal spiritual companion.
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
              {AI_QUESTIONS.map((q) => (
                <button key={q} onClick={() => submit(q)}
                  className="text-xs font-medium px-4 py-2 rounded-full border transition-all duration-200 font-sans hover:-translate-y-0.5"
                  style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', color: '#e8d5a3' }}>
                  {q}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Ask about a puja, festival, or ritual..."
                className="flex-1 rounded-2xl px-5 py-3.5 text-sm font-sans focus:outline-none transition-all duration-200 text-white placeholder:text-white/40"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.15)' }}
              />
              <button onClick={() => submit()}
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)' }}>
                <Send size={16} className="text-white" />
              </button>
            </div>
          </div>

          <div className={`transition-all duration-700 delay-200 ${aiInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
            <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
                  style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)' }}>
                  🪔
                </div>
                <div>
                  <p className="text-white font-semibold text-sm font-sans">Zutsav AI Guide</p>
                  <p className="text-green-400 text-xs font-sans flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                    Always available
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm font-sans"
                    style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)', color: 'white' }}>
                    What pooja should I do for my new home?
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                    style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)' }}>🪔</div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm font-sans text-gray-200"
                    style={{ background: 'rgba(255,255,255,0.10)' }}>
                    For a new home, <span style={{ color: '#C9A84C' }}>Gruhapravesh Puja</span> is most auspicious. It purifies the space, invites positive energy, and blesses all who will live there. I recommend choosing a{' '}
                    <span style={{ color: '#C9A84C' }}>Shubh Muhurat</span> for the ceremony. Shall I help you find a verified pandit?
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm font-sans"
                    style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)', color: 'white' }}>
                    Yes, please! What's the best day?
                  </div>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                    style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)' }}>🪔</div>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((d) => <div key={d} className="w-2 h-2 rounded-full animate-pulse-soft" style={{ background: '#C9A84C', animationDelay: `${d * 200}ms` }} />)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
