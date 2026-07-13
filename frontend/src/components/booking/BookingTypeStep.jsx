import React from 'react';
import { Zap, Calendar } from 'lucide-react';
import StepHeader from './StepHeader';
import NavButtons from './NavButtons';

export default function BookingTypeStep({ isUrgent, onSetUrgent, onBack, onNext }) {
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={Zap} title="Select Booking Type" desc="Choose how soon you need this ceremony" />

      <div className="grid grid-cols-1 gap-4">
        {/* Normal */}
        <div
          onClick={() => onSetUrgent(false)}
          className={`rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200 ${
            !isUrgent ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200 hover:bg-orange-50/40'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${!isUrgent ? 'bg-orange-100' : 'bg-gray-100'}`}>
              <Calendar size={22} className={!isUrgent ? 'text-orange-500' : 'text-gray-400'} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className={`font-bold text-base ${!isUrgent ? 'text-orange-700' : 'text-gray-700'}`}>Normal Booking</p>
                <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-semibold">Recommended</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Schedule at your preferred date and time. Samagri kit delivery available.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['Scheduled ceremony', 'Kit delivery available', 'Full pandit selection'].map(f => (
                  <span key={f} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{f}</span>
                ))}
              </div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${!isUrgent ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
              {!isUrgent && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
          </div>
        </div>

        {/* Urgent */}
        <div
          onClick={() => onSetUrgent(true)}
          className={`rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200 ${
            isUrgent ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-red-200 hover:bg-red-50/40'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isUrgent ? 'bg-red-100' : 'bg-gray-100'}`}>
              <Zap size={22} className={isUrgent ? 'text-red-500' : 'text-gray-400'} />
            </div>
            <div className="flex-1">
              <p className={`font-bold text-base ${isUrgent ? 'text-red-700' : 'text-gray-700'}`}>Urgent Booking</p>
              <p className="text-sm text-gray-500 mt-1">Need a pandit immediately or within a few hours. Samagri kit not available for urgent bookings.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['Quick pandit dispatch', 'Same-day ceremony', 'No kit delivery'].map(f => (
                  <span key={f} className={`text-[10px] border px-2 py-0.5 rounded-full ${f === 'No kit delivery' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{f}</span>
                ))}
              </div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${isUrgent ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
              {isUrgent && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
          </div>
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}
