import React from 'react';
import { Phone, MessageCircle } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';

// Same trigger the floating widget's own button, the "AI Guide" nav page,
// and the homepage CTA use — see ZutsavAIWidget.jsx's zutsav:openZutsavAI
// listener. No `detail.mode` = freeform assistant (this is a general
// support entry point, not the homepage's guided pooja-recommendation flow).
const openZutsavAI = () => window.dispatchEvent(new CustomEvent('zutsav:openZutsavAI'));

export default function NeedHelpCard() {
  const { supportPhone } = useSettings();

  return (
    <div className="card rounded-2xl p-4">
      <h3 className="font-bold text-gray-900 text-sm">Need Help?</h3>
      <p className="text-xs text-gray-400 mt-1">Our team is here to help you</p>
      {supportPhone && (
        <a href={`tel:${supportPhone}`} className="flex items-center gap-2 mt-3 text-sm font-semibold text-orange-600">
          <Phone size={14} /> {supportPhone}
        </a>
      )}
      <button
        type="button"
        onClick={openZutsavAI}
        className="btn-secondary w-full mt-3 flex items-center justify-center gap-2 text-sm"
      >
        <MessageCircle size={14} /> Chat with Us
      </button>
    </div>
  );
}
