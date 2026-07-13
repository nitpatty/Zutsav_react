import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl as IMG } from '../../config';

const AUTOPLAY_MS = 5000;
const KEN_BURNS_SCALE = 1.08;

// Default premium visual — shown whenever the admin hasn't uploaded any hero banners.
function DefaultVisual() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(circle at 50% 78%, rgba(255,183,77,0.9), rgba(245,158,11,0.5) 30%, transparent 55%), linear-gradient(180deg, #2A1810 0%, #4A2C2A 38%, #6B3A1F 68%, #A85A2A 100%)',
      }}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full animate-pulse-soft"
        style={{
          bottom: '8%',
          width: '46%',
          aspectRatio: '1',
          background: 'radial-gradient(circle, rgba(255,214,140,0.95), rgba(245,158,11,0.5) 45%, transparent 70%)',
          filter: 'blur(6px)',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-70">🪔</div>
    </div>
  );
}

export default function HeroSlider({ banners = [] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const dragStartX = useRef(null);

  const hasBanners = banners.length > 0;
  const count = banners.length;

  const goTo = useCallback((i) => {
    if (!hasBanners) return;
    setIndex(((i % count) + count) % count);
  }, [hasBanners, count]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Autoplay — infinite loop every 5s, paused on hover.
  useEffect(() => {
    if (!hasBanners || count < 2 || paused) return;
    timerRef.current = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(timerRef.current);
  }, [hasBanners, count, paused, next]);

  // Touch / mouse swipe via the unified Pointer Events API.
  const onPointerDown = (e) => { dragStartX.current = e.clientX; };
  const onPointerUp = (e) => {
    if (dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    if (delta > 50) prev();
    else if (delta < -50) next();
    dragStartX.current = null;
  };

  // Keyboard navigation.
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  };

  const current = hasBanners ? banners[index] : null;

  return (
    <div
      className="relative aspect-[4/3] sm:aspect-[4/3] lg:aspect-[4/5] rounded-[28px] md:rounded-[32px] overflow-hidden shadow-premium"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={hasBanners && count > 1 ? 0 : -1}
      role="region"
      aria-roledescription="carousel"
      aria-label="Homepage hero banners"
    >
      {!hasBanners && <DefaultVisual />}

      {hasBanners && (
        <AnimatePresence mode="wait">
          <motion.div
            key={current._id}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: KEN_BURNS_SCALE }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 1, ease: 'easeInOut' },
              scale: { duration: (AUTOPLAY_MS / 1000) + 1.2, ease: 'linear' },
            }}
          >
            {current.linkUrl ? (
              <a href={current.linkUrl} className="block w-full h-full">
                <img
                  src={IMG(current.image)}
                  alt={current.altText || ''}
                  className="w-full h-full object-cover"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchpriority={index === 0 ? 'high' : 'auto'}
                />
              </a>
            ) : (
              <img
                src={IMG(current.image)}
                alt={current.altText || ''}
                className="w-full h-full object-cover"
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchpriority={index === 0 ? 'high' : 'auto'}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent pointer-events-none" />
          </motion.div>
        </AnimatePresence>
      )}

      {hasBanners && count > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous banner"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-all z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-saffron-500"
          >
            <ChevronLeft size={16} className="text-gray-700" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next banner"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-all z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-saffron-500"
          >
            <ChevronRight size={16} className="text-gray-700" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {banners.map((b, i) => (
              <button
                key={b._id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to banner ${i + 1}`}
                aria-current={i === index}
                className={`rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-saffron-500 ${i === index ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
