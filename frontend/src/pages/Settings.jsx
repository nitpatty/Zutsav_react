import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Check, ChevronDown, Globe2, User, Shield, Bell, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

// Single source of truth on the frontend for the searchable dropdown — kept
// in sync with backend/src/config/languages.config.js. Adding a language:
// add it in both places + its i18n resource file, nothing else.
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',   native: 'English' },
  { code: 'hi', name: 'Hindi',     native: 'हिन्दी' },
  { code: 'mr', name: 'Marathi',   native: 'मराठी' },
  { code: 'gu', name: 'Gujarati',  native: 'ગુજરાતી' },
  { code: 'ta', name: 'Tamil',     native: 'தமிழ்' },
  { code: 'te', name: 'Telugu',    native: 'తెలుగు' },
  { code: 'kn', name: 'Kannada',   native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'bn', name: 'Bengali',   native: 'বাংলা' },
  { code: 'pa', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'Odia',     native: 'ଓଡ଼ିଆ' },
];

function LanguageDropdown() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];
  const filtered = SUPPORTED_LANGUAGES.filter((l) =>
    l.name.toLowerCase().includes(query.toLowerCase()) || l.native.includes(query)
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-saffron-100 bg-white hover:border-saffron-300 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg font-semibold text-gray-800">{current.native}</span>
          <span className="text-sm text-gray-400">({current.name})</span>
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full bg-white rounded-2xl shadow-float border border-saffron-100 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search language…"
                className="bg-transparent outline-none text-sm w-full"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400">No language matches "{query}"</div>
            )}
            {filtered.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => { setLang(l.code); setOpen(false); setQuery(''); }}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-saffron-50 transition-colors"
              >
                <span>
                  <span className="font-medium text-gray-800">{l.native}</span>
                  <span className="text-sm text-gray-400 ml-2">{l.name}</span>
                </span>
                {l.code === lang && <Check size={16} className="text-maroon-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FuturePreferenceRow({ icon: Icon, label }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 opacity-60">
      <span className="flex items-center gap-2 text-gray-500">
        <Icon size={16} /> {label}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Future</span>
    </div>
  );
}

const TABS = [
  { key: 'profile',      label: 'Profile',      icon: User },
  { key: 'security',     label: 'Security',     icon: Shield },
  { key: 'notifications',label: 'Notifications',icon: Bell },
  { key: 'preferences',  label: 'Preferences',  icon: Sparkles },
];

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('preferences');

  return (
    <div className="min-h-screen bg-spiritual-light py-10">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <h1 className="text-2xl font-bold text-maroon-700">Settings</h1>

        {/* Tab switcher — role-independent: every role lands on this same
            Settings page/structure, per the global language preference spec. */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === key ? 'bg-maroon-700 text-white' : 'bg-white text-gray-600 border border-saffron-100 hover:border-saffron-300'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100">
            <h2 className="font-semibold text-gray-700 mb-2">Profile</h2>
            <p className="text-sm text-gray-500 mb-4">Manage your name, photo, and contact details.</p>
            <Link to="/profile" className="btn-secondary text-sm inline-block">Go to My Profile</Link>
          </div>
        )}

        {tab === 'security' && (
          <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100">
            <h2 className="font-semibold text-gray-700 mb-2">Security</h2>
            <p className="text-sm text-gray-500 mb-4">Password and account deletion are managed from My Profile.</p>
            <Link to="/profile" className="btn-secondary text-sm inline-block">Go to My Profile</Link>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100">
            <h2 className="font-semibold text-gray-700 mb-2">Notifications</h2>
            <p className="text-sm text-gray-500 mb-4">View and manage your notifications.</p>
            <Link to="/notifications" className="btn-secondary text-sm inline-block">Go to Notifications</Link>
          </div>
        )}

        {tab === 'preferences' && (
          <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100 space-y-5">
            <div>
              <h2 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
                <Globe2 size={16} className="text-maroon-600" /> App Language
              </h2>
              <p className="text-sm text-gray-500 mb-3">
                Applies across the entire platform — every page, dashboard, and role.
                {user ? ' Saved to your account and remembered on every device.' : ' Saved on this device until you sign in.'}
              </p>
              <LanguageDropdown />
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-2">
              <FuturePreferenceRow icon={Sparkles} label="Currency" />
              <FuturePreferenceRow icon={Sparkles} label="Time Zone" />
              <FuturePreferenceRow icon={Sparkles} label="Date Format" />
              <FuturePreferenceRow icon={Sparkles} label="Theme" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
