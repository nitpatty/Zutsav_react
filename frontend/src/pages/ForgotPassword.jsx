import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, MessageCircle, Eye, EyeOff, CheckCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useSettings } from '../context/SettingsContext';

// ─── Step 1: Identify account ───────────────────────────────────
function IdentifyStep({ onFound, loading }) {
  const { t } = useTranslation();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!emailOrPhone.trim()) { setError(t('auth.enterRegisteredContact')); return; }
    setError('');
    try {
      const { data } = await API.post('/auth/forgot-password/check-account', { emailOrPhone: emailOrPhone.trim() });
      onFound(emailOrPhone.trim(), data.channels);
    } catch (err) {
      setError(err.response?.data?.message || t('auth.noAccountFound'));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">{t('auth.recoverAccount')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('auth.recoverSubtitle')}</p>
      </div>
      <div>
        <input
          className={`input ${error ? 'border-red-400' : ''}`}
          placeholder={t('auth.registeredContactPlaceholder')}
          value={emailOrPhone}
          onChange={(e) => { setEmailOrPhone(e.target.value); setError(''); }}
          autoFocus
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? t('auth.checking') : t('common.continue')}
      </button>
    </form>
  );
}

// ─── Step 2: Choose delivery channel ─────────────────────────────
function ChannelStep({ channels, onSend, loading, onBack }) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState(channels[0]?.type || '');

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">{t('auth.backArrow')}</button>
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">{t('auth.howReceiveOtp')}</h2>
      </div>
      <div className="space-y-3">
        {channels.map((c) => (
          <button
            key={c.type}
            type="button"
            onClick={() => setChannel(c.type)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
              channel === c.type ? 'border-saffron-500 bg-saffron-50' : 'border-gray-200 hover:border-saffron-300'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${channel === c.type ? 'border-saffron-500 bg-saffron-500' : 'border-gray-300'}`}>
              {channel === c.type && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
            </div>
            {c.type === 'email' ? <Mail size={20} className="text-saffron-500 shrink-0" /> : <MessageCircle size={20} className="text-green-600 shrink-0" />}
            <div>
              <p className="font-semibold text-sm text-gray-800">{c.type === 'email' ? t('auth.emailOtp') : t('auth.whatsappOtp')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('auth.sendOtpTo', { contact: c.masked })}</p>
            </div>
          </button>
        ))}
      </div>
      <button onClick={() => channel && onSend(channel)} disabled={!channel || loading} className="btn-primary w-full py-3">
        {loading ? t('common.sending') : t('auth.sendOtp')}
      </button>
    </div>
  );
}

// ─── Step 3: Verify OTP ──────────────────────────────────────────
function VerifyStep({ channel, masked, onVerify, onResend, loading, onBack }) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleDigit = (val, idx) => {
    const digit = val.replace(/\D/, '').slice(-1);
    const arr = otp.split('');
    arr[idx] = digit;
    const next = arr.join('').slice(0, 6);
    setOtp(next);
    if (digit && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await onResend();
      setOtp('');
      setCooldown(60);
      toast.success(t('auth.otpResentToast'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.otpResendFailed'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">{t('auth.backArrow')}</button>
      <div className="text-center">
        {channel === 'email' ? <Mail size={32} className="mx-auto text-saffron-500 mb-2" /> : <MessageCircle size={32} className="mx-auto text-green-500 mb-2" />}
        <p className="font-semibold text-gray-800">{t('auth.enterCodeTitle')}</p>
        <p className="text-sm text-gray-500 mt-1">{t('auth.sentTo')} <strong>{masked}</strong></p>
      </div>

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

      <button onClick={() => otp.length === 6 && onVerify(otp)} disabled={otp.length < 6 || loading} className="btn-primary w-full py-3">
        {loading ? t('common.verifying') : 'Verify'}
      </button>

      <p className="text-center text-sm text-gray-500">
        {t('auth.didntReceive')}{' '}
        {cooldown > 0
          ? <span className="text-gray-400">{t('auth.resendCooldown', { n: cooldown })}</span>
          : <button onClick={handleResend} disabled={resending} className="text-saffron-600 font-semibold hover:underline">
              {resending ? t('common.sending') : t('auth.resendOtp')}
            </button>
        }
      </p>
    </div>
  );
}

// ─── Step 4: New password with live strength meter ──────────────
const RULES = [
  { key: 'length', i18n: 'auth.pwRuleLength', test: (v) => v.length >= 8 },
  { key: 'upper',  i18n: 'auth.pwRuleUpper',  test: (v) => /[A-Z]/.test(v) },
  { key: 'lower',  i18n: 'auth.pwRuleLower',  test: (v) => /[a-z]/.test(v) },
  { key: 'number', i18n: 'auth.pwRuleNumber', test: (v) => /\d/.test(v) },
  { key: 'special',i18n: 'auth.pwRuleSpecial', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function passwordStrength(pw) {
  const passed = RULES.filter((r) => r.test(pw)).length;
  if (!pw || passed <= 2) return 'weak';
  if (passed <= 4) return 'medium';
  return 'strong';
}

const STRENGTH_META = {
  weak:   { i18n: 'auth.pwWeak',   color: '#dc2626', width: '33%' },
  medium: { i18n: 'auth.pwMedium', color: '#d97706', width: '66%' },
  strong: { i18n: 'auth.pwStrong', color: '#16a34a', width: '100%' },
};

function NewPasswordStep({ onSubmit, loading, onBack }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState('');

  const strength = passwordStrength(password);
  const allRulesPass = RULES.every((r) => r.test(password));

  const submit = (e) => {
    e.preventDefault();
    if (!allRulesPass) { setError(t('auth.pwRequirementsNotMet')); return; }
    if (password !== confirm) { setError(t('auth.passwordsNoMatch')); return; }
    setError('');
    onSubmit(password);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">{t('auth.backArrow')}</button>
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">{t('auth.createNewPassword')}</h2>
      </div>

      <div>
        <label className="label">{t('auth.newPassword')}</label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            className="input pr-10"
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {password && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full transition-all duration-300 rounded-full" style={{ width: STRENGTH_META[strength].width, background: STRENGTH_META[strength].color }} />
            </div>
            <p className="text-xs font-semibold mt-1" style={{ color: STRENGTH_META[strength].color }}>{t(STRENGTH_META[strength].i18n)}</p>
          </div>
        )}

        <ul className="mt-2 space-y-1">
          {RULES.map((r) => {
            const pass = r.test(password);
            return (
              <li key={r.key} className={`text-xs flex items-center gap-1.5 ${pass ? 'text-green-600' : 'text-gray-400'}`}>
                <CheckCircle size={11} className={pass ? 'text-green-500' : 'text-gray-300'} /> {t(r.i18n)}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <label className="label">{t('auth.confirmNewPassword')}</label>
        <input
          type={show ? 'text' : 'password'}
          className="input"
          placeholder={t('auth.reenterPassword')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? t('auth.updating') : t('auth.resetPassword')}
      </button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function ForgotPassword() {
  const { t } = useTranslation();
  const { logoUrl, platformName } = useSettings();
  const navigate = useNavigate();

  const [step, setStep] = useState('identify'); // identify | channel | verify | password | success
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [channels, setChannels] = useState([]);
  const [channel, setChannel]   = useState('');
  const [loading, setLoading]   = useState(false);

  const handleFound = (identifier, foundChannels) => {
    setEmailOrPhone(identifier);
    setChannels(foundChannels);
    setStep('channel');
  };

  const sendOtp = async (selectedChannel) => {
    setLoading(true);
    try {
      await API.post('/auth/forgot-password/send-otp', { emailOrPhone, channel: selectedChannel });
      setChannel(selectedChannel);
      setStep('verify');
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.couldNotSendOtp'));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = () => API.post('/auth/forgot-password/send-otp', { emailOrPhone, channel });

  const verifyOtp = async (otp) => {
    setLoading(true);
    try {
      await API.post('/auth/forgot-password/verify-otp', { emailOrPhone, channel, otp });
      setStep('password');
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (newPassword) => {
    setLoading(true);
    try {
      await API.post('/auth/forgot-password/reset', { emailOrPhone, channel, newPassword });
      setStep('success');
      toast.success(t('auth.pwUpdatedSuccess'));
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const selectedMasked = channels.find((c) => c.type === channel)?.masked || '';

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
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 border border-saffron-100">
          {step === 'identify' && <IdentifyStep onFound={handleFound} loading={loading} />}
          {step === 'channel' && (
            <ChannelStep channels={channels} onSend={sendOtp} loading={loading} onBack={() => setStep('identify')} />
          )}
          {step === 'verify' && (
            <VerifyStep
              channel={channel}
              masked={selectedMasked}
              onVerify={verifyOtp}
              onResend={resendOtp}
              loading={loading}
              onBack={() => setStep('channel')}
            />
          )}
          {step === 'password' && (
            <NewPasswordStep onSubmit={resetPassword} loading={loading} onBack={() => setStep('verify')} />
          )}
          {step === 'success' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck size={28} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">{t('auth.pwUpdatedSuccess')}</h2>
              <p className="text-sm text-gray-500">{t('auth.redirectingLogin')}</p>
            </div>
          )}

          {step !== 'success' && (
            <p className="text-center text-sm text-gray-500 mt-6">
              {t('auth.rememberPassword')}{' '}
              <Link to="/login" className="text-saffron-600 font-semibold hover:underline">{t('auth.signIn')}</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
