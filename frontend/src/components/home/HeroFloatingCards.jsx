import React from 'react';
import { Star, CheckCircle2, ShieldCheck, Zap, Sparkles } from 'lucide-react';

function Pill({ icon, text, delay = '0s', duration = '5s' }) {
  return (
    <div
      className="glass-card flex items-center gap-2 rounded-full pl-2.5 pr-4 py-2 w-fit animate-float"
      style={{ animationDelay: delay, animationDuration: duration }}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
      <span className="text-xs font-semibold text-gray-800 font-sans whitespace-nowrap">{text}</span>
    </div>
  );
}

// Premium glass badges balanced over the two upper/lower corners of the Hero
// image card — festival pill stays wired to real data; the rest are static
// trust signals (same content shown elsewhere in the hero's trust-row).
export default function HeroFloatingCards({ festivals, heroInView }) {
  const nextFestivalLabel = festivals.length > 0 ? festivals[0].name : 'Upcoming Festival';

  return (
    <>
      <div
        className={`hidden lg:flex flex-col gap-3 absolute top-6 -left-5 xl:-left-9 transition-all duration-1000 delay-300 ${heroInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}
      >
      </div>

      <div
        className={`hidden lg:flex flex-col gap-3 absolute bottom-6 -right-5 xl:-right-9 transition-all duration-1000 delay-500 ${heroInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
      >
      </div>
    </>
  );
}
