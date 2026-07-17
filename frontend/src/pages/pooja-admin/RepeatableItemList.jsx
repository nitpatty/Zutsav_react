import React from 'react';
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

// Shared repeatable single-line item list (Samagri / Benefits). No drag-and-drop
// library is installed anywhere in this app — reorder uses the same up/down
// arrow-button pattern already used by HeroBannerPanel.jsx and FaqRepeater.jsx.
export default function RepeatableItemList({ items, onChange, placeholder = 'e.g. Rice', addLabel = 'Add Item' }) {
  const list = items || [];

  const update = (i, value) => onChange(list.map((v, idx) => (idx === i ? value : v)));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...list, '']);

  return (
    <div className="space-y-2">
      {list.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <GripVertical size={14} className="text-gray-300 shrink-0" />
          <input
            className="input flex-1"
            placeholder={placeholder}
            value={item}
            onChange={(e) => update(i, e.target.value)}
          />
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-30">
              <ChevronUp size={13} />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-30">
              <ChevronDown size={13} />
            </button>
            <button type="button" onClick={() => remove(i)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs font-semibold flex items-center gap-1.5 text-saffron-600 hover:text-saffron-700 transition-colors">
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}
