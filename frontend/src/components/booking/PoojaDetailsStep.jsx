import React, { useState } from 'react';
import { ShieldCheck, Clock3, BadgeCheck } from 'lucide-react';
import PoojaHero from './pooja-details/PoojaHero';
import OverviewTab from './pooja-details/OverviewTab';
import SamagriTab from './pooja-details/SamagriTab';
import VidhiTab from './pooja-details/VidhiTab';
import BenefitsTab from './pooja-details/BenefitsTab';
import FaqTab from './pooja-details/FaqTab';
import ReviewsTab from './pooja-details/ReviewsTab';
import SimilarPoojasSidebar from './pooja-details/SimilarPoojasSidebar';
import UpcomingFestivalsSidebar from './pooja-details/UpcomingFestivalsSidebar';
import NeedHelpCard from './pooja-details/NeedHelpCard';
import PoojaPriceCard from './pooja-details/PoojaPriceCard';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'samagri',  label: 'Samagri' },
  { id: 'vidhi',    label: 'Vidhi' },
  { id: 'benefits', label: 'Benefits' },
  { id: 'faqs',     label: 'FAQs' },
  { id: 'reviews',  label: 'Reviews' },
];

const TRUST_STRIP = [
  { icon: ShieldCheck, label: 'Secure Payment',      sub: '100% Safe & Secure' },
  { icon: Clock3,      label: 'Free Cancellation',   sub: 'Cancel up to 12h before puja' },
  { icon: BadgeCheck,  label: 'Instant Confirmation',sub: 'Get instant booking confirmation' },
];

export default function PoojaDetailsStep({ pooja, pricing, similarPoojas, upcomingFestivals, reviewsData, reviewsLoading, onBookNow }) {
  const [tab, setTab] = useState('overview');

  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_340px] gap-6">
        <aside className="space-y-4 order-2 lg:order-1">
          <SimilarPoojasSidebar poojas={similarPoojas} />
          <UpcomingFestivalsSidebar festivals={upcomingFestivals} />
          <NeedHelpCard />
        </aside>

        <main className="order-1 lg:order-2 space-y-6 min-w-0">
          <PoojaHero pooja={pooja} reviewsSummary={reviewsData?.summary} />

          <div className="card-premium rounded-3xl overflow-hidden">
            <div className="flex items-center gap-1 px-4 pt-3 overflow-x-auto hide-scrollbar border-b" style={{ borderColor: 'var(--t-border)' }}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-xl transition-colors ${
                    tab === t.id ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 md:p-6">
              {tab === 'overview' && <OverviewTab pooja={pooja} />}
              {tab === 'samagri'  && <SamagriTab pooja={pooja} />}
              {tab === 'vidhi'    && <VidhiTab pooja={pooja} />}
              {tab === 'benefits' && <BenefitsTab pooja={pooja} />}
              {tab === 'faqs'     && <FaqTab pooja={pooja} />}
              {tab === 'reviews'  && <ReviewsTab reviewsData={reviewsData} reviewsLoading={reviewsLoading} />}
            </div>
          </div>

          <div className="card rounded-2xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {TRUST_STRIP.map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--t-surface)' }}>
                    <Icon size={17} className="text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{label}</p>
                    <p className="text-[11px] text-gray-400">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <div className="order-3">
          <PoojaPriceCard pooja={pooja} pricing={pricing} onBookNow={onBookNow} />
        </div>
      </div>
    </div>
  );
}
