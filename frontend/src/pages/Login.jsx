import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, AlertTriangle, RotateCcw, LogOut, KeyRound, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import API from '../api/axios';
import { isAdminRole } from '../utils/roleUtils';

// ─── Shared: 6-box OTP input (mirrors Register.jsx) ────────────
function OtpBoxes({ otp, setOtp, inputRefs }) {
  const handleDigit = (val, idx) => {
    const digits = val.replace(/\D/, '').slice(-1);
    const arr    = otp.split('');
    arr[idx]     = digits;
    setOtp(arr.join('').slice(0, 6));
    if (digits && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          type="text" inputMode="numeric" maxLength={1}
          value={otp[i] || ''}
          onChange={(e) => handleDigit(e.target.value, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          className="w-11 h-12 text-center text-xl font-bold border-2 rounded-xl outline-none focus:border-saffron-500 transition-colors"
        />
      ))}
    </div>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const { login, sendLoginOtp, loginWithOtp, logout, loading } = useAuth();
  const { logoUrl, platformName } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  // Support ?next= param (used by referral links) as well as router state
  const nextParam = new URLSearchParams(location.search).get('next');
  const from = nextParam || location.state?.from?.pathname || '/';

  const [form, setForm] = useState({ emailOrPhone: '', password: '' });
  const [show, setShow]  = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [deletionData, setDeletionData] = useState(null); // set when account is deletion_pending
  const [restoring, setRestoring] = useState(false);

  const [mode, setMode] = useState('password');            // 'password' | 'otp'
  const [otpStage, setOtpStage] = useState('identifier');  // 'identifier' | 'verify'
  const [otpInfo, setOtpInfo] = useState(null);            // { channel, masked, message }
  const [otpValue, setOtpValue] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [resending, setResending] = useState(false);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const otpInputRefs = useRef([]);

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  const validate = () => {
    const e = {};
    if (!form.emailOrPhone) e.emailOrPhone = t('auth.emailOrPhoneRequired');
    if (!form.password)      e.password     = t('auth.passwordRequired');
    return e;
  };

  const finalizeLogin = (data) => {
    // Account is in the 30-day deletion grace period — show restore prompt
    if (data.deletionPending) {
      setDeletionData(data);
      return;
    }
    toast.success(t('auth.otpLoginSuccessToast', { name: data.user.name }));
    if (isAdminRole(data.user.role)) return navigate('/admin', { replace: true });
    if (data.user.role === 'pandit') return navigate('/pandit/dashboard', { replace: true });
    navigate(from, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    try {
      const data = await login(form.emailOrPhone, form.password, rememberMe);

      // Account is in the 30-day deletion grace period — show restore prompt
      if (data.deletionPending) {
        setDeletionData(data);
        return;
      }

      toast.success(t('auth.welcomeBackToast', { name: data.user.name }));
      if (isAdminRole(data.user.role)) return navigate('/admin', { replace: true });
      if (data.user.role === 'pandit') return navigate('/pandit/dashboard', { replace: true });
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.loginFailed'));
    }
  };

  const handleSendOtp = async () => {
    if (!form.emailOrPhone) { setErrors({ emailOrPhone: t('auth.emailOrPhoneRequired') }); return; }
    setErrors({});
    try {
      const data = await sendLoginOtp(form.emailOrPhone);
      if (data.found) {
        setOtpInfo(data);
        setOtpValue('');
        setOtpCountdown(60);
        setOtpStage('verify');
        toast.success(t('auth.otpSentToast', { channel: data.channel === 'email' ? 'email' : 'WhatsApp' }));
      } else {
        setShowRegisterPrompt(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.otpSendFailed'));
    }
  };

  const handleResendOtp = async () => {
    setResending(true);
    try {
      const data = await sendLoginOtp(form.emailOrPhone);
      if (data.found) {
        setOtpCountdown(60);
        toast.success(data.message || t('auth.otpResentToast'));
      } else {
        setShowRegisterPrompt(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.otpResendFailed'));
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpValue.length !== 6) { setErrors({ otp: t('auth.otpRequired') }); return; }
    setErrors({});
    try {
      const data = await loginWithOtp(form.emailOrPhone, otpValue, rememberMe);
      finalizeLogin(data);
    } catch (err) {
      const msg = err.response?.data?.message || '';
      toast.error(msg || t('auth.otpLoginFailed'));
      // One-time-code exhausted — bounce back to identifier for a fresh request
      if (msg.includes('expired') || msg.includes('not found') || msg.includes('Too many') || msg.includes('already used')) {
        setOtpStage('identifier');
        setOtpInfo(null);
        setOtpValue('');
      }
    }
  };

  const switchToOtp = () => {
    setMode('otp');
    setErrors({});
  };

  const switchToPassword = () => {
    setMode('password');
    setOtpStage('identifier');
    setOtpInfo(null);
    setOtpValue('');
    setErrors({});
  };

  const goRegister = () => {
    const isEmail = String(form.emailOrPhone || '').trim().includes('@');
    const param   = isEmail
      ? `email=${encodeURIComponent(form.emailOrPhone.trim())}`
      : `phone=${encodeURIComponent(form.emailOrPhone.trim())}`;
    const nextQ   = from && from !== '/' ? `&next=${encodeURIComponent(from)}` : '';
    navigate(`/register?${param}${nextQ}`);
  };

  const handleRestoreAccount = async () => {
    setRestoring(true);
    try {
      await API.post('/auth/delete-account/cancel');
      toast.success(t('auth.restoredToast'));
      setDeletionData(null);
      const data = deletionData;
      if (isAdminRole(data.user.role)) return navigate('/admin', { replace: true });
      if (data.user.role === 'pandit') return navigate('/pandit/dashboard', { replace: true });
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };

  const handleContinueLogout = () => {
    logout();
    setDeletionData(null);
    toast(t('auth.loggedOutToast'), { icon: '👋' });
  };

  return (
    <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center mb-6">
            {logoUrl
              ? <img src={logoUrl} alt={platformName || 'Zutsav'} className="h-14 w-auto object-contain" />
              : <span className="font-serif text-3xl font-bold text-maroon-600">{platformName || 'Zutsav'}</span>
            }
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">{t('auth.welcomeBack')}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('auth.signInSubtitle')}</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 border border-saffron-100">

          {mode === 'password' && (
            <form onSubmit={handleSubmit} className="space-y-5">

              <div>
                <label className="label">{t('auth.emailOrPhone')}</label>
                <input
                  className={`input ${errors.emailOrPhone ? 'border-red-400' : ''}`}
                  placeholder={t('auth.emailOrPhonePlaceholder')}
                  value={form.emailOrPhone}
                  onChange={(e) => { setForm({ ...form, emailOrPhone: e.target.value }); setErrors({ ...errors, emailOrPhone: '' }); }}
                />
                {errors.emailOrPhone && <p className="text-red-500 text-xs mt-1">{errors.emailOrPhone}</p>}
              </div>

              <div>
                <label className="label">{t('auth.password')}</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    className={`input pr-10 ${errors.password ? 'border-red-400' : ''}`}
                    placeholder={t('auth.passwordPlaceholder')}
                    value={form.password}
                    onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: '' }); }}
                  />
                  <button type="button" onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-saffron-600 focus:ring-saffron-500"
                  />
                  {t('auth.rememberMe')}
                </label>
                <Link to="/forgot-password" className="text-sm text-saffron-600 font-semibold hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
                {loading ? t('auth.signingIn') : t('auth.signInBtn')}
              </button>
            </form>
          )}

          {mode === 'otp' && (
            <div className="space-y-5">
              {otpStage === 'identifier' && (
                <>
                  <div>
                    <label className="label">{t('auth.emailOrPhone')}</label>
                    <input
                      className={`input ${errors.emailOrPhone ? 'border-red-400' : ''}`}
                      placeholder={t('auth.emailOrPhonePlaceholder')}
                      value={form.emailOrPhone}
                      onChange={(e) => { setForm({ ...form, emailOrPhone: e.target.value }); setErrors({ ...errors, emailOrPhone: '' }); }}
                    />
                    {errors.emailOrPhone && <p className="text-red-500 text-xs mt-1">{errors.emailOrPhone}</p>}
                  </div>

                  <button onClick={handleSendOtp} disabled={!form.emailOrPhone || loading}
                    className="btn-primary w-full py-3 text-base">
                    {loading ? t('auth.sendingLoginOtp') : t('auth.sendLoginOtp')}
                  </button>
                </>
              )}

              {otpStage === 'verify' && otpInfo && (
                <>
                  <div className="text-center">
                    <KeyRound size={32} className="mx-auto text-saffron-500 mb-2" />
                    <p className="font-semibold text-gray-800">{t('auth.otpLoginTitle')}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('auth.sentTo')} <strong>{otpInfo.masked}</strong>
                    </p>
                  </div>

                  <OtpBoxes otp={otpValue} setOtp={setOtpValue} inputRefs={otpInputRefs} />
                  {errors.otp && <p className="text-red-500 text-xs text-center">{errors.otp}</p>}

                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-saffron-600 focus:ring-saffron-500"
                    />
                    {t('auth.rememberMe')}
                  </label>

                  <button onClick={handleVerifyOtp} disabled={otpValue.length !== 6 || loading}
                    className="btn-primary w-full py-3 text-base">
                    {loading ? t('auth.verifyingOtp') : t('auth.verifyOtp')}
                  </button>

                  <p className="text-center text-sm text-gray-500">
                    {t('auth.didntReceive')}{' '}
                    {otpCountdown > 0
                      ? <span className="text-gray-400">{t('auth.resendIn', { n: otpCountdown })}</span>
                      : <button onClick={handleResendOtp} disabled={resending} className="text-saffron-600 font-semibold hover:underline">
                          {resending ? t('common.sending') : t('auth.resendOtp')}
                        </button>
                    }
                  </p>

                  <button type="button" onClick={() => { setOtpStage('identifier'); setOtpInfo(null); setOtpValue(''); }}
                    className="text-sm text-gray-500 hover:underline block mx-auto">
                    {t('auth.backToIdentifier')}
                  </button>
                </>
              )}

              <div className="text-center">
                <button type="button" onClick={switchToPassword}
                  className="text-sm text-saffron-600 font-semibold hover:underline">
                  {t('auth.usePasswordInstead')}
                </button>
              </div>
            </div>
          )}

          {mode === 'password' && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center text-xs uppercase text-gray-400"><span className="bg-white px-2">or</span></div>
              </div>

              <button onClick={switchToOtp}
                className="w-full py-3 rounded-xl border-2 border-saffron-200 text-saffron-700 font-semibold hover:bg-saffron-50 transition-colors flex items-center justify-center gap-2">
                <KeyRound size={16} /> {t('auth.continueWithOtp')}
              </button>
            </>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            {t('auth.noAccountQuestion')}{' '}
            <Link to="/register" className="text-saffron-600 font-semibold hover:underline">{t('auth.registerHere')}</Link>
          </p>
        </div>
      </div>

      {/* ── Register prompt (identifier not on an account) ──────────── */}
      {showRegisterPrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-saffron-100 rounded-2xl flex items-center justify-center mb-4">
              <UserPlus size={22} className="text-saffron-600" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-2">{t('auth.notRegisteredTitle')}</h3>
            <p className="text-sm text-gray-500 mb-6">{t('auth.notRegisteredMsg')}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowRegisterPrompt(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                {t('auth.notNow')}
              </button>
              <button onClick={goRegister}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-saffron-600 hover:bg-saffron-700 transition-colors">
                {t('auth.registerInstead')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deletion-pending restore modal ──────────────────────────── */}
      {deletionData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
              <AlertTriangle size={22} className="text-amber-600" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-2">{t('auth.deletionTitle')}</h3>
            <p className="text-sm text-gray-500 mb-1">
              {t('auth.deletionWelcome', { name: deletionData.user.name })}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {t('auth.scheduledDeletionOn', {
                date: deletionData.scheduledDeletionDate
                  ? new Date(deletionData.scheduledDeletionDate).toLocaleDateString('en-IN')
                  : '—'
              })}
            </p>
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-xs text-green-700 mb-5">
              {t('auth.restoreNote')}
            </div>
            <div className="flex gap-3">
              <button onClick={handleContinueLogout} disabled={restoring}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                <LogOut size={14} /> {t('auth.continueLogout')}
              </button>
              <button onClick={handleRestoreAccount} disabled={restoring}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors">
                <RotateCcw size={14} /> {restoring ? t('auth.restoring') : t('auth.restoreAccount')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}