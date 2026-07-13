import React, { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';

export function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.1, ...options });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

export function useCounter(target, duration = 2000, active = false) {
  const [count, setCount] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [active, target, duration]);
  return count;
}

export function EyebrowTag({ children, light }) {
  if (light) return (
    <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-5"
      style={{ background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.35)', color: '#C9A84C' }}>
      {children}
    </div>
  );
  return <div className="tag-sacred mb-5">{children}</div>;
}

export function StarRating({ rating, size = 13 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  );
}

export function AnimatedStat({ stat, inView, delay }) {
  const isRating = stat.isRating;
  const raw = useCounter(isRating ? stat.end * 10 : stat.end, 2200, inView);
  let display;
  if (isRating) {
    display = (raw / 10).toFixed(1) + stat.suffix;
  } else if (stat.large) {
    display = Math.floor(raw / 1000) + 'K' + stat.suffix;
  } else {
    display = raw + stat.suffix;
  }
  return (
    <div
      className={`text-center py-8 px-6 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="text-3xl mb-3">{stat.icon}</div>
      <div className="font-display font-bold text-white mb-1 tabular-nums" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', letterSpacing: '-0.025em' }}>
        {display}
      </div>
      <div className="text-xs text-gray-400 tracking-widest uppercase font-sans">{stat.label}</div>
    </div>
  );
}
