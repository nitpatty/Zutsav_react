import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ShoppingBag, MessageSquare, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from './shared';

export default function PersonalizedSection({ isAuthenticated, user }) {
  const { t } = useTranslation();
  const [personalRef, personalInView] = useInView();

  return (
    <section className="section-pad-sm bg-white">
      <div ref={personalRef} className="container-pad">
        {isAuthenticated && user ? (
          <div className={`transition-all duration-700 ${personalInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="bg-gradient-to-r from-saffron-50 via-orange-50 to-temple-50 border border-saffron-100 rounded-3xl p-8 md:p-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-saffron-600 font-semibold text-sm font-sans mb-2">{t('home.yourJourney', 'Your Spiritual Journey')}</p>
                  <h3 className="font-display font-bold text-3xl text-gray-900 mb-2" style={{ letterSpacing: '-0.02em' }}>
                    {t('home.welcomeBack', 'Welcome back, {{name}}! 🙏', { name: user.name?.split(' ')[0] || t('home.devotee', 'Devotee') })}
                  </h3>
                  <p className="text-gray-500 font-sans text-sm">{t('home.continueJourney', 'Continue your journey with personalized puja recommendations.')}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {[
                    { to: '/my-bookings', icon: Calendar, i18nKey: 'nav.myBookings', label: 'My Bookings' },
                    { to: '/my-orders', icon: ShoppingBag, i18nKey: 'nav.myOrders', label: 'My Orders' },
                    { to: '/ai-assistant', icon: MessageSquare, i18nKey: 'home.askAi', label: 'Ask AI' },
                  ].map(({ to, icon: Icon, label, i18nKey }) => (
                    <Link key={to} to={to}
                      className="flex items-center gap-2 bg-white border border-saffron-100 hover:border-saffron-300 hover:bg-saffron-50 text-gray-700 hover:text-saffron-700 text-sm font-semibold px-5 py-2.5 rounded-2xl transition-all duration-200 shadow-sm font-sans">
                      <Icon size={15} />{t(i18nKey, label)}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={`transition-all duration-700 ${personalInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="relative overflow-hidden rounded-3xl p-8 md:p-12 text-center"
              style={{ background: 'linear-gradient(135deg, #1C1C1E 0%, #2a1500 55%, #1C1C1E 100%)' }}>
              <div className="absolute inset-0 sacred-pattern opacity-[0.08] pointer-events-none" />
              <div className="relative">
                <div className="text-4xl mb-4">🙏</div>
                <h3 className="font-display font-bold text-3xl text-white mb-3" style={{ letterSpacing: '-0.025em' }}>
                  {t('home.joinThousands', 'Join Thousands of Devotees')}
                </h3>
                <p className="text-gray-300 font-sans mb-8 max-w-md mx-auto text-sm leading-relaxed">
                  {t('home.joinDesc', 'Create a free account to save your favorite poojas, track bookings, and get personalized recommendations.')}
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <Link to="/register" className="bg-white text-gray-900 font-bold px-8 py-3.5 rounded-2xl hover:bg-saffron-50 transition-all duration-200 shadow-luxury font-sans inline-flex items-center gap-2">
                    {t('home.createFreeAccount', 'Create Free Account')} <ArrowRight size={16} />
                  </Link>
                  <Link to="/login" className="border border-white/30 text-white font-semibold px-8 py-3.5 rounded-2xl hover:bg-white/10 transition-all duration-200 font-sans">
                    {t('home.signIn', 'Sign In')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
