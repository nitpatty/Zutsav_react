import React from 'react';
import { Calendar, Clock, Globe, ArrowRight, CheckCircle, Facebook, Twitter, MessageCircle, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatINR } from '../../../utils/priceEngine';

const WHATS_INCLUDED = [
  "Certified & Experienced Pandit",
  "Complete Puja Samagri",
  "Puja at Your Home",
  "Puja Video Recording",
  "Prasad Delivery",
];

// The date/time/language rows are display affordances that hand off into the
// wizard's own Date/Time/Language steps (which own the real validation —
// e.g. urgent-vs-normal date range constraints aren't known until Step 1).
// Pre-filling those fields here would open a second, unvalidated path to set
// scheduledDate/scheduledTime/language, so all three simply route into the
// booking flow rather than mutating shared state directly.
export default function PoojaPriceCard({ pooja, pricing, onBookNow }) {
  const hasDiscount = pooja.mrp && pooja.mrp > (pooja.salePrice || pooja.price);
  const discountPct = hasDiscount ? Math.round(((pooja.mrp - (pooja.salePrice || pooja.price)) / pooja.mrp) * 100) : 0;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied!');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <div className="card-premium rounded-3xl p-5 sticky top-6">
      <div className="flex items-center gap-2">
        <span className="text-3xl font-bold text-orange-600" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
          {formatINR(pricing?.poojaAmount ?? pooja.salePrice ?? pooja.price)}
        </span>
        {hasDiscount && <span className="text-base text-gray-400 line-through">{formatINR(pooja.mrp)}</span>}
        {discountPct > 0 && (
          <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">{discountPct}% OFF</span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Inclusive of all taxes</p>

      <div className="mt-5 space-y-3">
        {pooja.languages?.length > 0 && (
          <button type="button" onClick={onBookNow} className="input flex items-center justify-between text-left w-full cursor-pointer">
            <span className="flex items-center gap-2 text-gray-500"><Globe size={14} /> {pooja.languages[0]}{pooja.languages.length > 1 ? ` +${pooja.languages.length - 1}` : ''}</span>
            <ArrowRight size={13} className="text-gray-300" />
          </button>
        )}
      </div>

      <button onClick={onBookNow} className="btn-primary w-full mt-5 flex items-center justify-center gap-2 py-3.5 text-base">
        Book This Puja <ArrowRight size={16} />
      </button>

      <div className="mt-5">
        <p className="text-xs font-bold text-gray-500 mb-2">Share this Puja</p>
        <div className="flex items-center gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center text-green-600 hover:bg-green-100 transition-colors"
          ><MessageCircle size={15} /></a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
          ><Facebook size={15} /></a>
          <a
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-500 hover:bg-sky-100 transition-colors"
          ><Twitter size={15} /></a>
          <button
            type="button" onClick={copyLink}
            className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
          ><Link2 size={15} /></button>
        </div>
      </div>
    </div>
  );
}
