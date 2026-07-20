import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';

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
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
