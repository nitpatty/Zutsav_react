import React from 'react';
import { Clock, Star, UserCheck, ShieldCheck, Package, BadgeCheck, MessageCircle, Phone } from 'lucide-react';
import { formatDuration } from '../../utils/durationFormatter';
import { formatINR } from '../../utils/priceEngine';
import { getImageUrl } from '../../config';
import { useSettings } from '../../context/SettingsContext';

// Same trigger the floating widget's own button, the "AI Guide" nav page,
// and the homepage CTA use — see ZutsavAIWidget.jsx's zutsav:openZutsavAI
// listener. No `detail.mode` = freeform assistant (this is a general
// support entry point, not the homepage's guided pooja-recommendation flow).
const openZutsavAI = () => window.dispatchEvent(new CustomEvent('zutsav:openZutsavAI'));

const TRUST_BULLETS = [
  { icon: UserCheck,   label: 'Verified & Experienced Pandit' },
  { icon: ShieldCheck, label: 'Secure & Safe Payments' },
  { icon: Package,     label: 'Samagri Kit Available' },
  { icon: BadgeCheck,  label: '100% Satisfaction Guarantee' },
];

// variant="details" — full price card with date/time/language slots + CTA (used on the Pooja Details step)
// variant="wizard"  — compact summary card shown alongside the booking wizard steps
export default function BookingSummaryCard({ pooja, pricing, reviewsSummary, variant = 'wizard', children }) {
  const { supportPhone } = useSettings();
  if (!pooja) return null;
  const rating = reviewsSummary?.averageRating ?? pooja.rating ?? 0;
  const reviewCount = reviewsSummary?.totalReviews ?? 0;
  const hasDiscount = pooja.mrp && pooja.mrp > (pooja.salePrice || pooja.price);

  return (
    <div className="card-premium rounded-3xl p-5 sticky top-6">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-orange-50 shrink-0">
          {pooja.image
            ? <img src={getImageUrl(pooja.image)} alt={pooja.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-2xl">🪔</div>}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-base leading-tight" style={{ fontFamily:"'Cormorant Garamond',serif" }}>{pooja.name}</p>
          {formatDuration(pooja) && (
            <div className="flex items-center gap-1.5 mt-1 text-gray-400 text-xs">
              <Clock size={12} /><span>{formatDuration(pooja)}</span>
            </div>
          )}
          {rating > 0 && (
            <div className="flex items-center gap-1 mt-1 text-xs">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold text-gray-700">{rating}</span>
              {reviewCount > 0 && <span className="text-gray-400">({reviewCount} reviews)</span>}
            </div>
          )}
        </div>
      </div>

      <div className="section-divider" />

      <div>
        <p className="text-xs text-gray-400">{variant === 'details' ? 'Starting From' : 'Starting From'}</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-3xl font-bold text-orange-600" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
            {formatINR(pricing?.poojaAmount ?? pooja.salePrice ?? pooja.price)}
          </span>
          {hasDiscount && <span className="text-sm text-gray-400 line-through">{formatINR(pooja.mrp)}</span>}
        </div>
      </div>

      {children}

      <div className="section-divider" />

      <div className="space-y-2.5">
        {TRUST_BULLETS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5 text-sm text-gray-600">
            <Icon size={15} className="text-orange-400 shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="section-divider" />

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">Need Help?</p>
        {supportPhone && (
          <a href={`tel:${supportPhone}`} className="flex items-center gap-2 text-sm font-semibold text-orange-600">
            <Phone size={14} /> {supportPhone}
          </a>
        )}
        <button
          type="button"
          onClick={openZutsavAI}
          className={`btn-secondary w-full flex items-center justify-center gap-2 text-sm ${supportPhone ? 'mt-3' : ''}`}
        >
          <MessageCircle size={14} /> Chat with Us
        </button>
      </div>
    </div>
  );
}
