import React, { useEffect, useState } from 'react';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { EyebrowTag, StarRating, useInView } from './shared';

const TESTIMONIALS = [
  { name: 'Priya Sharma', city: 'New Delhi', rating: 5, initials: 'PS', color: 'from-saffron-400 to-saffron-600', text: 'Satyanarayan Pooja at my new home was absolutely flawless. The pandit was knowledgeable, arrived right on time, and the entire experience was deeply spiritual.' },
  { name: 'Rajesh Kumar', city: 'Mumbai', rating: 5, initials: 'RK', color: 'from-temple-400 to-temple-600', text: "I've booked three different poojas through Zutsav and each experience has been exceptional. The platform is intuitive and the pandits are genuinely learned." },
  { name: 'Anita Patel', city: 'Ahmedabad', rating: 5, initials: 'AP', color: 'from-rose-400 to-rose-600', text: 'The marketplace saved me so much time before Navratri. Authentic samagri delivered fresh to my door — fair prices and beautiful packaging.' },
  { name: 'Suresh Iyer', city: 'Chennai', rating: 5, initials: 'SI', color: 'from-emerald-400 to-emerald-600', text: 'Booked Ganesh Sthapana for our new office. The pandit was knowledgeable, the samagri kit was complete, and the vibrations were wonderful.' },
];

export default function Testimonials() {
  const [testRef, testInView] = useInView();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveTestimonial((p) => (p + 1) % TESTIMONIALS.length), 5500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="section-pad bg-white">
      <div ref={testRef} className="container-pad">
        <div className="text-center mb-14">
          <EyebrowTag>Devotee Stories</EyebrowTag>
          <h2 className="section-title">Stories of Faith</h2>
          <p className="section-subtitle mx-auto text-center">What our devotees say about their experience</p>
        </div>

        <div className={`transition-all duration-700 ${testInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="relative overflow-hidden rounded-3xl">
            <div
              className="flex transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}
            >
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="min-w-full px-4 md:px-16">
                  <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-12 shadow-card max-w-3xl mx-auto relative overflow-hidden">
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

          <div className="flex items-center justify-center gap-4 mt-8">
            <button onClick={() => setActiveTestimonial((p) => (p - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
              aria-label="Previous testimonial"
              className="w-9 h-9 rounded-full border border-gray-200 hover:border-saffron-300 flex items-center justify-center transition-all hover:bg-saffron-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-saffron-500">
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            {TESTIMONIALS.map((_, i) => (
              <button key={i} onClick={() => setActiveTestimonial(i)}
                aria-label={`Go to testimonial ${i + 1}`}
                aria-current={activeTestimonial === i}
                className={`rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-saffron-500 ${activeTestimonial === i ? 'w-6 h-2.5 bg-saffron-500' : 'w-2.5 h-2.5 bg-gray-200 hover:bg-saffron-300'}`} />
            ))}
            <button onClick={() => setActiveTestimonial((p) => (p + 1) % TESTIMONIALS.length)}
              aria-label="Next testimonial"
              className="w-9 h-9 rounded-full border border-gray-200 hover:border-saffron-300 flex items-center justify-center transition-all hover:bg-saffron-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-saffron-500">
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
