import React from 'react';
import { Clock, CheckCircle } from 'lucide-react';
import { TIME_SLOTS, fmtTime } from './constants';
import StepHeader from './StepHeader';
import NavButtons from './NavButtons';

export default function TimeStep({ scheduledDate, scheduledTime, setScheduledTime, errors, setErrors, onBack, onNext }) {
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={Clock} title="Select Start Time" desc="Choose when the ceremony should begin" />

      <div className="grid grid-cols-3 gap-2">
        {TIME_SLOTS.map(slot => (
          <button
            key={slot}
            type="button"
            onClick={() => { setScheduledTime(slot); setErrors(e => ({ ...e, scheduledTime: '' })); }}
            className={`py-2.5 px-2 rounded-xl text-sm font-semibold transition-all ${
              scheduledTime === slot
                ? 'text-white shadow-md'
                : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700'
            }`}
            style={scheduledTime === slot ? { background: 'linear-gradient(135deg,var(--t-primary),var(--t-primary-light))' } : {}}
          >
            {fmtTime(slot)}
          </button>
        ))}
      </div>

      {errors.scheduledTime && <p className="text-red-500 text-xs mt-3">{errors.scheduledTime}</p>}

      {scheduledDate && scheduledTime && (
        <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
          <CheckCircle size={14} className="text-green-600 shrink-0" />
          <p className="text-xs text-green-700 font-medium">
            {new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} at {fmtTime(scheduledTime)}
          </p>
        </div>
      )}

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}
