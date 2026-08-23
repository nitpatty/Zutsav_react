/**
 * LocationSearch — debounced place-search input backed by the /api/location
 * autocomplete proxy (Ola Maps server-side).
 *
 * Styled after PincodeInput (icon-in-input + helper text) and the admin
 * address cards (orange highlight ring) so it blends into the existing
 * Temple form without introducing a new design language.
 *
 * Props:
 *   onSelect   – ({ label, lat, lng }) => void   fired when a suggestion is chosen
 *   placeholder– input placeholder text
 */
import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader, Search } from 'lucide-react';
import { autocompletePlaces } from '../../services/geocodingService';

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

export default function LocationSearch({ onSelect, placeholder = 'Search a temple, city, or address…' }) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapRef    = useRef(null);
  const abortRef   = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // Close the dropdown on outside clicks
  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setHighlighted(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await autocompletePlaces(value, { signal: controller.signal });
      if (res.aborted) return; // superseded by newer typing — ignore stale response
      setLoading(false);
      if (res.found && res.results.length > 0) {
        setResults(res.results);
        setOpen(true);
      } else {
        setResults([]);
        setOpen(true); // show the "no matches" row
      }
    }, DEBOUNCE_MS);
  };

  const choose = (r) => {
    setQuery(r.label);
    setOpen(false);
    setResults([]);
    onSelect && onSelect({ label: r.label, lat: r.lat, lng: r.lng });
  };

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); choose(results[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <label className="label">Search Location</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-saffron-400" />
        <input
          className="input pl-9 pr-9"
          value={query}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          autoComplete="off"
          placeholder={placeholder}
        />
        {loading && (
          <Loader size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-saffron-500" />
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Type at least {MIN_QUERY_LENGTH} characters, then pick a suggestion — or fill the fields below manually.
      </p>

      {open && !loading && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No matching places found. Fill the fields manually below.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.lat},${r.lng},${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep input focus for keyboard flow
                onClick={() => choose(r)}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors ${
                  i === highlighted ? 'bg-orange-50' : 'hover:bg-orange-50'
                }`}
              >
                <MapPin size={14} className="text-saffron-500 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700 leading-snug">{r.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
