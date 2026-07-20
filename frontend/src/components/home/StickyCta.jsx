import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const openGuidedAI = () =>
  window.dispatchEvent(new CustomEvent('zutsav:openZutsavAI', { detail: { mode: 'guided' } }));

export default function StickyCta() {
  const { t } = useTranslation();
  const [showSticky, setShowSticky] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('zu_sticky') === '1'
  );

  useEffect(() => {
    if (stickyDismissed) return;
    const onScroll = () => setShowSticky(window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [stickyDismissed]);

  const dismissSticky = () => {
    setStickyDismissed(true);
    sessionStorage.setItem('zu_sticky', '1');
    setShowSticky(false);
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 ${showSticky && !stickyDismissed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
    >
      <div className="flex items-center gap-4 bg-charcoal text-white px-6 py-3.5 rounded-2xl shadow-float"
        style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
        <span className="text-base">🙏</span>
        <span className="text-sm font-medium font-sans hidden sm:block">{t('home.stickyCta', 'Looking for the perfect puja?')}</span>
        <button onClick={openGuidedAI}
          className="text-sm font-bold px-5 py-2 rounded-xl transition-all duration-200 font-sans hover:opacity-90 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)' }}>
          {t('home.stickyCtaButton', 'Start with AI')}
        </button>
        <button onClick={dismissSticky} aria-label={t('home.dismiss', 'Dismiss')} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-all">
          <X size={14} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
}
