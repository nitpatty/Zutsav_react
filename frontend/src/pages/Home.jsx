import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Shield, Clock, Star, Users, CheckCircle,
  ChevronDown, MapPin, ShoppingBag, Search,
  Sun, Calendar, BookOpen,
  TrendingUp, MessageSquare, ChevronLeft, ChevronRight,
  Award, CreditCard, Headphones, FileText,
  X, Send, Sparkles, Heart, Home as HomeIcon,
} from 'lucide-react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatDuration } from '../utils/durationFormatter';

// ─── Image helper ──────────────────────────────────────────────────────────────
const IMG = (p) => (p ? `http://localhost:5000/${p}` : null);

// ─── Static data ───────────────────────────────────────────────────────────────

const STATS = [
  { end: 10000, suffix: '+',  label: 'Pujas Completed',  icon: '🙏', large: true },
  { end: 500,   suffix: '+',  label: 'Verified Pandits', icon: '📿' },
  { end: 50,    suffix: '+',  label: 'Cities Covered',   icon: '🛕' },
  { end: 98,    suffix: '%',  label: 'Happy Families',   icon: '🏠' },
  { end: 49,    suffix: '★',  label: 'Customer Rating',  icon: '⭐', isRating: true },
];

const RAHU_KAAL = [
  '4:30 PM – 6:00 PM',   // Sun
  '7:30 AM – 9:00 AM',   // Mon
  '3:00 PM – 4:30 PM',   // Tue
  '12:00 PM – 1:30 PM',  // Wed
  '1:30 PM – 3:00 PM',   // Thu
  '10:30 AM – 12:00 PM', // Fri
  '9:00 AM – 10:30 AM',  // Sat
];

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

const JOURNEY_INTENTS = [
  { id: 'career',     label: 'Career',       emoji: '💼', desc: 'Growth & Success',    gFrom: 'from-blue-50',    gTo: 'to-indigo-50',   bdr: 'border-blue-100',   keywords: ['saraswati','lakshmi','ganesha','career','success'] },
  { id: 'marriage',   label: 'Marriage',     emoji: '💑', desc: 'Love & Union',        gFrom: 'from-pink-50',    gTo: 'to-rose-50',     bdr: 'border-pink-100',   keywords: ['vivah','marriage','manglik','love'] },
  { id: 'health',     label: 'Health',       emoji: '🌿', desc: 'Wellness & Healing',  gFrom: 'from-green-50',   gTo: 'to-emerald-50',  bdr: 'border-green-100',  keywords: ['mahamrityunjaya','health','dhanvantari','healing'] },
  { id: 'business',   label: 'Business',     emoji: '📈', desc: 'Prosperity & Growth', gFrom: 'from-amber-50',   gTo: 'to-yellow-50',   bdr: 'border-amber-100',  keywords: ['lakshmi','kuber','vyapar','business','prosperity'] },
  { id: 'new-home',   label: 'New Home',     emoji: '🏠', desc: 'Gruhapravesh',        gFrom: 'from-orange-50',  gTo: 'to-saffron-50',  bdr: 'border-orange-100', keywords: ['gruhapravesh','vastu','home','ganesha'] },
  { id: 'child',      label: 'Child',        emoji: '👶', desc: 'Blessing & Joy',      gFrom: 'from-yellow-50',  gTo: 'to-amber-50',    bdr: 'border-yellow-100', keywords: ['santana','child','baby','gopal'] },
  { id: 'prosperity', label: 'Prosperity',   emoji: '🪙', desc: 'Wealth & Abundance',  gFrom: 'from-temple-50',  gTo: 'to-yellow-50',   bdr: 'border-temple-100', keywords: ['lakshmi','kuber','akshaya','wealth'] },
  { id: 'peace',      label: 'Peace',        emoji: '🕊️', desc: 'Inner Calm',          gFrom: 'from-sky-50',     gTo: 'to-blue-50',     bdr: 'border-sky-100',    keywords: ['shanti','satyanarayan','peace','rudra'] },
  { id: 'protection', label: 'Protection',   emoji: '🛡️', desc: 'Safety & Guard',      gFrom: 'from-rose-50',    gTo: 'to-red-50',      bdr: 'border-rose-100',   keywords: ['sudarshana','hanuman','kavach','protection'] },
];

const TEMPLES = [
  { name: 'Kashi Vishwanath',  loc: 'Varanasi, UP',      emoji: '🛕', desc: 'One of the most ancient Jyotirlinga temples of Lord Shiva, on the banks of Ganga.', gFrom: 'from-orange-100', gTo: 'to-amber-50' },
  { name: 'Ram Mandir',        loc: 'Ayodhya, UP',       emoji: '🏯', desc: 'The magnificent new Ram Mandir in the sacred birthplace of Lord Rama.', gFrom: 'from-saffron-100', gTo: 'to-yellow-50' },
  { name: 'Mahakaleshwar',     loc: 'Ujjain, MP',        emoji: '🕉️', desc: 'Sacred Jyotirlinga of Lord Shiva on the banks of the holy Shipra river.', gFrom: 'from-rose-100',   gTo: 'to-pink-50' },
  { name: 'Kedarnath',         loc: 'Rudraprayag, UK',   emoji: '⛰️', desc: 'High-altitude Jyotirlinga shrine of Shiva in the Garhwal Himalayas.', gFrom: 'from-sky-100',    gTo: 'to-blue-50' },
  { name: 'Badrinath',         loc: 'Chamoli, UK',       emoji: '🏔️', desc: 'Sacred Vishnu temple amidst the Himalayas — one of the four Char Dham.', gFrom: 'from-emerald-100', gTo: 'to-teal-50' },
  { name: 'Tirupati Balaji',   loc: 'Tirupati, AP',      emoji: '🛕', desc: 'The most visited religious site in the world — abode of Lord Venkateswara.', gFrom: 'from-violet-100', gTo: 'to-purple-50' },
];

const AI_QUESTIONS = [
  'What pooja should I do for my new home?',
  'Best muhurat for marriage in 2025?',
  'Importance of Satyanarayan Katha?',
  'How to perform Diwali puja at home?',
  'When is the next Ekadashi fast?',
];

