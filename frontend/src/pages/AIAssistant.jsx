import React from 'react';
import {
  Sparkles, MessageSquare, Calendar, Star,
  Zap, ArrowRight, BookOpen, Clock,
} from 'lucide-react';

const CAPABILITIES = [
  {
    icon: MessageSquare,
    title: 'Pooja Guidance',
    desc: 'Personalised pooja recommendations based on your needs, occasion, or planetary situation.',
  },
  {
    icon: Calendar,
    title: 'Auspicious Timings',
    desc: 'Find the best muhurat for ceremonies, travel, business launches, and life events.',
  },
  {
    icon: Star,
    title: 'Festival Insights',
    desc: 'Learn about upcoming festivals, their significance, rituals, and how to observe them.',
  },
  {
    icon: Zap,
    title: 'Instant Answers',
    desc: 'Ask anything about Hindu traditions, mantras, graha doshas, and spiritual practices.',
  },
  {
    icon: BookOpen,
    title: 'Mantra & Scripture',
    desc: 'Understand the meaning and benefits of mantras, shlokas, and sacred texts.',
  },
  {
    icon: Clock,
    title: 'Daily Panchang',
    desc: "Get today's tithi, nakshatra, yoga, karan, and rahukalam at a glance.",
  },
];

const EXAMPLE_PROMPTS = [
  'Which pooja should I do for career growth?',
  'What is the significance of Ekadashi?',
  'Tell me about Rudrabhishek and its benefits',
  'Best muhurat for Griha Pravesh this month',
  'What is Kaal Sarp Dosh and how to remedy it?',
  'Explain the 16 Samskaras in Hinduism',
];

/* Open the global floating widget from any page */
const openWidget = () =>
  window.dispatchEvent(new CustomEvent('zutsav:openZutsavAI'));

export default function AIAssistant() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--t-bg)' }}>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-6 py-14 md:py-16 text-center"
        style={{
          background: 'linear-gradient(135deg,#1B1F3B 0%,#252960 55%,#1B1F3B 100%)',
        }}
      >
        {/* Gold radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%,rgba(212,175,55,0.14) 0%,transparent 70%)',
          }}
        />

        <div className="relative max-w-lg mx-auto">
          {/* Icon */}
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 text-2xl select-none"
            style={{
              background: 'rgba(212,175,55,0.12)',
              border: '1px solid rgba(212,175,55,0.28)',
            }}
          >
            ✨
          </div>

          {/* Title */}
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <h1
              className="text-2xl md:text-3xl font-bold text-white"
              style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: '-0.01em' }}
            >
              Zutsav AI
            </h1>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest select-none"
              style={{
                background: 'rgba(212,175,55,0.18)',
                color: '#D4AF37',
                border: '1px solid rgba(212,175,55,0.32)',
              }}
            >
              Beta
            </span>
          </div>

          <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Your AI spiritual companion — available everywhere on Zutsav
          </p>
          <p className="text-xs mb-8" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Powered by Groq AI · Hindu spiritual guidance
          </p>

          <button
            onClick={openWidget}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl font-semibold text-sm transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg,#D4AF37 0%,#C9A84C 100%)',
              color: '#1B1F3B',
              boxShadow: '0 8px 24px rgba(212,175,55,0.38)',
            }}
          >
            <Sparkles size={15} />
            Start Chatting
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* ── Capabilities ──────────────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold mb-4 text-center"
            style={{
              color: 'var(--t-text)',
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            What Zutsav AI can help you with
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
              <button
                key={title}
                onClick={openWidget}
                className="text-left p-4 rounded-2xl transition-all hover:shadow-md active:scale-[0.99] group"
                style={{
                  background: 'var(--t-card)',
                  border: '1px solid var(--t-border)',
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-colors group-hover:bg-opacity-80"
                  style={{
                    background: 'rgba(27,31,59,0.06)',
                    color: '#1B1F3B',
                  }}
                >
                  <Icon size={17} />
                </div>
                <h3
                  className="font-semibold text-sm mb-1"
                  style={{ color: 'var(--t-text)' }}
                >
                  {title}
                </h3>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--t-muted)' }}
                >
                  {desc}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* ── Example prompts ───────────────────────────────────────────── */}
        <section>
          <h2
            className="text-sm font-semibold mb-3"
            style={{ color: 'var(--t-muted)' }}
          >
            Try asking…
          </h2>
          <div className="space-y-2">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={openWidget}
                className="w-full text-left px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-3 transition-all hover:shadow-sm active:scale-[0.99] group"
                style={{
                  background: 'var(--t-card)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text)',
                }}
              >
                <span>{p}</span>
                <ArrowRight
                  size={14}
                  className="shrink-0 transition-transform group-hover:translate-x-1"
                  style={{ color: 'var(--t-muted)' }}
                />
              </button>
            ))}
          </div>
        </section>

        {/* ── Widget tip ────────────────────────────────────────────────── */}
        <div
          className="p-5 rounded-2xl text-center"
          style={{
            background:
              'linear-gradient(135deg,rgba(27,31,59,0.04) 0%,rgba(212,175,55,0.06) 100%)',
            border: '1px solid rgba(27,31,59,0.08)',
          }}
        >
          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: 'var(--t-muted)' }}
          >
            🪔 Zutsav AI is available on <strong>every page</strong> via the floating{' '}
            <Sparkles
              size={11}
              className="inline"
              style={{ color: '#D4AF37', verticalAlign: 'middle' }}
            />{' '}
            button in the bottom-right corner — so you can ask a question without
            leaving what you're doing.
          </p>
          <button
            onClick={openWidget}
            className="inline-flex items-center gap-2 text-sm font-semibold transition-all hover:gap-3"
            style={{ color: '#1B1F3B' }}
          >
            Open Chat Now
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
