import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export default function NavButtons({ onBack, onNext, nextLabel = 'Continue', loading = false }) {
  return (
    <div className="flex gap-3 mt-6">
      <button type="button" onClick={onBack} className="btn-outline flex items-center gap-2 shrink-0">
        <ArrowLeft size={14} /> Back
      </button>
      <button type="button" onClick={onNext} disabled={loading} className="btn-success flex-1 flex items-center justify-center gap-2">
        {loading ? 'Please wait…' : <>{nextLabel} <ArrowRight size={15} /></>}
      </button>
    </div>
  );
}