const FEATURES = [
  { icon: Shield,      title: 'KYC-Verified Pandits', desc: 'Government ID check and background verification before every pandit joins.' },
  { icon: Clock,       title: 'On-Time, Every Time',  desc: 'Punctual, professional ceremony delivery at your scheduled time.' },
  { icon: CreditCard,  title: 'Secure Payments',      desc: 'Encrypted PhonePe UPI & card payments. Fully safe, fully transparent.' },
  { icon: TrendingUp,  title: 'Live Tracking',        desc: 'Real-time WhatsApp notifications for every booking milestone.' },
  { icon: Award,       title: 'Premium Experience',   desc: 'Authentic rituals delivered with modern convenience and grace.' },
  { icon: FileText,    title: 'GST Invoice',          desc: 'Official GST invoices for every service. Ethical, transparent pricing.' },
];

const STEPS = [
  { num: '01', title: 'Choose Your Pooja',  desc: 'Browse curated poojas and havans for every occasion.', icon: '🙏' },
  { num: '02', title: 'Select Date & Time', desc: 'Pick a slot that works for you — we work around your schedule.', icon: '📅' },
  { num: '03', title: 'Pandit Arrives',     desc: 'A verified pandit arrives with all required samagri.', icon: '🪔' },
];

const TESTIMONIALS = [
  { name: 'Priya Sharma', city: 'New Delhi',  rating: 5, initials: 'PS', color: 'from-saffron-400 to-saffron-600', text: 'Satyanarayan Pooja at my new home was absolutely flawless. The pandit was knowledgeable, arrived right on time, and the entire experience was deeply spiritual.' },
  { name: 'Rajesh Kumar', city: 'Mumbai',     rating: 5, initials: 'RK', color: 'from-temple-400 to-temple-600',   text: "I've booked three different poojas through Zutsav and each experience has been exceptional. The platform is intuitive and the pandits are genuinely learned." },
  { name: 'Anita Patel',  city: 'Ahmedabad', rating: 5, initials: 'AP', color: 'from-rose-400 to-rose-600',       text: 'The marketplace saved me so much time before Navratri. Authentic samagri delivered fresh to my door — fair prices and beautiful packaging.' },
  { name: 'Suresh Iyer',  city: 'Chennai',   rating: 5, initials: 'SI', color: 'from-emerald-400 to-emerald-600', text: 'Booked Ganesh Sthapana for our new office. The pandit was knowledgeable, the samagri kit was complete, and the vibrations were wonderful.' },
];

const FAQS = [
  { q: 'How does Zutsav work?',            a: 'Select a pooja, enter your details, make payment, and we assign a verified pandit to your home for the ceremony.' },
  { q: 'Are the pandits verified?',         a: 'Yes. Every pandit undergoes KYC verification including government ID check and background screening before joining.' },
  { q: 'Can I book for a specific date?',   a: 'Absolutely. You choose the exact date and time during the booking flow and we accommodate your schedule.' },
  { q: 'What is the payment process?',      a: 'We use PhonePe for secure UPI, card, and net-banking payments. All transactions are fully encrypted.' },
  { q: 'How do I get pandit contact info?', a: 'Once admin assigns a pandit, you receive their name and contact via WhatsApp notification immediately.' },
  { q: 'Do you provide puja samagri?',      a: 'Yes! Choose the optional Samagri Kit during booking and we deliver everything fresh to your doorstep before the puja.' },
];

