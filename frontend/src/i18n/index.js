import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import gu from './locales/gu.json';
import bn from './locales/bn.json';
import ml from './locales/ml.json';
import pa from './locales/pa.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import kn from './locales/kn.json';
import or from './locales/or.json';

// Static UI localization — navigation, buttons, forms, validation messages.
// Deliberately separate from the AI translation cache (services/
// translationService.js on the backend, hooks/useTranslatedBlog.js here):
// these dictionaries are hand-authored and committed to the repo, never
// generated via Groq, and this `lng` value must never be passed into that
// system as if the two were the same concept.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
      gu: { translation: gu },
      bn: { translation: bn },
      ml: { translation: ml },
      pa: { translation: pa },
      ta: { translation: ta },
      te: { translation: te },
      kn: { translation: kn },
      or: { translation: or },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
