import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function FinalCta() {
  return (
    <section
      className="section-pad-sm text-white relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #5A0000 0%, #8f3800 40%, #D4602A 100%)' }}
    >
      <div className="absolute inset-0 sacred-pattern opacity-10 pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-saffron-400 rounded-full blur-[90px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-temple-400 rounded-full blur-[90px] opacity-15 pointer-events-none" />
      <div className="container-pad relative text-center">
        <div className="text-5xl mb-5">🙏</div>
        <h2 className="font-display font-bold mb-4 leading-tight" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '-0.03em' }}>
          Connect with
          <br />
          the Divine Today
        </h2>
        <p className="text-saffron-100 mb-10 text-lg max-w-xl mx-auto font-sans leading-relaxed">
          Book your first puja and experience authentic spiritual service delivered to your door.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/poojas"
            className="inline-flex items-center justify-center gap-2 bg-white text-saffron-700 font-bold px-9 py-4 rounded-2xl hover:bg-saffron-50 transition-all duration-200 shadow-luxury hover:-translate-y-0.5 font-sans">
            Book a Puja <ArrowRight size={18} />
          </Link>
          <Link to="/register"
            className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-9 py-4 rounded-2xl hover:bg-white/10 hover:border-white/60 transition-all duration-200 font-sans">
            Create Free Account
          </Link>
        </div>
      </div>
    </section>
  );
}