const CAT_GRADIENTS = [
  'from-amber-50 to-orange-50 border-orange-100 hover:border-orange-200',
  'from-rose-50 to-pink-50 border-rose-100 hover:border-rose-200',
  'from-violet-50 to-purple-50 border-violet-100 hover:border-violet-200',
  'from-emerald-50 to-teal-50 border-emerald-100 hover:border-emerald-200',
  'from-sky-50 to-blue-50 border-sky-100 hover:border-sky-200',
  'from-yellow-50 to-amber-50 border-yellow-100 hover:border-yellow-200',
];
const CAT_ICON_BG = [
  'bg-orange-100 text-orange-600',
  'bg-rose-100 text-rose-600',
  'bg-violet-100 text-violet-600',
  'bg-emerald-100 text-emerald-600',
  'bg-sky-100 text-sky-600',
  'bg-yellow-100 text-yellow-600',
];

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useInView(options = {}) {
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

function useCounter(target, duration = 2000, active = false) {
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

// ─── Small components ──────────────────────────────────────────────────────────

function EyebrowTag({ children, light }) {
  if (light) return (
    <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-5"
      style={{ background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.35)', color: '#C9A84C' }}>
      {children}
    </div>
  );
  return <div className="tag-sacred mb-5">{children}</div>;
}

function StarRating({ rating, size = 13 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  );
}

function FaqItem({ faq, index, open, toggle }) {
  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${open ? 'border-saffron-200 shadow-sacred' : 'border-gray-100 bg-white'}`}>
      <button
        onClick={() => toggle(index)}
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

function AnimatedStat({ stat, inView, delay }) {
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Data states
  const [categories,    setCategories]    = useState([]);
  const [featuredPoojas,setFeaturedPoojas]= useState([]);
  const [festivals,     setFestivals]     = useState([]);
  const [products,      setProducts]      = useState([]);
  const [catLoading,    setCatLoading]    = useState(true);
  const [poojaLoading,  setPoojaLoading]  = useState(true);
  const [festivalLoading,setFestivalLoading]= useState(true);

  // UI states
  const [faqOpen,          setFaqOpen]          = useState(null);
  const [activeJourney,    setActiveJourney]    = useState(null);
  const [activeTestimonial,setActiveTestimonial]= useState(0);
  const [aiQuery,          setAiQuery]          = useState('');
  const [showSticky,       setShowSticky]       = useState(false);
  const [stickyDismissed,  setStickyDismissed]  = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('zu_sticky') === '1'
  );

  // Section visibility
  const [heroRef,     heroInView]     = useInView();
  const [statsRef,    statsInView]    = useInView();
  const [panchangRef, panchangInView] = useInView();
  const [catRef,      catInView]      = useInView();
  const [poojaRef,    poojaInView]    = useInView();
  const [journeyRef,  journeyInView]  = useInView();
  const [festivalRef, festivalInView] = useInView();
  const [templeRef,   templeInView]   = useInView();
  const [aiRef,       aiInView]       = useInView();
  const [featuresRef, featuresInView] = useInView();
  const [testRef,     testInView]     = useInView();
  const [mktRef,      mktInView]      = useInView();
  const [personalRef, personalInView] = useInView();

  const carouselRef = useRef(null);

  // Computed panchang values
  const today      = new Date();
  const dayOfWeek  = today.getDay();
  const mantra     = WEEKLY_MANTRAS[dayOfWeek];
  const rahuKaal   = RAHU_KAAL[dayOfWeek];
  const quote      = SPIRITUAL_QUOTES[today.getDate() % SPIRITUAL_QUOTES.length];
  const dayNames   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr    = `${dayNames[dayOfWeek]}, ${today.getDate()} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;

  // Data fetching
  useEffect(() => {
    API.get('/poojas/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => {})
      .finally(() => setCatLoading(false));

    API.get('/poojas?featured=true&limit=6')
      .then(({ data }) => setFeaturedPoojas(data.poojas || []))
      .catch(() => {})
      .finally(() => setPoojaLoading(false));

    API.get('/festivals?upcoming=true&limit=6')
      .then(({ data }) => setFestivals((data.festivals || []).filter((f) => f.name?.trim())))
      .catch(() => setFestivals([]))
      .finally(() => setFestivalLoading(false));

    API.get('/marketplace/products?featured=true&limit=8')
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => setProducts([]));
  }, []);

  // Sticky CTA on scroll
  useEffect(() => {
    if (stickyDismissed) return;
    const onScroll = () => setShowSticky(window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [stickyDismissed]);

  // Testimonial auto-advance
  useEffect(() => {
    const t = setInterval(() => setActiveTestimonial(p => (p + 1) % TESTIMONIALS.length), 5500);
    return () => clearInterval(t);
  }, []);

  // Helpers
  const dismissSticky = () => {
    setStickyDismissed(true);
    sessionStorage.setItem('zu_sticky', '1');
    setShowSticky(false);
  };
  const toggleFaq = (i) => setFaqOpen(faqOpen === i ? null : i);
  const handleAiSubmit = (q) => {
    const query = q || aiQuery;
    if (!query.trim()) return;
    navigate(`/ai-assistant?q=${encodeURIComponent(query.trim())}`);
  };
  const scrollCarousel = (dir) => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
    }
  };

  // Journey recommendations
  const selectedIntent = JOURNEY_INTENTS.find(j => j.id === activeJourney);
  const journeyRecs = selectedIntent
    ? featuredPoojas.filter(p => {
        const hay = (p.name + ' ' + (p.shortDesc || '')).toLowerCase();
        return selectedIntent.keywords.some(kw => hay.includes(kw));
      }).slice(0, 3)
    : [];
  const staticJourneyRecs = selectedIntent
    ? selectedIntent.keywords.slice(0, 3).map((kw, i) => ({
        name: kw.charAt(0).toUpperCase() + kw.slice(1) + ' Puja',
        slug: kw,
        _id: `static-${i}`,
      }))
    : [];
  const recsToShow = journeyRecs.length > 0 ? journeyRecs : staticJourneyRecs;

  return (
    <div className="overflow-hidden">

      {/* ══════════════════════════════════════════════════════════
          1. HERO — Split layout: text left, floating cards right
      ══════════════════════════════════════════════════════════ */}
      <section
        className="relative min-h-[92vh] flex items-center overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #FAF6EE 0%, #FFF8F0 55%, #FAF6EE 100%)' }}
      >
        {/* Sacred dot pattern */}
        <div className="absolute inset-0 sacred-pattern pointer-events-none" />

        {/* Concentric mandala rings */}
        <div className="absolute top-1/2 right-0 translate-x-1/3 -translate-y-1/2 pointer-events-none select-none">
          {[800, 620, 440, 260].map((size, i) => (
            <div key={size} className="absolute rounded-full border border-saffron-300"
              style={{ width: size, height: size, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.10 - i * 0.02 }} />
          ))}
        </div>

        {/* Ambient glows */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-saffron-100 rounded-full blur-[150px] opacity-50 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-temple-100 rounded-full blur-[130px] opacity-35 translate-y-1/3 pointer-events-none" />

        {/* Floating emoji particles */}
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
              {/* Auth-aware greeting */}
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

              {/* Headline */}
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

              {/* Description */}
              <p className={`font-sans text-lg text-gray-500 max-w-xl mb-9 leading-relaxed transition-all duration-700 delay-150 ${heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                Connect with KYC-verified pandits, celebrate every festival, and discover authentic puja samagri — all in one sacred space.
              </p>

              {/* Primary CTAs */}
              <div className={`flex flex-wrap gap-4 mb-8 transition-all duration-700 delay-200 ${heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <Link to="/poojas" className="btn-primary px-8 py-4 rounded-2xl text-base shadow-glow-saffron inline-flex items-center gap-2">
                  Book a Puja <ArrowRight size={17} />
                </Link>
                <Link to="/festivals" className="btn-secondary px-8 py-4 rounded-2xl text-base inline-flex items-center gap-2">
                  Explore Festivals <Calendar size={16} />
                </Link>
              </div>

              {/* Quick chips */}
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

              {/* Trust badges */}
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

            {/* ── Right: Floating Info Cards ── */}
            <div className={`hidden lg:flex flex-col gap-4 transition-all duration-1000 delay-300 ${heroInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
              {/* Card 1: Today's Muhurat */}
              <div className="glass-card rounded-3xl p-6 shadow-premium animate-float" style={{ animationDuration: '5s' }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-100 to-yellow-50 rounded-2xl flex items-center justify-center">
                    <Sun size={20} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase text-amber-600 font-sans">Today's Muhurat</p>
                    <p className="text-xs text-gray-400 font-sans">{dateStr}</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-display font-bold text-2xl text-gray-900" style={{ letterSpacing: '-0.02em' }}>11:36 AM</span>
                  <span className="text-gray-400 text-sm font-sans">– 12:24 PM</span>
                </div>
                <p className="text-xs text-gray-500 font-sans mb-3">Abhijit Muhurat — Most auspicious period</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse-soft" />
                  <span className="text-xs text-green-600 font-semibold font-sans">Ideal for new beginnings</span>
                </div>
              </div>

              {/* Cards row: Upcoming Festival + Rahu Kaal */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card rounded-3xl p-5 shadow-card animate-float" style={{ animationDuration: '6s', animationDelay: '1s' }}>
                  <div className="text-2xl mb-3">🎉</div>
                  <p className="text-xs font-bold tracking-widest uppercase mb-1 font-sans" style={{ color: '#C9A84C' }}>Next Festival</p>
                  {festivals.length > 0 ? (
                    <>
                      <p className="font-display font-bold text-gray-900 text-sm leading-snug mb-1">{festivals[0].name}</p>
                      <p className="text-xs text-gray-400 font-sans">
                        {(() => {
                          const d = new Date(festivals[0].date);
                          const diff = Math.ceil((d - new Date()) / 86400000);
                          return diff === 0 ? 'Today!' : diff > 0 ? `${diff} days left` : '';
                        })()}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 font-sans">Loading...</p>
                  )}
                </div>

                <div className="glass-card rounded-3xl p-5 shadow-card animate-float" style={{ animationDuration: '4.5s', animationDelay: '0.5s' }}>
                  <div className="text-2xl mb-3">⚠️</div>
                  <p className="text-xs font-bold tracking-widest uppercase mb-1 text-rose-500 font-sans">Rahu Kaal</p>
                  <p className="font-sans font-semibold text-gray-800 text-xs leading-relaxed">{rahuKaal}</p>
                  <p className="text-xs text-gray-400 font-sans mt-1">Avoid this period</p>
                </div>
              </div>

              {/* Stat badges row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-saffron-50 to-orange-50 border border-saffron-100 rounded-2xl p-4">
                  <p className="font-display font-bold text-3xl text-saffron-700 mb-0.5">500+</p>
                  <p className="text-xs text-saffron-600 font-semibold tracking-wide font-sans">Verified Pandits</p>
                </div>
                <div className="bg-gradient-to-br from-temple-50 to-yellow-50 border border-temple-100 rounded-2xl p-4">
                  <p className="font-display font-bold text-3xl text-temple-700 mb-0.5">50+</p>
                  <p className="text-xs text-temple-600 font-semibold tracking-wide font-sans">Cities Served</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-25">
          <span className="text-[10px] font-medium tracking-widest uppercase text-gray-500 font-sans">Scroll</span>
          <ChevronDown size={14} className="text-gray-400 animate-bounce" />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          2. ANIMATED TRUST STATISTICS
      ══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}>
        <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
        <div ref={statsRef} className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-5 divide-y-2 md:divide-y-0 md:divide-x divide-white/[0.06]">
            {STATS.map((s, i) => (
              <AnimatedStat key={s.label} stat={s} inView={statsInView} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          3. TODAY'S SPIRITUAL DASHBOARD (Panchang)
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad" style={{ background: '#FAF6EE' }}>
        <div ref={panchangRef} className="container-pad">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <EyebrowTag>Daily Sacred Guide</EyebrowTag>
              <h2 className="section-title">Today's Spiritual Dashboard</h2>
              <p className="section-subtitle">{dateStr}</p>
            </div>
            <Link to="/panchang" className="text-saffron-600 font-semibold text-sm flex items-center gap-1.5 hover:gap-2.5 transition-all font-sans">
              Full Panchang <ArrowRight size={14} />
            </Link>
          </div>

          {/* Horizontal scroll strip */}
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4">
            {[
              {
                icon: '🌅', title: 'Sunrise', value: '6:02 AM', sub: 'Brahma Muhurta: 4:26 AM',
                gFrom: 'from-yellow-50', gTo: 'to-orange-50', border: 'border-yellow-100', textColor: 'text-orange-600',
              },
              {
                icon: '🌇', title: 'Sunset', value: '7:18 PM', sub: 'Golden hour: 6:30 PM',
                gFrom: 'from-rose-50', gTo: 'to-orange-50', border: 'border-rose-100', textColor: 'text-rose-600',
              },
              {
                icon: '⚠️', title: 'Rahu Kaal', value: rahuKaal, sub: 'Avoid this period',
                gFrom: 'from-red-50', gTo: 'to-rose-50', border: 'border-red-100', textColor: 'text-red-600',
              },
              {
                icon: '✨', title: 'Abhijit Muhurat', value: '11:36 – 12:24', sub: 'Most auspicious time',
                gFrom: 'from-emerald-50', gTo: 'to-green-50', border: 'border-emerald-100', textColor: 'text-emerald-600',
              },
              {
                icon: '📿', title: 'Today\'s Deity', value: mantra.deity, sub: 'Day of devotion',
                gFrom: 'from-violet-50', gTo: 'to-purple-50', border: 'border-violet-100', textColor: 'text-violet-600',
              },
              {
                icon: '🕉️', title: 'Today\'s Mantra', value: mantra.mantra, sub: mantra.en, isMantra: true,
                gFrom: 'from-saffron-50', gTo: 'to-amber-50', border: 'border-saffron-100', textColor: 'text-saffron-700',
              },
              {
                icon: '💬', title: 'Today\'s Wisdom', value: quote.text, sub: `— ${quote.src}`, isQuote: true,
                gFrom: 'from-sky-50', gTo: 'to-blue-50', border: 'border-sky-100', textColor: 'text-sky-600',
              },
            ].map(({ icon, title, value, sub, isMantra, isQuote, gFrom, gTo, border, textColor }, i) => (
              <div
                key={title}
                className={`shrink-0 w-56 bg-gradient-to-br ${gFrom} ${gTo} border ${border} rounded-3xl p-5 transition-all duration-500 hover:shadow-card hover:-translate-y-1 ${panchangInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <div className="text-2xl mb-3">{icon}</div>
                <p className={`text-xs font-bold tracking-widest uppercase mb-2 font-sans ${textColor}`}>{title}</p>
                <p className={`font-display font-bold leading-snug mb-1 ${isMantra ? 'text-lg' : isQuote ? 'text-xs leading-relaxed' : 'text-xl'} text-gray-900`}
                  style={{ letterSpacing: isMantra ? '0.02em' : '-0.01em' }}>
                  {value}
                </p>
                <p className="text-xs text-gray-500 font-sans leading-snug">{sub}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 font-sans mt-4 text-center">
            Timings are approximate. For precise values, view{' '}
            <Link to="/panchang" className="text-saffron-600 font-semibold hover:underline">Full Panchang →</Link>
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          4. PUJA CATEGORIES
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad bg-white">
        <div ref={catRef} className="container-pad">
          <div className="text-center mb-14">
            <EyebrowTag>Our Services</EyebrowTag>
            <h2 className="section-title">Browse by Category</h2>
            <p className="section-subtitle mx-auto text-center">
              From Gruhapravesh to Satyanarayan — find the perfect puja for every occasion
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {catLoading
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 skeleton rounded-2xl" />)
              : categories.map((cat, i) => (
                  <Link key={cat._id} to={`/poojas/${cat.slug}`}
                    className={`group flex flex-col items-center p-5 rounded-3xl bg-gradient-to-br ${CAT_GRADIENTS[i % CAT_GRADIENTS.length]} border transition-all duration-300 text-center hover:shadow-card hover:-translate-y-1.5 ${catInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
                    style={{ transitionDelay: `${i * 60}ms` }}>
                    <div className={`w-14 h-14 ${CAT_ICON_BG[i % CAT_ICON_BG.length]} rounded-2xl flex items-center justify-center mb-3 overflow-hidden transition-transform duration-300 group-hover:scale-110`}>
                      {cat.image
                        ? <img src={IMG(cat.image)} alt={cat.name} className="w-full h-full object-cover" />
                        : <span className="text-2xl">🙏</span>}
                    </div>
                    <span className="text-xs font-semibold text-gray-700 group-hover:text-saffron-700 transition-colors leading-tight font-sans">{cat.name}</span>
                  </Link>
                ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/poojas" className="btn-outline inline-flex items-center gap-2">
              View All Categories <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          5. POPULAR POOJAS — Premium card redesign
      ══════════════════════════════════════════════════════════ */}
      {(poojaLoading || featuredPoojas.length > 0) && (
        <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
          <div ref={poojaRef} className="container-pad">
            <div className="flex items-end justify-between mb-14 flex-wrap gap-4">
              <div>
                <EyebrowTag>Most Booked</EyebrowTag>
                <h2 className="section-title">Popular Poojas</h2>
              </div>
              <Link to="/poojas" className="text-saffron-600 font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all font-sans">
                View All <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {poojaLoading
                ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-96 skeleton rounded-3xl" />)
                : featuredPoojas.map((p, i) => (
                    <div key={p._id}
                      className={`group bg-white rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-premium hover:-translate-y-2 ${poojaInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                      style={{ transitionDelay: `${i * 80}ms`, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

                      {/* Image */}
                      <div className="relative h-56 bg-gradient-to-br from-saffron-50 to-orange-50 overflow-hidden">
                        {IMG(p.image)
                          ? <img src={IMG(p.image)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                          : <div className="w-full h-full flex items-center justify-center text-6xl">🪔</div>}
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex gap-2">
                          {p.isFeatured && (
                            <span className="text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm font-sans"
                              style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C85A)' }}>
                              ✦ Featured
                            </span>
                          )}
                          {formatDuration(p) && (
                            <span className="bg-black/40 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full font-sans backdrop-blur-sm">
                              ⏱ {formatDuration(p)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-6">
                        <h3 className="font-display font-bold text-gray-900 text-xl leading-snug mb-2" style={{ letterSpacing: '-0.01em' }}>
                          {p.name}
                        </h3>
                        <p className="text-sm text-gray-400 line-clamp-2 mb-5 font-sans leading-relaxed">{p.shortDesc}</p>

                        {/* Divider */}
                        <div className="h-px bg-gray-100 mb-5" />

                        {/* Price + CTA */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-400 font-sans mb-0.5">Starting from</p>
                            <div className="flex items-baseline gap-2">
                              <span className="font-display text-2xl font-bold text-saffron-600">
                                ₹{(p.salePrice || p.price).toLocaleString('en-IN')}
                              </span>
                              {p.mrp && p.mrp > (p.salePrice || p.price) && (
                                <span className="text-sm text-gray-300 line-through font-sans">₹{p.mrp.toLocaleString('en-IN')}</span>
                              )}
                            </div>
                          </div>
                          <Link to={`/book/${p.slug}`} onClick={e => e.stopPropagation()}
                            className="btn-primary text-sm px-6 py-2.5 rounded-2xl shadow-glow-saffron">
                            Book Now
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          6. PERSONALIZED SECTION (Auth-aware)
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad-sm bg-white">
        <div ref={personalRef} className="container-pad">
          {isAuthenticated && user ? (
            /* Logged-in: personalized greeting + quick actions */
            <div className={`transition-all duration-700 ${personalInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
              <div className="bg-gradient-to-r from-saffron-50 via-orange-50 to-temple-50 border border-saffron-100 rounded-3xl p-8 md:p-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <p className="text-saffron-600 font-semibold text-sm font-sans mb-2">Your Spiritual Journey</p>
                    <h3 className="font-display font-bold text-3xl text-gray-900 mb-2" style={{ letterSpacing: '-0.02em' }}>
                      Welcome back, {user.name?.split(' ')[0] || 'Devotee'} 🙏
                    </h3>
                    <p className="text-gray-500 font-sans text-sm">Continue your journey with personalized puja recommendations.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { to: '/my-bookings', icon: Calendar,     label: 'My Bookings' },
                      { to: '/my-orders',   icon: ShoppingBag,  label: 'My Orders' },
                      { to: '/ai-assistant',icon: MessageSquare, label: 'Ask AI' },
                    ].map(({ to, icon: Icon, label }) => (
                      <Link key={to} to={to}
                        className="flex items-center gap-2 bg-white border border-saffron-100 hover:border-saffron-300 hover:bg-saffron-50 text-gray-700 hover:text-saffron-700 text-sm font-semibold px-5 py-2.5 rounded-2xl transition-all duration-200 shadow-sm font-sans">
                        <Icon size={15} />{label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Guest: Sign-up invitation */
            <div className={`transition-all duration-700 ${personalInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
              <div className="relative overflow-hidden rounded-3xl p-8 md:p-12 text-center"
                style={{ background: 'linear-gradient(135deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}>
                <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
                <div className="relative">
                  <div className="text-4xl mb-4">🙏</div>
                  <h3 className="font-display font-bold text-3xl text-white mb-3" style={{ letterSpacing: '-0.025em' }}>
                    Join Thousands of Devotees
                  </h3>
                  <p className="text-gray-300 font-sans mb-8 max-w-md mx-auto text-sm leading-relaxed">
                    Create a free account to save your favorite poojas, track bookings, and get personalized recommendations.
                  </p>
                  <div className="flex flex-wrap gap-4 justify-center">
                    <Link to="/register" className="bg-white text-gray-900 font-bold px-8 py-3.5 rounded-2xl hover:bg-saffron-50 transition-all duration-200 shadow-luxury font-sans inline-flex items-center gap-2">
                      Create Free Account <ArrowRight size={16} />
                    </Link>
                    <Link to="/login" className="border border-white/30 text-white font-semibold px-8 py-3.5 rounded-2xl hover:bg-white/10 transition-all duration-200 font-sans">
                      Sign In
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          7. SPIRITUAL JOURNEY — Interactive intent picker
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
        <div ref={journeyRef} className="container-pad">
          <div className="text-center mb-14">
            <EyebrowTag>Personalized for You</EyebrowTag>
            <h2 className="section-title">Why Are You Here Today?</h2>
            <p className="section-subtitle mx-auto text-center">
              Select your intent and we'll guide you to the right puja, products, and wisdom.
            </p>
          </div>

          {/* Intent grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-3 mb-10">
            {JOURNEY_INTENTS.map((intent, i) => (
              <button
                key={intent.id}
                onClick={() => setActiveJourney(activeJourney === intent.id ? null : intent.id)}
                className={`flex flex-col items-center p-4 rounded-3xl border-2 transition-all duration-300 text-center group hover:-translate-y-1 hover:shadow-card ${journeyInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}
                  ${activeJourney === intent.id
                    ? `bg-gradient-to-br ${intent.gFrom} ${intent.gTo} ${intent.bdr} shadow-card scale-105`
                    : `bg-white border-gray-100 hover:${intent.bdr}`}`}
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <span className="text-2xl mb-2 group-hover:scale-110 transition-transform duration-200">{intent.emoji}</span>
                <span className="text-xs font-bold text-gray-700 font-sans">{intent.label}</span>
                <span className="text-[10px] text-gray-400 font-sans mt-0.5 hidden sm:block">{intent.desc}</span>
              </button>
            ))}
          </div>

          {/* Recommendations panel */}
          <div className={`transition-all duration-500 ${activeJourney ? 'opacity-100 max-h-[600px]' : 'opacity-0 max-h-0 overflow-hidden'}`}>
            {selectedIntent && (
              <div className="bg-white rounded-3xl p-8 shadow-card border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-3xl">{selectedIntent.emoji}</span>
                  <div>
                    <h3 className="font-display font-bold text-xl text-gray-900" style={{ letterSpacing: '-0.01em' }}>
                      Recommended for {selectedIntent.label}
                    </h3>
                    <p className="text-sm text-gray-400 font-sans">{selectedIntent.desc}</p>
                  </div>
                </div>

                {/* Recommended poojas */}
                {recsToShow.length > 0 && (
                  <div className="grid sm:grid-cols-3 gap-4 mb-6">
                    {recsToShow.map((p) => (
                      <Link key={p._id} to={p.slug && !p._id.startsWith('static') ? `/book/${p.slug}` : '/poojas'}
                        className="group flex items-center gap-3 p-4 rounded-2xl border border-gray-100 hover:border-saffron-200 hover:bg-saffron-50/30 transition-all duration-200">
                        <div className="w-12 h-12 bg-gradient-to-br from-saffron-50 to-orange-50 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                          {IMG(p.image)
                            ? <img src={IMG(p.image)} alt={p.name} className="w-full h-full object-cover" />
                            : <span className="text-xl">🙏</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 text-sm font-sans truncate group-hover:text-saffron-700 transition-colors">{p.name}</p>
                          {p.salePrice && <p className="text-xs text-saffron-600 font-sans">₹{p.salePrice.toLocaleString('en-IN')}</p>}
                        </div>
                        <ArrowRight size={14} className="text-gray-300 group-hover:text-saffron-500 transition-colors shrink-0 ml-auto" />
                      </Link>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
                  <Link to="/poojas" className="btn-primary text-sm px-6 py-2.5 rounded-2xl inline-flex items-center gap-2">
                    View All Poojas <ArrowRight size={14} />
                  </Link>
                  <Link to="/marketplace" className="btn-secondary text-sm px-6 py-2.5 rounded-2xl inline-flex items-center gap-2">
                    Shop Samagri <ShoppingBag size={14} />
                  </Link>
                  <button onClick={() => handleAiSubmit(`Best puja for ${selectedIntent.label.toLowerCase()}`)}
                    className="btn-ghost text-sm px-6 py-2.5 rounded-2xl inline-flex items-center gap-2">
                    Ask AI Guide <Sparkles size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          8. FESTIVAL TIMELINE — Horizontal scroll
      ══════════════════════════════════════════════════════════ */}
      <section
        ref={festivalRef}
        className="section-pad text-white overflow-hidden relative"
        style={{ background: 'linear-gradient(145deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}
      >
        <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
        <div className="container-pad relative">
          <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
            <div>
              <EyebrowTag light>Celebrate Together</EyebrowTag>
              <h2 className="font-display text-4xl md:text-5xl font-bold text-white" style={{ letterSpacing: '-0.03em' }}>
                Upcoming Festivals
              </h2>
            </div>
            <Link to="/festivals" className="flex items-center gap-2 font-semibold text-sm hover:gap-3 transition-all font-sans" style={{ color: '#C9A84C' }}>
              Full Calendar <ArrowRight size={14} />
            </Link>
          </div>

          {festivalLoading ? (
            <div className="flex gap-5 overflow-hidden">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="shrink-0 w-56 h-52 rounded-3xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </div>
          ) : festivals.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🪔</div>
              <p className="text-gray-300 font-sans">No upcoming festivals. <Link to="/festivals" className="text-saffron-400 hover:underline">View calendar →</Link></p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline connector line */}
              <div className="absolute top-9 left-0 right-0 h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent)' }} />

              <div className="flex gap-5 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4">
                {festivals.map((f, i) => {
                  const fd = new Date(f.date);
                  const today2 = new Date(); today2.setHours(0,0,0,0);
                  const daysLeft = Math.ceil((fd - today2) / 86400000);
                  return (
                    <div
                      key={f._id}
                      className={`shrink-0 w-52 rounded-3xl p-6 border transition-all duration-400 hover:-translate-y-1 hover:border-saffron-500/40 cursor-pointer ${festivalInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                      style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.10)', transitionDelay: `${i * 90}ms` }}
                    >
                      {/* Timeline dot */}
                      <div className="relative flex items-center gap-2 mb-4">
                        <div className="w-3 h-3 rounded-full shrink-0 border-2"
                          style={{ background: daysLeft === 0 ? '#FF6B00' : '#C9A84C', borderColor: daysLeft === 0 ? '#FF6B00' : '#C9A84C' }} />
                        {daysLeft === 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full font-sans" style={{ background: 'rgba(255,107,0,0.25)', color: '#ffb85a' }}>Today!</span>
                        ) : daysLeft > 0 ? (
                          <span className="text-[10px] font-semibold text-gray-400 font-sans">{daysLeft}d left</span>
                        ) : null}
                      </div>

                      <div className="text-2xl mb-3">🎉</div>
                      <h3 className="font-display font-bold text-base leading-snug mb-2" style={{ color: '#C9A84C', letterSpacing: '-0.01em' }}>{f.name}</h3>
                      <p className="text-xs text-gray-400 font-sans">
                        {fd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {f.tithiDate && <p className="text-xs text-gray-500 font-sans mt-0.5">{f.tithiDate}</p>}
                      <div className="mt-5 pt-4 border-t border-white/[0.08]">
                        <Link to="/poojas" className="text-xs font-semibold flex items-center gap-1 hover:gap-2 transition-all font-sans" style={{ color: '#FF6B00' }}>
                          Book a Puja <ArrowRight size={11} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          9. TEMPLE EXPLORER
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad bg-white">
        <div ref={templeRef} className="container-pad">
          <div className="text-center mb-14">
            <EyebrowTag>Sacred Places</EyebrowTag>
            <h2 className="section-title">Temple Explorer</h2>
            <p className="section-subtitle mx-auto text-center">
              Explore India's most revered temples and plan your sacred journey
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEMPLES.map(({ name, loc, emoji, desc, gFrom, gTo }, i) => (
              <div key={name}
                className={`group rounded-3xl overflow-hidden border border-gray-100 hover:border-saffron-200 hover:shadow-premium transition-all duration-500 hover:-translate-y-2 ${templeInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ transitionDelay: `${i * 80}ms` }}>
                {/* Visual header */}
                <div className={`h-40 bg-gradient-to-br ${gFrom} ${gTo} flex items-center justify-center relative overflow-hidden`}>
                  <span className="text-7xl opacity-20 absolute">{emoji}</span>
                  <span className="text-5xl relative z-10">{emoji}</span>
                </div>
                {/* Content */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-display font-bold text-xl text-gray-900" style={{ letterSpacing: '-0.01em' }}>{name}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <MapPin size={12} className="text-saffron-500 shrink-0" />
                    <p className="text-xs text-gray-400 font-sans">{loc}</p>
                  </div>
                  <p className="text-sm text-gray-500 font-sans leading-relaxed mb-5">{desc}</p>
                  <Link to="/temples"
                    className="inline-flex items-center gap-2 text-saffron-600 font-semibold text-sm hover:gap-3 transition-all font-sans group-hover:text-saffron-700">
                    Explore <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/temples" className="btn-outline inline-flex items-center gap-2">
              View All Temples <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          10. MARKETPLACE PREVIEW — Horizontal carousel
      ══════════════════════════════════════════════════════════ */}
      {products.length > 0 && (
        <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
          <div ref={mktRef} className="container-pad">
            <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
              <div>
                <EyebrowTag>Sacred Store</EyebrowTag>
                <h2 className="section-title">Trending Samagri</h2>
                <p className="section-subtitle">Authentic puja essentials delivered to your doorstep</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => scrollCarousel(-1)}
                  className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-saffron-300 flex items-center justify-center shadow-sm transition-all hover:-translate-y-0.5">
                  <ChevronLeft size={18} className="text-gray-600" />
                </button>
                <button onClick={() => scrollCarousel(1)}
                  className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-saffron-300 flex items-center justify-center shadow-sm transition-all hover:-translate-y-0.5">
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
                <Link to="/marketplace" className="text-saffron-600 font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all font-sans">
                  View All <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div ref={carouselRef} className="flex gap-5 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4">
              {products.map((p, i) => (
                <Link key={p._id} to={`/marketplace/product/${p.slug}`}
                  className={`group shrink-0 w-56 bg-white rounded-3xl overflow-hidden shadow-card hover:shadow-premium hover:-translate-y-2 transition-all duration-400 ${mktInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                  style={{ transitionDelay: `${i * 60}ms` }}>
                  <div className="h-44 bg-gradient-to-br from-saffron-50 to-orange-50 overflow-hidden">
                    {IMG(p.images?.[0] || p.image)
                      ? <img src={IMG(p.images?.[0] || p.image)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl">🪔</div>}
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold text-gray-800 text-sm font-sans line-clamp-2 mb-2 group-hover:text-saffron-700 transition-colors">{p.name}</h4>
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-lg text-saffron-600">₹{(p.salePrice || p.price).toLocaleString('en-IN')}</span>
                      <span className="text-[10px] bg-green-50 text-green-600 font-semibold px-2 py-0.5 rounded-full font-sans">In Stock</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          11. AI SPIRITUAL GUIDE — Dedicated homepage section
      ══════════════════════════════════════════════════════════ */}
      <section
        ref={aiRef}
        className="section-pad relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}
      >
        <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
        {/* Glow orbs */}
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-saffron-500 rounded-full blur-[100px] opacity-10 pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-temple-500 rounded-full blur-[100px] opacity-8 pointer-events-none" />

        <div className="container-pad relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left: Content */}
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

              {/* Popular question chips */}
              <div className="flex flex-wrap gap-2 mb-8">
                {AI_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => handleAiSubmit(q)}
                    className="text-xs font-medium px-4 py-2 rounded-full border transition-all duration-200 font-sans hover:-translate-y-0.5"
                    style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', color: '#e8d5a3' }}>
                    {q}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-3">
                <input
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAiSubmit()}
                  placeholder="Ask about a puja, festival, or ritual..."
                  className="flex-1 rounded-2xl px-5 py-3.5 text-sm font-sans focus:outline-none transition-all duration-200 text-white placeholder:text-white/40"
                  style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.15)' }}
                />
                <button onClick={() => handleAiSubmit()}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 hover:opacity-90 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)' }}>
                  <Send size={16} className="text-white" />
                </button>
              </div>
            </div>

            {/* Right: Chat preview illustration */}
            <div className={`transition-all duration-700 delay-200 ${aiInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
              <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                {/* Chat header */}
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

                {/* Sample dialogue */}
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
                      {[0,1,2].map(d => <div key={d} className="w-2 h-2 rounded-full animate-pulse-soft" style={{ background: '#C9A84C', animationDelay: `${d * 200}ms` }} />)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          12. HOW IT WORKS
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad bg-white">
        <div className="container-pad">
          <div className="text-center mb-16">
            <EyebrowTag>Simple &amp; Seamless</EyebrowTag>
            <h2 className="section-title">How Zutsav Works</h2>
            <p className="section-subtitle mx-auto text-center">
              Book a verified pandit in minutes — from anywhere in India
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-[2.75rem] left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px border-t-2 border-dashed border-saffron-200 z-0" />
            {STEPS.map(({ num, title, desc, icon }, i) => (
              <div key={num} className="relative text-center z-10">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-glow-saffron"
                    style={{ background: 'linear-gradient(135deg, #D4602A, #ff9020)' }}>
                    <span className="text-3xl">{icon}</span>
                  </div>
                  <div className="absolute -top-1 -right-1 w-8 h-8 bg-charcoal text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm font-sans">
                    {i + 1}
                  </div>
                </div>
                <h3 className="font-display font-bold text-gray-900 text-xl mb-3" style={{ letterSpacing: '-0.01em' }}>{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed font-sans">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-14">
            <Link to="/poojas" className="btn-primary inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base shadow-glow-saffron">
              Book Your First Puja <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          13. WHY CHOOSE ZUTSAV — Premium 6-card grid
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad sacred-pattern" style={{ background: '#FAF6EE' }}>
        <div ref={featuresRef} className="container-pad">
          <div className="text-center mb-16">
            <EyebrowTag>The Zutsav Promise</EyebrowTag>
            <h2 className="section-title">Why Choose Zutsav</h2>
            <p className="section-subtitle mx-auto text-center">
              Premium spiritual services built on transparency, trust, and tradition
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <div key={title}
                className={`group p-8 rounded-3xl bg-white border border-gray-100 hover:border-saffron-200 hover:shadow-sacred transition-all duration-300 hover:-translate-y-1.5 ${featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="w-14 h-14 bg-gradient-to-br from-saffron-50 to-orange-50 group-hover:from-saffron-100 group-hover:to-orange-100 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-105">
                  <Icon size={24} className="text-saffron-600" />
                </div>
                <h3 className="font-display font-bold text-gray-900 text-xl mb-3" style={{ letterSpacing: '-0.01em' }}>{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed font-sans">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          14. TESTIMONIALS — Auto-advancing slider
      ══════════════════════════════════════════════════════════ */}
      <section className="section-pad bg-white">
        <div ref={testRef} className="container-pad">
          <div className="text-center mb-14">
            <EyebrowTag>Devotee Stories</EyebrowTag>
            <h2 className="section-title">Stories of Faith</h2>
            <p className="section-subtitle mx-auto text-center">What our devotees say about their experience</p>
          </div>

          <div className={`transition-all duration-700 ${testInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {/* Slider */}
            <div className="relative overflow-hidden rounded-3xl">
              <div
                className="flex transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}
              >
                {TESTIMONIALS.map((t) => (
                  <div key={t.name} className="min-w-full px-4 md:px-16">
                    <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-12 shadow-card max-w-3xl mx-auto relative overflow-hidden">
                      {/* Decorative quote */}
                      <div className="absolute top-0 right-8 font-display text-gray-100 select-none pointer-events-none leading-none" style={{ fontSize: '10rem', fontWeight: 700 }}>❝</div>
                      <StarRating rating={t.rating} size={16} />
                      <p className="font-sans text-gray-600 text-lg leading-relaxed mt-6 mb-8 relative z-10 max-w-2xl">
                        "{t.text}"
                      </p>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center shrink-0 shadow-sm`}>
                          <span className="text-white text-sm font-bold font-sans">{t.initials}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 font-sans">{t.name}</p>
                          <p className="text-xs text-gray-400 flex items-center gap-1 font-sans"><MapPin size={10} />{t.city}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <button onClick={() => setActiveTestimonial(p => (p - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
                className="w-9 h-9 rounded-full border border-gray-200 hover:border-saffron-300 flex items-center justify-center transition-all hover:bg-saffron-50">
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
              {TESTIMONIALS.map((_, i) => (
                <button key={i} onClick={() => setActiveTestimonial(i)}
                  className={`rounded-full transition-all duration-300 ${activeTestimonial === i ? 'w-6 h-2.5 bg-saffron-500' : 'w-2.5 h-2.5 bg-gray-200 hover:bg-saffron-300'}`} />
              ))}
              <button onClick={() => setActiveTestimonial(p => (p + 1) % TESTIMONIALS.length)}
                className="w-9 h-9 rounded-full border border-gray-200 hover:border-saffron-300 flex items-center justify-center transition-all hover:bg-saffron-50">
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          15. FREQUENTLY ASKED QUESTIONS
      ══════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════
          16. FINAL CTA BANNER
      ══════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════
          17. STICKY BOTTOM CTA
      ══════════════════════════════════════════════════════════ */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 ${showSticky && !stickyDismissed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
      >
        <div className="flex items-center gap-4 bg-charcoal text-white px-6 py-3.5 rounded-2xl shadow-float"
          style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
          <span className="text-base">🙏</span>
          <span className="text-sm font-medium font-sans hidden sm:block">Looking for the perfect puja?</span>
          <Link to="/poojas"
            className="text-sm font-bold px-5 py-2 rounded-xl transition-all duration-200 font-sans hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #D4602A, #C9A84C)' }}>
            Book Now
          </Link>
          <button onClick={dismissSticky} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-all">
            <X size={14} className="text-gray-400" />
          </button>
        </div>
      </div>

    </div>
  );
}
