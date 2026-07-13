import React from 'react';
import { CheckCircle } from 'lucide-react';

// Pure, prop-driven stepper — renders correctly on first paint with no
// dependency on having previously rendered earlier steps (required for the
// login-resume flow, which can land directly on the last step). Step count
// is data-driven (6 steps normally, up to 8 when kit steps are active) —
// never assume a fixed column count.
// `steps`: Array<{ id, icon: LucideIcon, label }>
export default function BookingStepper({ steps, currentIndex }) {
  const fillPct = currentIndex <= 0 ? '0%' : `${(currentIndex / (steps.length - 1)) * 100}%`;

  return (
    <div className="mb-8 overflow-x-auto hide-scrollbar">
      <div className="flex items-center justify-between relative min-w-[420px] px-1">
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 z-0">
          <div
            className="h-full transition-all duration-500"
            style={{ background: 'linear-gradient(90deg,var(--t-primary),var(--t-primary-light))', width: fillPct }}
          />
        </div>
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const done = idx < currentIndex;
          const curr = idx === currentIndex;
          return (
            <div key={step.id} className="flex flex-col items-center gap-1.5 relative z-10 px-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  done ? '' : curr ? '' : 'bg-white border-2 border-gray-200'
                }`}
                style={done || curr ? { background: 'linear-gradient(135deg,var(--t-primary),var(--t-primary-light))' } : {}}
              >
                {done ? <CheckCircle size={18} className="text-white" /> : <Icon size={16} className={curr ? 'text-white' : 'text-gray-400'} />}
              </div>
              <p className={`text-[10px] font-bold hidden sm:block whitespace-nowrap ${idx <= currentIndex ? 'text-orange-600' : 'text-gray-400'}`}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
