import React, { useState } from 'react';
import { Image, Flame, Landmark } from 'lucide-react';
import HeroBannerPanel from './homepage/HeroBannerPanel';
import PopularPujasPanel from './homepage/PopularPujasPanel';
import FeaturedTemplesPanel from './homepage/FeaturedTemplesPanel';

const SECTIONS = [
  { key: 'hero-banners',     label: 'Hero Banners',     icon: Image,    Panel: HeroBannerPanel },
  { key: 'popular-pujas',    label: 'Popular Pujas',    icon: Flame,    Panel: PopularPujasPanel },
  { key: 'featured-temples', label: 'Featured Temples', icon: Landmark, Panel: FeaturedTemplesPanel },
];

export default function HomepageCurationTab() {
  const [section, setSection] = useState('hero-banners');
  const Active = SECTIONS.find((s) => s.key === section)?.Panel || HeroBannerPanel;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(27,31,59,0.08)' }}>
          <Image size={18} style={{ color: '#1B1F3B' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"' }}>Homepage Curation</h1>
          <p className="text-xs text-gray-400">Control what appears in the hero slider, Popular Pujas, and Temple Explorer on the public homepage</p>
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="hidden md:flex flex-col gap-1 w-48 flex-shrink-0">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                section === key ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={section === key ? { background: '#1B1F3B' } : {}}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </aside>

        <div className="md:hidden w-full">
          <select className="input mb-4" value={section} onChange={(e) => setSection(e.target.value)}>
            {SECTIONS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <Active />
        </div>
      </div>
    </div>
  );
}
