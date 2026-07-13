import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function CalendarPicker({ value, onChange, minDaysFromNow = 0, maxDaysFromNow = null }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [vy, setVY] = useState(today.getFullYear());
  const [vm, setVM] = useState(today.getMonth());

  const sel = value ? new Date(value + 'T00:00:00') : null;
  const prev = () => vm === 0 ? (setVM(11), setVY(y => y-1)) : setVM(m => m-1);
  const next = () => vm === 11 ? (setVM(0),  setVY(y => y+1)) : setVM(m => m+1);

  const firstDay = new Date(vy, vm, 1).getDay();
  const daysInMon = new Date(vy, vm+1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMon }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  const minDate = new Date(today); minDate.setDate(minDate.getDate() + minDaysFromNow);
  const maxDate = maxDaysFromNow !== null ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDaysFromNow) : null;
  const isDisabled = (d) => { const date = new Date(vy, vm, d); return date < minDate || (maxDate !== null && date > maxDate); };
  const isSelected = (d) => sel && sel.getFullYear()===vy && sel.getMonth()===vm && sel.getDate()===d;
  const isToday = (d) => today.getFullYear()===vy && today.getMonth()===vm && today.getDate()===d;

  const pick = (d) => {
    if (!d || isDisabled(d)) return;
    const dt = new Date(vy, vm, d);
    onChange(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`);
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor:'var(--t-border)', background:'var(--t-card)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor:'var(--t-border)', background:'var(--t-surface)' }}>
        <button onClick={prev} type="button" className="p-1.5 rounded-lg hover:bg-orange-100 transition-colors">
          <ChevronLeft size={16} style={{ color:'var(--t-primary)' }} />
        </button>
        <span className="font-semibold text-sm" style={{ color:'var(--t-text)' }}>{MONTHS[vm]} {vy}</span>
        <button onClick={next} type="button" className="p-1.5 rounded-lg hover:bg-orange-100 transition-colors">
          <ChevronRight size={16} style={{ color:'var(--t-primary)' }} />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b" style={{ borderColor:'var(--t-border)' }}>
        {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 p-2 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i}/>;
          const dis=isDisabled(day), sel2=isSelected(day), tod=isToday(day);
          return (
            <button key={i} type="button" onClick={() => pick(day)} disabled={dis}
              className={`w-full aspect-square rounded-xl text-xs font-semibold transition-all flex items-center justify-center
                ${dis ? 'text-gray-200 cursor-not-allowed' : sel2 ? 'text-white shadow-md' : tod ? 'border-2' : 'text-gray-700 hover:bg-orange-50 hover:text-orange-700'}`}
              style={sel2 ? { background:'linear-gradient(135deg,var(--t-primary),var(--t-primary-light))' } : tod ? { borderColor:'var(--t-primary)', color:'var(--t-primary)', background:'var(--t-surface)' } : {}}
            >{day}</button>
          );
        })}
      </div>
      {value && (
        <div className="px-4 py-2.5 border-t text-center text-sm font-medium" style={{ borderColor:'var(--t-border)', background:'var(--t-surface)', color:'var(--t-primary-dark)' }}>
          {new Date(value+'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </div>
      )}
    </div>
  );
}
