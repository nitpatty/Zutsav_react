import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Star, CheckCircle, ChevronDown, Calendar } from 'lucide-react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLenis } from '../hooks/useLenis';

import HeroSlider from '../components/home/HeroSlider';
import HeroFloatingCards from '../components/home/HeroFloatingCards';
import StatsBanner from '../components/home/StatsBanner';
import PanchangDashboard from '../components/home/PanchangDashboard';
import PujaCategoryGrid from '../components/home/PujaCategoryGrid';
import PopularPujasSection from '../components/home/PopularPujasSection';
import PersonalizedSection from '../components/home/PersonalizedSection';
import JourneyPicker from '../components/home/JourneyPicker';
import FestivalsSection from '../components/home/FestivalsSection';
import TempleExplorerSection from '../components/home/TempleExplorerSection';
import MarketplacePreview from '../components/home/MarketplacePreview';
import AiGuideSection from '../components/home/AiGuideSection';
import HowItWorks from '../components/home/HowItWorks';
import WhyChooseZutsav from '../components/home/WhyChooseZutsav';
import Testimonials from '../components/home/Testimonials';
import FaqAccordion from '../components/home/FaqAccordion';
import FinalCta from '../components/home/FinalCta';
import StickyCta from '../components/home/StickyCta';
import { useInView } from '../components/home/shared';

// ─── Devotional content rotation (unrelated to Panchang astronomical data —
// actual Panchang values come from computePanchang() via GET /api/panchang) ───

const WEEKLY_MANTRAS = [
  { deity: 'Surya Dev',  mantra: 'ॐ सूर्याय नमः',       en: 'Om Suryaya Namah' },
  { deity: 'Shiva',      mantra: 'ॐ नमः शिवाय',         en: 'Om Namah Shivaya' },
  { deity: 'Mangal Dev', mantra: 'ॐ अंगारकाय नमः',     en: 'Om Angarakaya Namah' },
  { deity: 'Vishnu',     mantra: 'ॐ विष्णवे नमः',       en: 'Om Vishnave Namah' },
  { deity: 'Brihaspati', mantra: 'ॐ गुरवे नमः',         en: 'Om Gurave Namah' },
  { deity: 'Maa Durga',  mantra: 'ॐ दुर्गायै नमः',     en: 'Om Durgayai Namah' },
  { deity: 'Shani Dev',  mantra: 'ॐ शनैश्चराय नमः',   en: 'Om Shanaischaraya Namah' },
];

