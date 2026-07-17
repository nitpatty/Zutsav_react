import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Eye, Edit3, Copy, EyeOff, Trash2 } from 'lucide-react';

const MENU_WIDTH = 176; // w-44

// Click-to-open "..." action menu for a temple card/row — five actions don't
// fit as inline icon buttons the way Pooja/Marketplace's 3-action rows do.
//
// Rendered via a portal into document.body: the table's list-view wrapper is
// `overflow-x-auto`, and setting only overflow-x forces the browser to treat
// overflow-y as `auto` too (per the CSS spec) — that was clipping this menu
// for any row near the bottom of the table. Fixed-position + portal escapes
// that (and any other scroll/overflow ancestor) entirely.
export default function TempleActionsMenu({ temple, onView, onEdit, onDuplicate, onTogglePublish, onDelete }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, []);

  const toggleOpen = () => {
    if (!open) place();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const isPublished = temple.status === 'published';

  const item = (Icon, label, onClick, danger) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(); }}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-left hover:bg-gray-50 transition-colors ${danger ? 'text-red-600' : 'text-gray-700'}`}
    >
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-44 bg-white rounded-xl shadow-xl border overflow-hidden py-1"
          style={{ borderColor: 'var(--t-border)', top: coords.top, left: coords.left }}
        >
          {item(Eye, 'View Details', () => onView(temple))}
          {item(Edit3, 'Edit Temple', () => onEdit(temple))}
          {item(Copy, 'Duplicate Temple', () => onDuplicate(temple))}
          {item(isPublished ? EyeOff : Eye, isPublished ? 'Unpublish' : 'Publish', () => onTogglePublish(temple))}
          <div className="h-px my-1" style={{ background: 'var(--t-border)' }} />
          {item(Trash2, 'Delete Temple', () => onDelete(temple), true)}
        </div>,
        document.body
      )}
    </>
  );
}
