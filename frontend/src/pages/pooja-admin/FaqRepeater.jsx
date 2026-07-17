import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import RichTextEditor from '../../components/editor/RichTextEditor';

export default function FaqRepeater({ faqs, onChange, onImageUpload, hideAddButton }) {
  const list = faqs || [];
  const [openIndex, setOpenIndex] = useState(null);

  // Auto-open a newly added row, regardless of whether it was added via this
  // component's own "Add FAQ" button or an external trigger (e.g. the
  // section-header button rendered by the parent when hideAddButton is set).
  const prevLengthRef = useRef(list.length);
  useEffect(() => {
    if (list.length > prevLengthRef.current) setOpenIndex(list.length - 1);
    prevLengthRef.current = list.length;
  }, [list.length]);

  const update = (i, patch) => {
    onChange(list.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  const remove = (i) => {
    onChange(list.filter((_, idx) => idx !== i));
    setOpenIndex((cur) => (cur === i ? null : cur));
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    onChange([...list, { question: '', answer: '' }]);
    setOpenIndex(list.length);
  };

  return (
    <div className="space-y-3">
      {list.length === 0 && (
        <p className="text-sm text-gray-400">No FAQs added yet.</p>
      )}

      {list.map((f, i) => {
        const open = openIndex === i;
        return (
          <div key={i} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="p-1 text-gray-400 hover:text-gray-700 shrink-0"
                title={open ? 'Collapse' : 'Expand'}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <input
                className="input flex-1"
                placeholder="e.g. What is the ideal time to perform this pooja?"
                value={f.question}
                onChange={(e) => update(i, { question: e.target.value })}
              />
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
                <button type="button" onClick={() => remove(i)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {open && (
              <div className="px-4 pb-4">
                <label className="label">Answer</label>
                <RichTextEditor
                  value={f.answer}
                  onChange={(html) => update(i, { answer: html })}
                  onImageUpload={onImageUpload}
                  className="pooja-editor-content"
                  minHeight={150}
                  placeholder="Write the answer..."
                />
              </div>
            )}
          </div>
        );
      })}

      {!hideAddButton && (
        <button type="button" onClick={add} className="btn-outline text-sm flex items-center gap-2">
          <Plus size={15} /> Add FAQ
        </button>
      )}
    </div>
  );
}
