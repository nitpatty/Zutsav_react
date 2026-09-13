import React from 'react';
import { Calendar, Zap, Info } from 'lucide-react';
import CalendarPicker from './CalendarPicker';
import StepHeader from './StepHeader';
import NavButtons from './NavButtons';
import { useSettings } from '../../context/SettingsContext';
import { getUrgentWindow, formatDateLabel, formatTimeLabel } from '../../utils/bookingDateRules';

export default function DateStep({ isUrgent, scheduledDate, setScheduledDate, errors, setErrors, onBack, onNext }) {
  const { urgentBookingCutoffTime } = useSettings();
  const urgentWindow = isUrgent ? getUrgentWindow(new Date(), urgentBookingCutoffTime || undefined) : null;
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={Calendar} title="Select Ceremony Date" desc="Choose your preferred date" />

      {isUrgent ? (
        <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
          <Zap size={14} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 leading-relaxed">
            {urgentWindow?.cutoffReached
              ? <>Urgent bookings are available for <span className="font-semibold">{formatDateLabel(urgentWindow.earliestDate)}</span> (day after tomorrow) only — same-day and next-day booking has closed for today.</>
              : <>Urgent bookings are available for <span className="font-semibold">tomorrow and the day after</span> only. Same-day booking closes at {formatTimeLabel(urgentWindow.cutoffTime)} IST.</>}
          </p>
        </div>
      ) : (
        <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
          <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            Normal bookings require <span className="font-semibold">at least 3 days</span> advance notice so we can arrange the pandit and samagri kit.
          </p>
        </div>
      )}

      <CalendarPicker
        value={scheduledDate}
        onChange={d => { setScheduledDate(d); setErrors(e => ({ ...e, scheduledDate: '' })); }}
        minDate={urgentWindow ? urgentWindow.earliestDate : undefined}
        maxDate={urgentWindow ? urgentWindow.latestDate : undefined}
        minDaysFromNow={isUrgent ? undefined : 3}
        maxDaysFromNow={isUrgent ? undefined : null}
      />
      {errors.scheduledDate && <p className="text-red-500 text-xs mt-2">{errors.scheduledDate}</p>}
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}