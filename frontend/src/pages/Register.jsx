import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle, Mail, MessageCircle, Upload, X, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import PincodeInput from '../components/shared/PincodeInput';
import API from '../api/axios';
import { getStoredLanguage } from '../utils/languageStorage';
import { useTranslation } from 'react-i18next';

// ─── Communication consent (WhatsApp opt-in) ───────────────────────────────
// Wording taken VERBATIM from the client's WhatsApp consent reference
// document (signup consent statements). Business/legal artifact — do not edit
// without approval. `consentVersion` is sent to the backend and stored on
// each consent event, so the exact copy a user saw is preserved.
const SERVICE_CONSENT_TEXT =
  'I agree to receive WhatsApp messages from the company regarding my account, bookings, orders and services.';
const MARKETING_CONSENT_TEXT =
  'I would also like to receive offers, discounts and promotional updates from the company on WhatsApp.';
const CONSENT_VERSION = 'v1.0';

// ─── Step 1: Role selection ────────────────────────────────────
function RoleStep({ onSelect }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 text-center">
      <h2 className="text-xl font-bold text-gray-800">{t('auth.whoJoiningAs')}</h2>
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => onSelect('devotee')}
          className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-saffron-200 hover:border-saffron-500 hover:bg-saffron-50 transition-all">
          <span className="text-4xl">🙏</span>
          <div>
            <p className="font-bold text-gray-800">{t('auth.devoteeRole')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('auth.devoteeRoleDesc')}</p>
          </div>
        </button>
        <button onClick={() => onSelect('pandit')}
          className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-saffron-200 hover:border-saffron-500 hover:bg-saffron-50 transition-all">
          <span className="text-4xl">🪔</span>
          <div>
            <p className="font-bold text-gray-800">{t('auth.panditRole')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('auth.panditRoleDesc')}</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Shared: basic info step ───────────────────────────────────
function BasicInfoStep({ form, setForm, errors, onBack, onNext, loading, backLabel = 'Change role' }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">
        ← {backLabel}
      </button>
      <div>
        <label className="label">{t('auth.fullNameLabel')}</label>
        <input className={`input ${errors.name ? 'border-red-400' : ''}`} placeholder={t('auth.fullNamePlaceholder')}
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>
      <div>
        <label className="label">{t('auth.emailLabel')}</label>
        <input type="email" className={`input ${errors.email ? 'border-red-400' : ''}`} placeholder="your@email.com"
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
      </div>
      <div>
        <label className="label">{t('auth.phoneLabel')}</label>
        <input className={`input ${errors.phone ? 'border-red-400' : ''}`} placeholder={t('auth.phonePlaceholder')} maxLength={10}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/, '') })} />
        {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
      </div>
      <button onClick={onNext} disabled={loading} className="btn-primary w-full py-3 text-base">
        {loading ? t('auth.pleaseWait') : t('auth.continueArrow')}
      </button>
    </div>
  );
}

