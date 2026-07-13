import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, MessageCircle, Eye, EyeOff, CheckCircle, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useSettings } from '../context/SettingsContext';

// ─── Step 1: Identify account ───────────────────────────────────
function IdentifyStep({ onFound, loading }) {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!emailOrPhone.trim()) { setError('Enter your registered email or mobile number'); return; }
    setError('');
    try {
      const { data } = await API.post('/auth/forgot-password/check-account', { emailOrPhone: emailOrPhone.trim() });
      onFound(emailOrPhone.trim(), data.channels);
    } catch (err) {
      setError(err.response?.data?.message || 'No account found.');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">Recover your account</h2>
        <p className="text-sm text-gray-500 mt-1">Enter your registered email or mobile number</p>
      </div>
      <div>
        <input
          className={`input ${error ? 'border-red-400' : ''}`}
          placeholder="Email or 10-digit mobile"
          value={emailOrPhone}
          onChange={(e) => { setEmailOrPhone(e.target.value); setError(''); }}
          autoFocus
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? 'Checking...' : 'Continue'}
      </button>
    </form>
  );
}

// ─── Step 2: Choose delivery channel ─────────────────────────────
function ChannelStep({ channels, onSend, loading, onBack }) {
  const [channel, setChannel] = useState(channels[0]?.type || '');

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">← Back</button>
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">How would you like to receive your OTP?</h2>
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
              <p className="font-semibold text-sm text-gray-800">{c.type === 'email' ? 'Email' : 'WhatsApp'}</p>
              <p className="text-xs text-gray-500 mt-0.5">Send OTP to {c.masked}</p>
            </div>
          </button>
        ))}
      </div>
      <button onClick={() => channel && onSend(channel)} disabled={!channel || loading} className="btn-primary w-full py-3">
        {loading ? 'Sending...' : 'Send OTP'}
      </button>
    </div>
  );
}

// ─── Step 3: Verify OTP ──────────────────────────────────────────
// Same 6-box digit input / resend-cooldown pattern already used in
// Register.jsx's OTP step, for a consistent experience across auth flows.
function VerifyStep({ channel, masked, onVerify, onResend, loading, onBack }) {
  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
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
      toast.success('OTP resent!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not resend OTP');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">← Back</button>
      <div className="text-center">
        {channel === 'email' ? <Mail size={32} className="mx-auto text-saffron-500 mb-2" /> : <MessageCircle size={32} className="mx-auto text-green-500 mb-2" />}
        <p className="font-semibold text-gray-800">Enter Verification Code</p>
        <p className="text-sm text-gray-500 mt-1">Sent to <strong>{masked}</strong></p>
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
        {loading ? 'Verifying...' : 'Verify'}
      </button>

      <p className="text-center text-sm text-gray-500">
        Didn't receive it?{' '}
        {cooldown > 0
          ? <span className="text-gray-400">Resend OTP in {cooldown}s</span>
          : <button onClick={handleResend} disabled={resending} className="text-saffron-600 font-semibold hover:underline">
              {resending ? 'Sending...' : 'Resend OTP'}
            </button>
        }
      </p>
    </div>
  );
}

// ─── Step 4: New password with live strength meter ──────────────
const RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'upper',  label: 'One uppercase letter',   test: (v) => /[A-Z]/.test(v) },
  { key: 'lower',  label: 'One lowercase letter',   test: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'One number',             test: (v) => /\d/.test(v) },
  { key: 'special',label: 'One special character',  test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function passwordStrength(pw) {
  const passed = RULES.filter((r) => r.test(pw)).length;
  if (!pw || passed <= 2) return 'weak';
  if (passed <= 4) return 'medium';
  return 'strong';
}

const STRENGTH_META = {
  weak:   { label: 'Weak',   color: '#dc2626', width: '33%' },
  medium: { label: 'Medium', color: '#d97706', width: '66%' },
  strong: { label: 'Strong', color: '#16a34a', width: '100%' },
};

function NewPasswordStep({ onSubmit, loading, onBack }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState('');

  const strength = passwordStrength(password);
  const allRulesPass = RULES.every((r) => r.test(password));

  const submit = (e) => {
    e.preventDefault();
    if (!allRulesPass) { setError('Password does not meet all requirements'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    onSubmit(password);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">← Back</button>
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">Create New Password</h2>
      </div>

      <div>
        <label className="label">New Password</label>
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
            <p className="text-xs font-semibold mt-1" style={{ color: STRENGTH_META[strength].color }}>{STRENGTH_META[strength].label}</p>
          </div>
        )}

        <ul className="mt-2 space-y-1">
          {RULES.map((r) => {
            const pass = r.test(password);
            return (
              <li key={r.key} className={`text-xs flex items-center gap-1.5 ${pass ? 'text-green-600' : 'text-gray-400'}`}>
                <CheckCircle size={11} className={pass ? 'text-green-500' : 'text-gray-300'} /> {r.label}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <label className="label">Confirm Password</label>
        <input
          type={show ? 'text' : 'password'}
          className="input"
          placeholder="Re-enter new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? 'Updating...' : 'Reset Password'}
      </button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function ForgotPassword() {
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
      toast.error(err.response?.data?.message || 'Could not send OTP');
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
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (newPassword) => {
    setLoading(true);
    try {
      await API.post('/auth/forgot-password/reset', { emailOrPhone, channel, newPassword });
      setStep('success');
      toast.success('Password updated successfully.');
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
              <h2 className="text-xl font-bold text-gray-800">Password updated successfully.</h2>
              <p className="text-sm text-gray-500">Redirecting you to login...</p>
            </div>
          )}

          {step !== 'success' && (
            <p className="text-center text-sm text-gray-500 mt-6">
              Remember your password?{' '}
              <Link to="/login" className="text-saffron-600 font-semibold hover:underline">Sign in</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
