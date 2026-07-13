import React from 'react';
import { Package, HeartHandshake } from 'lucide-react';
import StepHeader from './StepHeader';
import NavButtons from './NavButtons';

export default function KitPreferenceStep({ withKit, setWithKit, setKitId, onBack, onNext }) {
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={Package} title="Samagri Kit" desc="Would you like to add a kit for this ceremony?" />

      <div className="grid grid-cols-2 gap-4">
        <div
          onClick={() => { setWithKit(false); setKitId(''); }}
          className={`rounded-2xl border-2 p-5 cursor-pointer transition-all text-center ${
            !withKit ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-2" style={{ background: !withKit ? 'var(--t-surface)' : '#F3F4F6' }}>
            <HeartHandshake size={22} className={!withKit ? 'text-orange-500' : 'text-gray-400'} />
          </div>
          <p className={`font-bold text-sm ${!withKit ? 'text-orange-700' : 'text-gray-700'}`}>Without Kit</p>
          <p className="text-[11px] text-gray-400 mt-1">I'll arrange samagri myself</p>
        </div>

        <div
          onClick={() => setWithKit(true)}
          className={`rounded-2xl border-2 p-5 cursor-pointer transition-all text-center relative ${
            withKit ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-2" style={{ background: withKit ? 'var(--t-surface)' : '#F3F4F6' }}>
            <Package size={22} className={withKit ? 'text-orange-500' : 'text-gray-400'} />
          </div>
          <p className={`font-bold text-sm ${withKit ? 'text-orange-700' : 'text-gray-700'}`}>With Kit</p>
          <p className="text-[11px] text-gray-400 mt-1">Delivered to your address</p>
          <span className="absolute -top-2 -right-2 text-[9px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">CONVENIENT</span>
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}