// ─── Shared: OTP channel selection ───────────────────────────
function OTPChannelStep({ form, onSend, loading, onBack }) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState('');

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">← {t('common.back')}</button>
      <div>
        <p className="text-gray-700 font-semibold mb-3">{t('auth.howReceiveOtp')}</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setChannel('email')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${channel === 'email' ? 'border-saffron-500 bg-saffron-50' : 'border-gray-200 hover:border-saffron-300'}`}>
            <Mail size={22} className={channel === 'email' ? 'text-saffron-600' : 'text-gray-400'} />
            <div className="text-center">
              <p className="font-semibold text-sm text-gray-800">{t('auth.emailOtp')}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[100px]">{form.email}</p>
            </div>
          </button>
          <button type="button" onClick={() => setChannel('whatsapp')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${channel === 'whatsapp' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
            <MessageCircle size={22} className={channel === 'whatsapp' ? 'text-green-600' : 'text-gray-400'} />
            <div className="text-center">
              <p className="font-semibold text-sm text-gray-800">{t('auth.whatsappOtp')}</p>
              <p className="text-xs text-gray-500 mt-0.5">+91 {form.phone}</p>
            </div>
          </button>
        </div>
        {!channel && <p className="text-xs text-gray-400 text-center mt-2">{t('auth.selectMethodFirst')}</p>}
      </div>
      <button onClick={() => channel && onSend(channel)} disabled={!channel || loading}
        className="btn-primary w-full py-3">
        {loading ? t('auth.sendingOtp') : t('auth.sendOtp')}
      </button>
    </div>
  );
}

// ─── Shared: OTP verification step ────────────────────────────
function OTPVerifyStep({ form, channel, onVerify, onResend, loading, onBack }) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleDigit = (val, idx) => {
    const digits = val.replace(/\D/, '').slice(-1);
    const arr    = otp.split('');
    arr[idx]     = digits;
    const next   = arr.join('').slice(0, 6);
    setOtp(next);
    if (digits && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await onResend(channel);
      setCooldown(30);
      toast.success(t('auth.otpResentToast'));
    } catch { toast.error(t('auth.otpResendFailed')); }
    finally { setResending(false); }
  };

  const identifier = channel === 'email' ? form.email : `+91 ${form.phone}`;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">← {t('common.back')}</button>
      <div className="text-center">
        {channel === 'email' ? <Mail size={32} className="mx-auto text-saffron-500 mb-2" /> : <MessageCircle size={32} className="mx-auto text-green-500 mb-2" />}
        <p className="font-semibold text-gray-800">{t('auth.enterOtpTitle')}</p>
        <p className="text-sm text-gray-500 mt-1">Sent to <strong>{identifier}</strong></p>
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

      <button onClick={() => otp.length === 6 && onVerify(otp)} disabled={otp.length < 6 || loading}
        className="btn-primary w-full py-3">
        {loading ? t('common.verifying') : t('auth.verifyOtp')}
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

// ─── Consent checkbox row (service / marketing, WhatsApp) ──────
// Service consent is pre-checked (transactional messaging is the platform's
// core function). Marketing consent is UNCHECKED by default — WhatsApp OTP
// verification must never be interpreted as marketing opt-in.
function ConsentRow({ checked, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left p-3 rounded-xl border transition-colors"
      style={checked
        ? { borderColor: '#f59e0b', backgroundColor: '#fffbeb' }
        : { borderColor: '#e5e7eb', backgroundColor: '#f9fafb' }}>
      <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center text-white ${checked ? 'bg-saffron-500 border-saffron-500' : 'border-gray-300 bg-white'}`}>
        {checked && '✓'}
      </span>
      <span className="text-sm text-gray-600">
        {label}
        {hint && <span className="block text-xs text-gray-400 mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}

// ─── Devotee: password step ────────────────────────────────────
function DevoteePasswordStep({ form, setForm, onSubmit, loading, onBack, initialReferralCode }) {
  const { t } = useTranslation();
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode || '');
  const [show, setShow]               = useState(false);
  const [serviceConsent, setServiceConsent]   = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [errors, setErrors]           = useState({});

  const validate = () => {
    const e = {};
    if (!password)            e.password = t('auth.passwordRequiredReg');
    else if (password.length < 6) e.password = t('auth.min6Chars');
    if (password !== confirm) e.confirm  = t('auth.passwordsNoMatch');
    return e;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(password, referralCode, { serviceConsent, marketingConsent });
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">← {t('common.back')}</button>
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-green-700">
        <CheckCircle size={18} className="shrink-0" />
        <p className="text-sm font-medium">{t('auth.phoneVerifiedMsg')}</p>
      </div>
      <div>
        <label className="label">{t('auth.passwordLabel')}</label>
        <div className="relative">
          <input type={show ? 'text' : 'password'} className={`input pr-10 ${errors.password ? 'border-red-400' : ''}`}
            placeholder={t('auth.min6Chars')} value={password} onChange={(e) => { setPassword(e.target.value); setErrors({ ...errors, password: '' }); }} />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
      </div>
      <div>
        <label className="label">{t('auth.confirmPasswordLabel')}</label>
        <input type="password" className={`input ${errors.confirm ? 'border-red-400' : ''}`}
          placeholder={t('auth.reenterPassword')} value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors({ ...errors, confirm: '' }); }} />
        {errors.confirm && <p className="text-red-500 text-xs mt-1">{errors.confirm}</p>}
      </div>
      <div>
        <label className="label flex items-center gap-1.5"><Gift size={13} className="text-saffron-500" /> {t('auth.referralCode')}</label>
        <input className="input uppercase" placeholder={t('auth.referralPlaceholder')} maxLength={10}
          value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} />
      </div>

      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('auth.whatsappCommPrefs')}</p>
        <ConsentRow
          checked={serviceConsent}
          onChange={setServiceConsent}
          label={t('auth.serviceConsentText')}
          hint={t('auth.serviceConsentHint')}
        />
        <ConsentRow
          checked={marketingConsent}
          onChange={setMarketingConsent}
          label={t('auth.marketingConsentText')}
          hint={t('auth.marketingConsentHint')}
        />
      </div>

      <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full py-3">
        {loading ? t('auth.creatingAccount') : t('auth.createAccountBtn')}
      </button>
    </div>
  );
}

