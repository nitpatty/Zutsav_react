import React, { useState } from 'react';
import { X } from 'lucide-react';

// Chip-style tag input — press Enter or comma to add a chip, Backspace on an
// empty field removes the last chip. Unlike BlogEditor.jsx's private TagInput
// (hashtag-style, lowercased and stripped to [a-z0-9-]), product tags keep
// their original casing/spacing since the backend has no format constraint
// (Product.tags is a plain [String]).
export default function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const list = tags || [];

  const addTag = (raw) => {
    const tag = raw.trim();
    if (!tag || list.includes(tag)) return;
    onChange([...list, tag]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
      setInput('');
    } else if (e.key === 'Backspace' && !input && list.length) {
      onChange(list.slice(0, -1));
    }
  };

  const removeTag = (i) => onChange(list.filter((_, idx) => idx !== i));

  return (
    <div className="min-h-[42px] flex flex-wrap gap-1.5 items-center px-3 py-2 rounded-xl border bg-white focus-within:ring-2 transition-all" style={{ borderColor: 'var(--t-border)' }}>
      {list.map((tag, i) => (
        <span key={tag + i} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-saffron-50 text-saffron-700">
          {tag}
          <button type="button" onClick={() => removeTag(i)} className="ml-0.5 text-saffron-400 hover:text-saffron-700 transition-colors">
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) { addTag(input); setInput(''); } }}
        placeholder={list.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] outline-none text-sm text-gray-700 bg-transparent"
      />
    </div>
  );
}
