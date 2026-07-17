import React from 'react';
import { Activity, ClipboardList, CheckCircle, Circle, Lightbulb } from 'lucide-react';

export function CompletionProgressCard({ completion }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={13} className="text-blue-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Completion Progress</h3>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-bold text-gray-800">{completion}% Completed</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${completion}%` }} />
      </div>
    </div>
  );
}

export function PublishingChecklistCard({ checklist }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={13} className="text-green-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Publishing Checklist</h3>
      </div>
      <ul className="space-y-2">
        {checklist.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-xs">
            {item.done
              ? <CheckCircle size={14} className="text-green-500 shrink-0" />
              : <Circle size={14} className="text-gray-300 shrink-0" />}
            <span className={item.done ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TipsCard() {
  return (
    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#EFF6FF', border: '1px solid #DBEAFE' }}>
      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
        <Lightbulb size={14} />
      </div>
      <div>
        <p className="text-xs font-bold text-blue-900 mb-0.5">Tips</p>
        <p className="text-xs text-blue-700 leading-relaxed">Add high quality images and detailed information to increase trust and bookings.</p>
      </div>
    </div>
  );
}
