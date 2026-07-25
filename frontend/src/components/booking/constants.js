import { Sparkles, Zap, Package, ShoppingBag, Calendar, Clock, Globe, ClipboardList } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// STEP DEFINITIONS
// Steps are dynamic — kit steps hidden for urgent bookings
// ─────────────────────────────────────────────────────────────

export const STEP_IDS = {
  OVERVIEW:   'overview',
  TYPE:       'type',
  KIT_PREF:  'kit-pref',
  KIT_SELECT: 'kit-select',
  DATE:       'date',
  TIME:       'time',
  LANGUAGE:   'language',
  DETAILS:    'details',
  REVIEW:     'review',
};

export const STEP_META = {
  [STEP_IDS.OVERVIEW]:   { icon: Sparkles,     label: 'Pooja',    desc: 'Review ceremony'  },
  [STEP_IDS.TYPE]:       { icon: Zap,          label: 'Type',     desc: 'Normal or Urgent' },
  [STEP_IDS.KIT_PREF]:   { icon: Package,      label: 'Samagri',  desc: 'Kit preference'   },
  [STEP_IDS.KIT_SELECT]: { icon: ShoppingBag,  label: 'Kit',      desc: 'Select kit'       },
  [STEP_IDS.DATE]:       { icon: Calendar,     label: 'Date',     desc: 'Pick a date'      },
  [STEP_IDS.TIME]:       { icon: Clock,        label: 'Time',     desc: 'Select time'      },
  [STEP_IDS.LANGUAGE]:   { icon: Globe,        label: 'Language', desc: 'Choose language'  },
  [STEP_IDS.DETAILS]:    { icon: ClipboardList,label: 'Details',  desc: 'Your information' },
  [STEP_IDS.REVIEW]:     { icon: Sparkles,     label: 'Review',   desc: 'Pay & confirm'    },
};

export function buildActiveSteps(isUrgent, withKit, hasKits) {
  return [
    STEP_IDS.OVERVIEW,
    STEP_IDS.TYPE,
    ...(hasKits && !isUrgent ? [STEP_IDS.KIT_PREF] : []),
    ...(hasKits && !isUrgent && withKit ? [STEP_IDS.KIT_SELECT] : []),
    STEP_IDS.DATE,
    STEP_IDS.TIME,
    STEP_IDS.LANGUAGE,
    STEP_IDS.DETAILS,
    STEP_IDS.REVIEW,
  ];
}

// ─────────────────────────────────────────────────────────────
// TIME SLOTS
// ─────────────────────────────────────────────────────────────

// Full day, 30-minute steps, midnight to midnight (00:00–23:30).
export const TIME_SLOTS = [
  '00:00','00:30','01:00','01:30','02:00','02:30','03:00','03:30','04:00','04:30',
  '05:00','05:30','06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30',
  '20:00','20:30','21:00','21:30','22:00','22:30','23:00','23:30',
];

// Formats a raw "HH:mm" booking-slot string (already stored in 24-hour form)
// into a consistent, zero-padded 24-hour display — the single formatter
// every screen showing a booking time slot should use, so none of them
// independently reintroduce 12-hour/AM-PM formatting.
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

// Read referral token from sessionStorage and validate it hasn't expired.
export function getStoredReferralToken() {
  try {
    const raw = sessionStorage.getItem('zutsav_referral');
    if (!raw) return '';
    const stored = JSON.parse(raw);
    if (stored?.token && stored.expiresAt && new Date(stored.expiresAt) > new Date()) {
      return stored.token;
    }
    sessionStorage.removeItem('zutsav_referral');
  } catch { /* storage unavailable */ }
  return '';
}
