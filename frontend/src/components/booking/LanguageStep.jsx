import React from 'react';
import { Globe } from 'lucide-react';
import StepHeader from './StepHeader';
import NavButtons from './NavButtons';

export default function LanguageStep({ pooja, language, setLanguage, errors, setErrors, onBack, onNext }) {
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={Globe} title="Select Language" desc="Language for mantras and ceremony" />

      {pooja.languages?.length > 0 ? (
        <div className="space-y-2">
          {pooja.languages.map(lang => (
            <div
              key={lang}
              onClick={() => { setLanguage(lang); setErrors(e => ({ ...e, language: '' })); }}
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                language === lang ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200 hover:bg-orange-50/40'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${language === lang ? 'border-orange-500' : 'border-gray-300'}`}>
                {language === lang && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
              </div>
              <span className={`font-semibold text-sm ${language === lang ? 'text-orange-700' : 'text-gray-700'}`}>{lang}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">The pandit will conduct the ceremony in your preferred language.</p>
        </div>
      )}

      {errors.language && <p className="text-red-500 text-xs mt-3">{errors.language}</p>}
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}
