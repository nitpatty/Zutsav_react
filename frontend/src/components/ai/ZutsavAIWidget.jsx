import React, {
  useState, useRef, useEffect, useCallback, memo,
} from 'react';
import { X, Send, RotateCcw, Sparkles, ChevronDown, Loader2 } from 'lucide-react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

/* ─────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────── */
const INITIAL_MSG = {
  role: 'model',
  text: '🙏 Namaste!\n\nWelcome to **Zutsav AI**, your spiritual assistant.\n\nAsk me anything about poojas, festivals, temples, rituals, astrology, Hindu traditions, spiritual products, or booking guidance. I\'m here to help.',
  ts: Date.now(),
};

const SUGGESTIONS = [
  'Tell me about Ganesh Puja',
  'Best puja for career growth?',
  'Benefits of Rudrabhishek',
  'Upcoming festivals',
  'Best muhurat this week',
  'Puja for marriage',
  'Meaning of Hanuman Chalisa',
  'What is Navratri?',
];

/* ─────────────────────────────────────────────────────────────────────────
   Inline CSS keyframes (injected once)
───────────────────────────────────────────────────────────────────────── */
const PANEL_STYLE = `
  @keyframes zutsavAIUp {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   Markdown-lite renderer  (bold via **text**)
───────────────────────────────────────────────────────────────────────── */
function RenderText({ text }) {
  return (
    <>
      {text.split('\n').map((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {parts.map((p, pi) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={pi}>{p.slice(2, -2)}</strong>
                : p
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Chat bubble
───────────────────────────────────────────────────────────────────────── */
const ChatBubble = memo(({ msg }) => {
  const isUser = msg.role === 'user';
  const time = msg.ts
    ? new Date(msg.ts).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '';

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''} group`}>
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[11px] select-none"
        style={{
          background: isUser
            ? 'linear-gradient(135deg,#E67E22 0%,#D4AF37 100%)'
            : 'linear-gradient(135deg,#1B1F3B 0%,#2d3160 100%)',
          color: 'white',
        }}
      >
        {isUser ? '👤' : '🪔'}
      </div>

      {/* Bubble + timestamp */}
      <div className={`flex flex-col gap-0.5 max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3 py-2.5 rounded-2xl text-[13px] leading-relaxed ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
          style={isUser ? {
            background: 'linear-gradient(135deg,#E67E22 0%,#D4602A 100%)',
            color: 'white',
          } : {
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid rgba(27,31,59,0.08)',
            color: '#1a1207',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          {isUser ? msg.text : <RenderText text={msg.text} />}
        </div>
        <span
          className="text-[10px] px-1 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'rgba(0,0,0,0.3)' }}
        >
          {time}
        </span>
      </div>
    </div>
  );
});
ChatBubble.displayName = 'ChatBubble';

/* ─────────────────────────────────────────────────────────────────────────
   Typing indicator
───────────────────────────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex gap-2">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[11px]"
        style={{ background: 'linear-gradient(135deg,#1B1F3B 0%,#2d3160 100%)', color: 'white' }}
      >
        🪔
      </div>
      <div
        className="px-3 py-3 rounded-2xl rounded-tl-sm"
        style={{
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid rgba(27,31,59,0.08)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex gap-1 items-center" style={{ height: '14px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                background: '#1B1F3B',
                animationDelay: `${i * 0.18}s`,
                animationDuration: '0.9s',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Main widget
───────────────────────────────────────────────────────────────────────── */
export default function ZutsavAIWidget() {
  const { user } = useAuth();

  const [isOpen,   setIsOpen]   = useState(false);
  const [messages, setMessages] = useState([INITIAL_MSG]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [showTip,  setShowTip]  = useState(true);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  /* Scroll to bottom whenever messages / loading changes */
  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, isOpen]);

  /* Focus textarea on open */
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 320);
  }, [isOpen]);

  /* Auto-hide tooltip after 4 s */
  useEffect(() => {
    const t = setTimeout(() => setShowTip(false), 4000);
    return () => clearTimeout(t);
  }, []);

  /* External open trigger — e.g. from the AI Assistant dashboard page */
  useEffect(() => {
    const handle = () => setIsOpen(true);
    window.addEventListener('zutsav:openZutsavAI', handle);
    return () => window.removeEventListener('zutsav:openZutsavAI', handle);
  }, []);

  /* Auto-resize textarea */
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }, []);

  /* Send message */
  const send = useCallback(async (textOverride) => {
    const userText = (textOverride !== undefined ? textOverride : input).trim();
    if (!userText || loading) return;
    setError(null);

    /* Auth guard — avoids triggering the 401 → logout cycle for guests */
    if (!user) {
      setError('Please log in to chat with Zutsav AI.');
      return;
    }

    const userMsg = { role: 'user', text: userText, ts: Date.now() };
    const next    = [...messages, userMsg];
    setMessages(next);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const history = next.map(({ role, text }) => ({ role, text }));
      const { data } = await API.post('/ai/chat', { history });
      setMessages((prev) => [...prev, { role: 'model', text: data.reply, ts: Date.now() }]);
    } catch (err) {
      /* NEVER redirect or logout from the AI widget.
         The Axios interceptor already handles 401 cleanly via the
         zutsav:unauthorized event + AuthContext. Here we only show
         a user-friendly message without touching navigation. */
      const msg =
        err.response?.status === 503
          ? "Sorry, I'm unable to respond right now. Please try again in a few moments."
          : err.response?.status === 429
          ? "You're sending messages too quickly. Please wait a moment."
          : err.response?.data?.message || "Sorry, I couldn't respond. Please try again.";
      setError(msg);
      setMessages((prev) => prev.slice(0, -1)); // remove optimistic user msg
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, user]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }, [send]);

  const newChat = useCallback(() => {
    setMessages([{ ...INITIAL_MSG, ts: Date.now() }]);
    setInput('');
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const showSuggestions = messages.length === 1 && !loading;

  return (
    <>
      <style>{PANEL_STYLE}</style>

      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed right-4 md:right-6 z-[9998] w-[92vw] md:w-[380px] flex flex-col"
          style={{
            bottom: 'calc(3.5rem + 1.5rem + 0.5rem)',
            height: 'min(580px, calc(100dvh - 120px))',
            borderRadius: '24px',
            overflow: 'hidden',
            animation: 'zutsavAIUp 0.32s cubic-bezier(0.34,1.56,0.64,1) both',
            boxShadow:
              '0 24px 80px rgba(27,31,59,0.20),' +
              '0 8px 24px rgba(0,0,0,0.08),' +
              '0 0 0 1px rgba(212,175,55,0.18)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{
              background: 'linear-gradient(135deg,#1B1F3B 0%,#252960 55%,#1B1F3B 100%)',
              borderBottom: '1px solid rgba(212,175,55,0.12)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 select-none"
                style={{
                  background: 'rgba(212,175,55,0.12)',
                  border: '1px solid rgba(212,175,55,0.25)',
                }}
              >
                ✨
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm tracking-tight">
                    Zutsav AI
                  </span>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest select-none"
                    style={{
                      background: 'rgba(212,175,55,0.18)',
                      color: '#D4AF37',
                      border: '1px solid rgba(212,175,55,0.32)',
                    }}
                  >
                    Beta
                  </span>
                </div>
                <p
                  className="text-[10px] mt-0.5"
                  style={{ color: 'rgba(255,255,255,0.38)' }}
                >
                  Powered by Groq AI · Spiritual guidance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={newChat}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                title="New chat"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                <RotateCcw size={13} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3"
            style={{
              background: '#F5F3EE',
              overscrollBehavior: 'contain',
            }}
          >
            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}
            {loading && <TypingDots />}

            {error && (
              <div
                className="mx-1 px-3 py-2.5 rounded-xl text-xs text-center"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  color: '#dc2626',
                }}
              >
                {error}
                <button
                  className="ml-2 underline font-medium"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick suggestions (only on first message) */}
          {showSuggestions && (
            <div
              className="px-3 pb-2.5 pt-2 flex flex-wrap gap-1.5 shrink-0"
              style={{
                background: '#F5F3EE',
                borderTop: '1px solid rgba(27,31,59,0.07)',
              }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(255,255,255,0.88)',
                    border: '1px solid rgba(27,31,59,0.11)',
                    color: '#1B1F3B',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            className="px-3 pb-3 pt-2 shrink-0"
            style={{
              background: '#F5F3EE',
              borderTop: '1px solid rgba(27,31,59,0.09)',
            }}
          >
            <div
              className="flex items-end gap-2 rounded-2xl px-3 py-2"
              style={{
                background: 'rgba(255,255,255,0.95)',
                border: '1.5px solid rgba(27,31,59,0.10)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                className="flex-1 bg-transparent resize-none text-sm outline-none placeholder-gray-400"
                style={{
                  minHeight: '22px',
                  maxHeight: '96px',
                  lineHeight: '1.55',
                  color: '#1a1207',
                }}
                placeholder="Ask about poojas, festivals, astrology..."
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(); }}
                onKeyDown={handleKey}
                disabled={loading}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-40"
                style={{
                  background:
                    input.trim() && !loading
                      ? 'linear-gradient(135deg,#1B1F3B 0%,#2d3160 100%)'
                      : 'rgba(27,31,59,0.07)',
                  color:
                    input.trim() && !loading ? '#D4AF37' : 'rgba(0,0,0,0.28)',
                }}
                aria-label="Send message"
              >
                {loading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Send size={14} />}
              </button>
            </div>

            <p
              className="text-[10px] text-center mt-1.5"
              style={{ color: 'rgba(0,0,0,0.28)' }}
            >
              Shift + Enter for new line · AI can make mistakes
            </p>
          </div>
        </div>
      )}

      {/* ── Floating Trigger Button ──────────────────────────────────────── */}
      <div className="fixed bottom-5 right-4 md:right-6 z-[9999]">
        <div className="relative">
          {/* Pulse rings when closed */}
          {!isOpen && (
            <>
              <span
                className="absolute inset-0 rounded-full animate-ping pointer-events-none"
                style={{ background: 'rgba(212,175,55,0.22)', animationDuration: '2.6s' }}
              />
              <span
                className="absolute inset-0 rounded-full animate-ping pointer-events-none"
                style={{
                  background: 'rgba(27,31,59,0.11)',
                  animationDuration: '2.6s',
                  animationDelay: '0.65s',
                }}
              />
            </>
          )}

          {/* Tooltip */}
          {!isOpen && showTip && (
            <div
              className="absolute right-full top-1/2 mr-3 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap pointer-events-none select-none"
              style={{
                background: '#1B1F3B',
                color: '#D4AF37',
                transform: 'translateY(-50%)',
                boxShadow: '0 4px 16px rgba(27,31,59,0.32)',
                animation: 'zutsavAIUp 0.4s ease-out both',
              }}
            >
              Ask Zutsav AI ✨
              {/* Arrow */}
              <span
                className="absolute top-1/2 left-full"
                style={{
                  transform: 'translateY(-50%)',
                  width: 0, height: 0,
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderLeft: '6px solid #1B1F3B',
                }}
              />
            </div>
          )}

          {/* Main button */}
          <button
            onClick={() => { setIsOpen((o) => !o); setShowTip(false); }}
            className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 select-none"
            style={{
              background: 'linear-gradient(135deg,#1B1F3B 0%,#252960 100%)',
              boxShadow: isOpen
                ? '0 8px 32px rgba(27,31,59,0.52)'
                : '0 8px 32px rgba(27,31,59,0.32), 0 0 0 1.5px rgba(212,175,55,0.38)',
            }}
            aria-label={isOpen ? 'Close Zutsav AI' : 'Open Zutsav AI'}
          >
            <div style={{ color: '#D4AF37' }} className="transition-transform duration-300">
              {isOpen ? <X size={20} /> : <Sparkles size={20} />}
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