// ─── Pandit: full form step ────────────────────────────────────
const SPECIALIZATIONS = [
  'Griha Pravesh','Satyanarayan Katha','Wedding','Mundan','Naamkaran',
  'Rudrabhishek','Kaal Sarp Dosh','Navgraha Puja','Vastu Shanti','Ganesh Puja',
];
const LANGUAGES = ['Hindi','Sanskrit','English','Bengali','Tamil','Telugu','Kannada','Marathi','Gujarati','Punjabi'];

function PanditProfileStep({ basicForm, onSubmit, loading, onBack }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    pincode:'', state:'', city:'', district:'', address:'',
    govtIdType:'', govtIdNumber:'',
    bio:'', experience:'', password:'', confirmPassword:'',
    specializations:[], languages:[],
  });
  const [govtIdFile, setGovtIdFile] = useState(null);
  const [show, setShow]     = useState(false);
  const [errors, setErrors] = useState({});

  const set = (f) => (e) => { setForm({ ...form, [f]: e.target.value }); setErrors({ ...errors, [f]: '' }); };
  const toggleArr = (field, val) => setForm((p) => ({ ...p, [field]: p[field].includes(val) ? p[field].filter((x) => x !== val) : [...p[field], val] }));

  const validate = () => {
    const e = {};
    if (!form.govtIdType)                       e.govtIdType = t('auth.selectIdType');
    if (!govtIdFile)                            e.govtIdFile = t('auth.idUploadRequired');
    if (!form.password)                         e.password   = t('auth.passwordRequiredReg');
    else if (form.password.length < 6)          e.password   = t('auth.min6Chars');
    if (form.password !== form.confirmPassword) e.confirmPassword = t('auth.passwordsNoMatch');
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const fd = new FormData();
    // Basic info from previous step
    fd.append('name',  basicForm.name);
    fd.append('email', basicForm.email);
    fd.append('phone', basicForm.phone);
    fd.append('password', form.password);
    // Profile info
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'confirmPassword' || k === 'password') return;
      if (Array.isArray(v)) fd.append(k, JSON.stringify(v));
      else if (v !== '') fd.append(k, v);
    });
    fd.append('govtIdImage', govtIdFile);
    onSubmit(fd);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-saffron-600 hover:underline">← {t('common.back')}</button>
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-green-700 text-sm">
        <CheckCircle size={16} className="shrink-0" />
        {t('auth.otpVerifiedFor', { email: basicForm.email })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('auth.govtIdType')}</label>
          <select className={`input ${errors.govtIdType ? 'border-red-400' : ''}`} value={form.govtIdType} onChange={set('govtIdType')}>
            <option value="">{t('auth.selectId')}</option>
            {[['aadhaar', t('auth.idAadhaar')],['pan', t('auth.idPan')],['voter', t('auth.idVoter')],['passport', t('auth.idPassport')],['driving', t('auth.idDriving')]].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {errors.govtIdType && <p className="text-red-500 text-xs mt-1">{errors.govtIdType}</p>}
        </div>
        <div>
          <label className="label">{t('auth.idNumberOptional')}</label>
          <input className="input" placeholder={t('auth.idNumberPlaceholder')} value={form.govtIdNumber} onChange={set('govtIdNumber')} />
        </div>
      </div>

      <div>
        <label className="label">{t('auth.uploadGovtId')}</label>
        <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${errors.govtIdFile ? 'border-red-400 bg-red-50' : 'border-saffron-200 hover:border-saffron-400 hover:bg-saffron-50'}`}>
          <Upload size={20} className="text-saffron-500 shrink-0" />
          <span className="text-sm text-gray-600 flex-1 truncate">
            {govtIdFile ? govtIdFile.name : t('auth.clickUploadId')}
          </span>
          {govtIdFile && (
            <button type="button" onClick={(e) => { e.preventDefault(); setGovtIdFile(null); }} className="text-gray-400 hover:text-red-500">
              <X size={16} />
            </button>
          )}
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { setGovtIdFile(e.target.files[0] || null); setErrors({ ...errors, govtIdFile: '' }); }} />
        </label>
        {errors.govtIdFile && <p className="text-red-500 text-xs mt-1">{errors.govtIdFile}</p>}
      </div>

      <div>
        <label className="label">{t('common.fields.pincode')}</label>
        <PincodeInput value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })}
          onFill={({ state, city, district }) => setForm((p) => ({ ...p, state, city, district }))} />
      </div>

      {form.state && (
        <div className="grid grid-cols-3 gap-3">
          {[[['state',t('common.fields.state')],['city',t('common.fields.city')],['district',t('common.fields.district')]]].map((fields) => fields.map(([f,l]) => (
            <div key={f}>
              <label className="label text-xs">{l}</label>
              <input className="input bg-saffron-50 text-sm" value={form[f]} onChange={set(f)} />
            </div>
          )))}
        </div>
      )}

      <div>
        <label className="label">{t('common.fields.address')}</label>
        <textarea className="input min-h-[60px] resize-none" placeholder={t('auth.addressPlaceholderFull')} value={form.address} onChange={set('address')} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label">{t('auth.bioOptional')}</label>
          <textarea className="input min-h-[60px] resize-none text-sm" placeholder={t('auth.bioPlaceholder')} value={form.bio} onChange={set('bio')} />
        </div>
        <div>
          <label className="label">{t('auth.experienceYears')}</label>
          <input type="number" min="0" className="input" placeholder={t('auth.experiencePlaceholder')} value={form.experience} onChange={set('experience')} />
        </div>
      </div>

      <div>
        <label className="label">{t('auth.specializations')}</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {SPECIALIZATIONS.map((s) => (
            <button key={s} type="button" onClick={() => toggleArr('specializations', s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.specializations.includes(s) ? 'bg-saffron-500 text-white border-saffron-500' : 'bg-white text-gray-600 border-gray-200 hover:border-saffron-300'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">{t('auth.languages')}</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {LANGUAGES.map((l) => (
            <button key={l} type="button" onClick={() => toggleArr('languages', l)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.languages.includes(l) ? 'bg-maroon-600 text-white border-maroon-600' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('auth.passwordLabel')}</label>
          <div className="relative">
            <input type={show ? 'text' : 'password'} className={`input pr-10 ${errors.password ? 'border-red-400' : ''}`}
              placeholder={t('auth.min6Chars')} value={form.password} onChange={set('password')} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
        </div>
        <div>
          <label className="label">{t('auth.confirmPasswordLabel')}</label>
          <input type="password" className={`input ${errors.confirmPassword ? 'border-red-400' : ''}`}
            placeholder={t('auth.reenterPassword')} value={form.confirmPassword} onChange={set('confirmPassword')} />
          {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
        </div>
      </div>

      <p className="text-xs text-gray-500 bg-saffron-50 rounded-xl p-3 border border-saffron-100">
        {t('auth.applicationNote')}
      </p>

      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? t('auth.submittingApplication') : t('auth.submitApplication')}
      </button>
    </form>
  );
}

// ─── Success screens ──────────────────────────────────────────
function DevoteeSuccess({ name }) {
  const { t } = useTranslation();
  return (
    <div className="text-center space-y-4 py-4">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle size={40} className="text-green-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800">{t('auth.devoteeSuccessTitle', { name })}</h2>
      <p className="text-gray-600 text-sm">{t('auth.devoteeSuccessDesc')}</p>
    </div>
  );
}

function PanditAccountCreated() {
  const { t } = useTranslation();
  return (
    <div className="text-center space-y-4 py-4">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle size={40} className="text-green-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800">{t('auth.accountCreatedTitle')}</h2>
      <p className="text-gray-600 text-sm leading-relaxed">
        {t('auth.panditAccessDesc')}
      </p>
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-left space-y-2">
        <p className="text-sm font-semibold text-amber-800">{t('auth.completeStepsTitle')}</p>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>{t('auth.onboardingStepProfile')}</li>
          <li>{t('auth.onboardingStepKyc')}</li>
          <li>{t('auth.onboardingStepReview')}</li>
          <li>{t('auth.onboardingStepAccept')}</li>
        </ul>
      </div>
      <p className="text-xs text-gray-400">{t('auth.redirectingDashboard')}</p>
    </div>
  );
}

// ─── Main Register page ────────────────────────────────────────
export default function Register() {
  const [searchParams] = useSearchParams();
  const initialRef     = searchParams.get('ref') || '';
  const next            = searchParams.get('next') || '/';
  const navigate       = useNavigate();
  const { login }      = useAuth();
  const { t }          = useTranslation();

  const { logoUrl, platformName } = useSettings();
  const [role, setRole]     = useState(null);                // 'devotee' | 'pandit'
  const [step, setStep]     = useState('role');              // role | info | channel | otp | password | profile | done
  const [basicForm, setBasicForm] = useState({ name:'', email:'', phone:'' });
  const [channel, setChannel]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [otpErrors, setOtpErrors] = useState({});
  const [successName, setSuccessName] = useState('');

  const validateBasic = () => {
    const e = {};
    if (!basicForm.name)                              e.name  = t('auth.nameRequired');
    if (!basicForm.email)                             e.email = t('auth.emailRequired');
    else if (!/\S+@\S+\.\S+/.test(basicForm.email))  e.email = t('auth.invalidEmail');
    if (!basicForm.phone)                             e.phone = t('auth.phoneRequired');
    else if (!/^[6-9]\d{9}$/.test(basicForm.phone))  e.phone = t('auth.invalidPhone');
    return e;
  };

  const handleBasicNext = () => {
    const errs = validateBasic();
    if (Object.keys(errs).length) { setOtpErrors(errs); return; }
    setOtpErrors({});
    setStep('channel');
  };

  const sendOTP = async (ch) => {
    setLoading(true);
    setChannel(ch);
    try {
      await API.post('/auth/send-otp', { ...basicForm, channel: ch });
      toast.success(t('auth.otpSentToast', { channel: ch === 'email' ? 'email' : 'WhatsApp' }));
      setStep('otp');
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.otpSendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (otp) => {
    setLoading(true);
    const identifier = channel === 'email' ? basicForm.email : basicForm.phone;
    try {
      await API.post('/auth/verify-otp', { identifier, otp, purpose: 'registration' });
      toast.success(t('auth.otpVerifiedToast'));
      setStep('password');
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  const completeDevoteeRegistration = async (password, referralCode, consent = {}) => {
    setLoading(true);
    try {
      const { data } = await API.post('/auth/complete-registration', {
        ...basicForm,
        password,
        channel,
        referralCode: referralCode || undefined,
        // Migrate the guest's locally-stored language preference into the new
        // account (only applied server-side if the account has no DB value
        // yet — see auth.controller.js's completeRegistration).
        preferredLanguage: getStoredLanguage(),
        // WhatsApp communication consent (separate from OTP verification)
        serviceConsent:      consent.serviceConsent,
        marketingConsent:    consent.marketingConsent,
        serviceConsentText:      consent.serviceConsent      ? SERVICE_CONSENT_TEXT      : '',
        serviceConsentVersion:   consent.serviceConsent      ? CONSENT_VERSION           : '',
        marketingConsentText:    consent.marketingConsent    ? MARKETING_CONSENT_TEXT    : '',
        marketingConsentVersion: consent.marketingConsent    ? CONSENT_VERSION           : '',
      });
      // Auto-login
      localStorage.setItem('zutsav_token', data.token);
      localStorage.setItem('zutsav_user',  JSON.stringify(data.user));
      setSuccessName(data.user.name);
      setStep('done');
      toast.success(t('auth.welcomeToast', { name: data.user.name }));
      setTimeout(() => navigate(next, { replace: true }), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const completePanditRegistration = async (password, referralCode, consent = {}) => {
    setLoading(true);
    try {
      const { data } = await API.post('/auth/complete-registration', {
        ...basicForm,
        password,
        channel,
        role: 'pandit',
        preferredLanguage: getStoredLanguage(),
        // WhatsApp communication consent (separate from OTP verification)
        serviceConsent:      consent.serviceConsent,
        marketingConsent:    consent.marketingConsent,
        serviceConsentText:      consent.serviceConsent      ? SERVICE_CONSENT_TEXT      : '',
        serviceConsentVersion:   consent.serviceConsent      ? CONSENT_VERSION           : '',
        marketingConsentText:    consent.marketingConsent    ? MARKETING_CONSENT_TEXT    : '',
        marketingConsentVersion: consent.marketingConsent    ? CONSENT_VERSION           : '',
      });
      localStorage.setItem('zutsav_token', data.token);
      localStorage.setItem('zutsav_user',  JSON.stringify(data.user));
      setStep('done');
      toast.success(t('auth.panditCreatedToast'));
      setTimeout(() => navigate('/pandit/dashboard'), 1800);
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const stepTitle = {
    role:     t('auth.stepCreateAccount'),
    info:     role === 'devotee' ? t('auth.stepDevoteeRegistration') : t('auth.stepPanditRegistration'),
    channel:  t('auth.stepVerifyIdentity'),
    otp:      t('auth.stepEnterOtp'),
    password: t('auth.stepSetPassword'),
    done:     role === 'devotee' ? t('auth.accountCreatedTitle') : 'Welcome to Zutsav!',
  };

  return (
    <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center mb-4">
            {logoUrl
              ? <img src={logoUrl} alt={platformName || 'Zutsav'} className="h-14 w-auto object-contain" />
              : <span className="font-serif text-3xl font-bold text-maroon-600">{platformName || 'Zutsav'}</span>
            }
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">{stepTitle[step] || 'Register'}</h1>
          {step === 'role' && <p className="text-gray-500 mt-1 text-sm">{t('auth.registerSubtitle')}</p>}
        </div>

        <div className={`bg-white rounded-3xl shadow-xl border border-saffron-100 ${step === 'profile' ? 'p-6' : 'p-8'}`}>
          {step === 'role' && (
            <RoleStep onSelect={(r) => { setRole(r); setStep('info'); }} />
          )}

          {step === 'info' && (
            <BasicInfoStep
              form={basicForm} setForm={setBasicForm}
              errors={otpErrors}
              onBack={() => { setStep('role'); setOtpErrors({}); }}
              onNext={handleBasicNext}
              loading={loading}
            />
          )}

          {step === 'channel' && (
            <OTPChannelStep
              form={basicForm}
              onSend={sendOTP}
              loading={loading}
              onBack={() => setStep('info')}
            />
          )}

          {step === 'otp' && (
            <OTPVerifyStep
              form={basicForm}
              channel={channel}
              onVerify={verifyOTP}
              onResend={sendOTP}
              loading={loading}
              onBack={() => setStep('channel')}
            />
          )}

          {step === 'password' && role === 'devotee' && (
            <DevoteePasswordStep
              form={basicForm} setForm={setBasicForm}
              onSubmit={completeDevoteeRegistration}
              loading={loading}
              onBack={() => setStep('otp')}
              initialReferralCode={initialRef}
            />
          )}

          {step === 'password' && role === 'pandit' && (
            <DevoteePasswordStep
              form={basicForm} setForm={setBasicForm}
              onSubmit={completePanditRegistration}
              loading={loading}
              onBack={() => setStep('otp')}
              initialReferralCode=""
            />
          )}

          {step === 'done' && (
            role === 'devotee'
              ? <DevoteeSuccess name={successName} />
              : <PanditAccountCreated />
          )}

          {!['done'].includes(step) && (
            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-saffron-600 font-semibold hover:underline">{t('auth.signIn')}</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