const SPIRITUAL_QUOTES = [
  { text: 'Do your duty to the best of your ability and leave the results to God.', src: 'Bhagavad Gita' },
  { text: 'Arise, awake, and stop not until the goal is reached.', src: 'Swami Vivekananda' },
  { text: 'Where there is righteousness in the heart, there is beauty in the character.', src: 'Hindu Wisdom' },
  { text: 'The greatest virtue is to love without expectation.', src: 'Vedic Teaching' },
  { text: 'He who has faith has all, and he who lacks faith lacks all.', src: 'Upanishads' },
  { text: 'Prayer is the steering wheel that keeps you on the right path.', src: 'Sanskrit Wisdom' },
  { text: 'Your soul is a temple. Keep it pure, keep it lit.', src: 'Vedic Proverb' },
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  useLenis();

  // Data states
  const [banners,        setBanners]        = useState([]);
  const [categories,     setCategories]     = useState([]);
  const [featuredPoojas, setFeaturedPoojas] = useState([]);
  const [festivals,      setFestivals]      = useState([]);
  const [temples,        setTemples]        = useState([]);
  const [products,       setProducts]       = useState([]);
  const [catLoading,     setCatLoading]     = useState(true);
  const [poojaLoading,   setPoojaLoading]   = useState(true);
  const [festivalLoading,setFestivalLoading]= useState(true);
  const [templeLoading,  setTempleLoading]  = useState(true);
  const [panchang,       setPanchang]       = useState(null);
  const [panchangLoading,setPanchangLoading]= useState(true);

  const [heroRef, heroInView] = useInView();

  // Devotional content rotation (day-of-week) — not Panchang astronomical
  // data, which is fetched from GET /api/panchang (computePanchang()) below.
  const today      = new Date();
  const dayOfWeek  = today.getDay();
  const mantra     = WEEKLY_MANTRAS[dayOfWeek];
  const quote      = SPIRITUAL_QUOTES[today.getDate() % SPIRITUAL_QUOTES.length];
  const dayNames   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr    = `${dayNames[dayOfWeek]}, ${today.getDate()} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;

  // Data fetching
  useEffect(() => {
    API.get('/hero-banners')
      .then(({ data }) => setBanners(data.banners || []))
      .catch(() => setBanners([]));

    API.get('/poojas/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => {})
      .finally(() => setCatLoading(false));

    API.get('/poojas?homepagePopular=true&limit=8')
      .then(({ data }) => setFeaturedPoojas(data.poojas || []))
      .catch(() => {})
      .finally(() => setPoojaLoading(false));

    API.get('/festivals?upcoming=true&limit=6')
      .then(({ data }) => setFestivals((data.festivals || []).filter((f) => f.name?.trim())))
      .catch(() => setFestivals([]))
      .finally(() => setFestivalLoading(false));

    API.get('/temples?homepageFeatured=true&limit=6')
      .then(({ data }) => setTemples(data.temples || []))
      .catch(() => setTemples([]))
      .finally(() => setTempleLoading(false));

    API.get('/marketplace/products?featured=true&limit=8')
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => setProducts([]));

    // Single Panchang fetch for today — computePanchang() is the only source
    // of Sunrise/Sunset/Rahu Kaal/Muhurat; reused as-is, never recomputed here.
    API.get('/panchang')
      .then(({ data }) => setPanchang(data.panchang || null))
      .catch(() => setPanchang(null))
      .finally(() => setPanchangLoading(false));
  }, []);

  const handleAiSubmit = (q) => {
    const query = (q || '').trim();
    if (!query) return;
    navigate(`/ai-assistant?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="overflow-hidden">

      {/* ══════════════════════════════════════════════════════════
          1. HERO — Split layout: text left, banner slider + floating cards right
      ══════════════════════════════════════════════════════════ */}
      <section
        className="relative min-h-[92vh] flex items-center overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #FAF6EE 0%, #FFF8F0 55%, #FAF6EE 100%)' }}
      >
        <div className="absolute inset-0 sacred-pattern pointer-events-none" />

        <div className="absolute top-1/2 right-0 translate-x-1/3 -translate-y-1/2 pointer-events-none select-none">
          {[800, 620, 440, 260].map((size, i) => (
            <div key={size} className="absolute rounded-full border border-saffron-300"
              style={{ width: size, height: size, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.10 - i * 0.02 }} />
          ))}
        </div>

        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-saffron-100 rounded-full blur-[150px] opacity-50 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-temple-100 rounded-full blur-[130px] opacity-35 translate-y-1/3 pointer-events-none" />

        {['🪔', '🌸', '✨', '🌺', '🙏', '🌿', '⭐', '🪷'].map((e, i) => (
          <span key={i} className="absolute pointer-events-none select-none animate-float"
            style={{ left: `${4 + i * 11}%`, top: `${8 + (i % 4) * 22}%`, fontSize: `${1.0 + (i % 3) * 0.3}rem`, animationDelay: `${i * 0.7}s`, animationDuration: `${4 + (i % 3) * 1.5}s`, opacity: 0.08 + (i % 2) * 0.04 }}>
            {e}
          </span>
        ))}

        <div ref={heroRef} className="container-pad relative z-10 w-full py-20 md:py-28">
          <div className="grid lg:grid-cols-[1fr_0.9fr] gap-12 xl:gap-20 items-center">

            {/* ── Left: Content ── */}
            <div className="max-w-2xl">
              {isAuthenticated && user ? (
                <div className={`flex items-center gap-3 mb-8 transition-all duration-700 ${heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center shadow-glow-saffron">
                    <span className="text-white text-xs font-bold font-sans">
                      {(user.name || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/80 border border-saffron-200/60 rounded-full px-4 py-2 shadow-sacred">
                    <span className="text-saffron-700 text-sm font-semibold font-sans">
                      Welcome back, {user.name?.split(' ')[0] || 'Devotee'}! 🙏
                    </span>
                  </div>
                </div>
              ) : (
                <div className={`flex mb-8 transition-all duration-700 ${heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                  <div className="inline-flex items-center gap-2.5 bg-white/80 border border-saffron-200/70 rounded-full px-5 py-2 shadow-sacred">
                    <span className="w-1.5 h-1.5 bg-saffron-500 rounded-full animate-pulse-soft" />
                    <span className="text-saffron-700 text-xs font-bold tracking-widest uppercase font-sans">India's Most Trusted Spiritual Platform</span>
                  </div>
                </div>
              )}

              <h1
                className={`font-display font-bold text-gray-900 leading-[0.92] mb-6 transition-all duration-700 delay-100 ${heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)', letterSpacing: '-0.03em' }}
              >
                Book Authentic
                <br />
                <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #D4602A 0%, #C9A84C 100%)' }}>
                  Pujas
                </span>{' '}
                Performed
                <br />
                by{' '}
                <span className="relative inline-block">
                  Verified
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg, #D4602A, #C9A84C)' }} />
                </span>{' '}
                Pandits
              </h1>

              <p className={`font-sans text-lg text-gray-500 max-w-xl mb-9 leading-relaxed transition-all duration-700 delay-150 ${heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                Connect with KYC-verified pandits, celebrate every festival, and discover authentic puja samagri — all in one sacred space.
              </p>

              <div className={`flex flex-wrap gap-4 mb-8 transition-all duration-700 delay-200 ${heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <Link to="/poojas" className="btn-primary px-8 py-4 rounded-2xl text-base shadow-glow-saffron inline-flex items-center gap-2">
                  Book a Puja <ArrowRight size={17} />
                </Link>
                <Link to="/festivals" className="btn-secondary px-8 py-4 rounded-2xl text-base inline-flex items-center gap-2">
                  Explore Festivals <Calendar size={16} />
                </Link>
              </div>

              <div className={`flex flex-wrap gap-2 mb-8 transition-all duration-700 delay-300 ${heroInView ? 'opacity-100' : 'opacity-0'}`}>
                {[
                  { label: 'Find a Temple',  to: '/temples',     icon: '🛕' },
                  { label: 'Shop Samagri',   to: '/marketplace', icon: '🪔' },
                  { label: 'Daily Panchang', to: '/panchang',    icon: '📅' },
                  { label: 'AI Guide',       to: '/ai-assistant',icon: '✨' },
                ].map(({ label, to, icon }) => (
                  <Link key={label} to={to}
                    className="flex items-center gap-1.5 bg-white/80 border border-gray-200/80 hover:border-saffron-300 hover:bg-saffron-50 text-gray-600 hover:text-saffron-700 text-sm font-medium px-4 py-2 rounded-full transition-all duration-200 shadow-sm font-sans">
                    <span>{icon}</span>{label}
                  </Link>
                ))}
              </div>

              <div className={`flex flex-wrap gap-3 transition-all duration-700 delay-500 ${heroInView ? 'opacity-100' : 'opacity-0'}`}>
                {[
                  { icon: CheckCircle, text: 'KYC Verified' },
                  { icon: Shield,      text: 'Secure Payments' },
                  { icon: Star,        text: '4.9★ Rated' },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5 bg-white/80 border border-white/90 px-3.5 py-1.5 rounded-full shadow-sm text-gray-500 font-sans text-xs">
                    <Icon size={12} className="text-saffron-500" />{text}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Right: Hero banner slider + floating info cards ── */}
            <div className={`relative mt-12 lg:mt-0 px-2 sm:px-6 lg:px-0 transition-all duration-1000 delay-300 ${heroInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
              <HeroSlider banners={banners} />
              <HeroFloatingCards festivals={festivals} heroInView={heroInView} />
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-25">
          <span className="text-[10px] font-medium tracking-widest uppercase text-gray-500 font-sans">Scroll</span>
          <ChevronDown size={14} className="text-gray-400 animate-bounce" />
        </div>
      </section>

      <StatsBanner />

      <PanchangDashboard mantra={mantra} quote={quote} dateStr={dateStr} panchang={panchang} loading={panchangLoading} />

      <PujaCategoryGrid categories={categories} loading={catLoading} />

      <PopularPujasSection poojas={featuredPoojas} loading={poojaLoading} />

      <PersonalizedSection isAuthenticated={isAuthenticated} user={user} />

      <JourneyPicker featuredPoojas={featuredPoojas} handleAiSubmit={handleAiSubmit} />

      <FestivalsSection festivals={festivals} loading={festivalLoading} />

      <TempleExplorerSection temples={temples} loading={templeLoading} />

      <MarketplacePreview products={products} />

      <AiGuideSection handleAiSubmit={handleAiSubmit} />

      <HowItWorks />

      <WhyChooseZutsav />

      <Testimonials />

      <FaqAccordion handleAiSubmit={handleAiSubmit} />

      <FinalCta />

      <StickyCta />

    </div>
  );
}
