import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Instagram, Facebook, Youtube, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../context/SettingsContext';
import API from '../../api/axios';
import { resolveViewUrl } from '../../utils/legalDocs';

const SERVICES = [
  { i18nKey: 'footer.bookPooja',    label: 'Book a Pooja',          to: '/poojas'      },
  { i18nKey: 'footer.festivalCal',  label: 'Festival Calendar',     to: '/festivals'   },
  { i18nKey: 'footer.marketplace',  label: 'Spiritual Marketplace', to: '/marketplace' },
  { i18nKey: 'footer.templeDir',    label: 'Temple Directory',      to: '/temples'     },
  { i18nKey: 'footer.dailyPanchang',label: 'Daily Panchang',        to: '/panchang'    },
  { i18nKey: 'footer.aiGuide',      label: 'AI Spiritual Guide',    to: '/ai-assistant'},
];

const COMPANY = [
  { i18nKey: 'footer.home',        label: 'Home',             to: '/'          },
  { i18nKey: 'footer.browsePoojas',label: 'Browse Poojas',    to: '/poojas'    },
  { i18nKey: 'footer.registerPandit', label: 'Register as Pandit', to: '/register' },
];

export default function Footer() {
  const { t } = useTranslation();
  const {
    platformName, logoUrl, contactEmail, supportPhone, supportAddress,
  } = useSettings();

  const [legalDocs, setLegalDocs] = useState([]);

  useEffect(() => {
    API.get('/documents')
      .then(({ data }) => setLegalDocs((data.documents || []).filter((d) => d.exists)))
      .catch(() => {});
  }, []);

  return (
    <footer className="bg-charcoal text-white">
      {/* Main footer grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand column */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-5">
              {logoUrl
                ? <img src={logoUrl} alt={platformName} className="h-8 w-auto object-contain" />
                : <span className="text-2xl">🪔</span>}
              <span className="font-serif text-2xl font-bold text-gold-400"></span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              {t('footer.tagline', "India's most trusted spiritual platform — connecting devotees with verified pandits, authentic samagri, and sacred wisdom.")}
            </p>
            <div className="flex gap-3">
              {[
                { icon: Instagram, href: '#' },
                { icon: Facebook,  href: '#' },
                { icon: Youtube,   href: '#' },
              ].map(({ icon: Icon, href }) => (
                <a key={href} href={href}
                  className="w-9 h-9 bg-white/8 border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-saffron-500 hover:text-white hover:border-saffron-500 transition-all duration-200">
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-5 tracking-wide">{t('footer.services', 'Services')}</h4>
            <ul className="space-y-3">
              {SERVICES.map(({ label, to, i18nKey }) => (
                <li key={label}>
                  <Link to={to}
                    className="text-gray-400 text-sm hover:text-saffron-400 transition-colors flex items-center gap-1.5 group">
                    {t(i18nKey, label)}
                    <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-5 tracking-wide">{t('footer.company', 'Company')}</h4>
            <ul className="space-y-3">
              {COMPANY.map(({ label, to, i18nKey }) => (
                <li key={label}>
                  <Link to={to}
                    className="text-gray-400 text-sm hover:text-saffron-400 transition-colors">
                    {t(i18nKey, label)}
                  </Link>
                </li>
              ))}
              {legalDocs.map((doc) => (
                <li key={doc.documentType}>
                  <a
                    href={resolveViewUrl(doc)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 text-sm hover:text-saffron-400 transition-colors"
                  >
                    {doc.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-5 tracking-wide">{t('footer.contact', 'Contact')}</h4>
            <ul className="space-y-4">
              {supportPhone && (
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/8 rounded-lg flex items-center justify-center shrink-0">
                    <Phone size={13} className="text-saffron-400" />
                  </div>
                  <span className="text-gray-400 text-sm">{supportPhone}</span>
                </li>
              )}
              {contactEmail && (
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/8 rounded-lg flex items-center justify-center shrink-0">
                    <Mail size={13} className="text-saffron-400" />
                  </div>
                  <span className="text-gray-400 text-sm">{contactEmail}</span>
                </li>
              )}
              {supportAddress && (
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-white/8 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={13} className="text-saffron-400" />
                  </div>
                  <span className="text-gray-400 text-sm">{supportAddress}</span>
                </li>
              )}
              {!supportPhone && !contactEmail && !supportAddress && (
                <li className="text-gray-500 text-sm italic">{t('footer.contactNotConfigured', 'Contact info not configured')}</li>
              )}
            </ul>

            {/* Trust badge */}
            <div className="mt-6 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gold-400 text-sm">★★★★★</span>
              </div>
              <p className="text-xs text-gray-400">{t('footer.trustBadge', 'Trusted by 10,000+ devotees across India')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} {platformName}. {t('footer.madeWith', 'Made with 🙏 in India.')}
          </p>
          <p className="text-xs text-gray-600">
            {t('footer.servingSince', 'Proudly serving devotees since 2024')}
          </p>
        </div>
      </div>
    </footer>
  );
}
