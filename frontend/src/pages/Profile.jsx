import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Save, Trash2, Mail, MessageSquare, AlertTriangle, CheckCircle, RotateCcw, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import ProfilePhoto from '../components/shared/ProfilePhoto';
import PincodeInput from '../components/shared/PincodeInput';
import API from '../api/axios';

// ── Account Deletion Modal ─────────────────────────────────────────────────
function DeleteAccountModal({ onClose, onDeleted }) {
  const { t } = useTranslation();
  // step: 'warning' | 'password' | 'otp_channel' | 'otp_verify' | 'confirm' | 'done'
  const [step,         setStep]         = useState('warning');
  const [password,     setPassword]     = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [channel,      setChannel]      = useState(''); // 'email' | 'whatsapp'
  const [otp,          setOtp]          = useState('');
  const [otpId,        setOtpId]        = useState('');   // identifier used for OTP
  const [loading,      setLoading]      = useState(false);
  const [scheduledDate, setScheduledDate] = useState(null);
  const timerRef = useRef(null);

  const { user, logout } = useAuth();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const verifyPassword = async () => {
    if (!password) { toast.error(t('profile.enterPasswordError')); return; }
    setLoading(true);
    try {
      await API.post('/auth/delete-account/check-password', { password });
      setStep('otp_channel');
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.pwVerifyFailed'));
    } finally { setLoading(false); }
  };

  const sendOTP = async () => {
    setLoading(true);
    try {
      await API.post('/auth/delete-account/send-otp', { channel });
      const id = channel === 'email' ? user.email : user.phone;
      setOtpId(id);
      setStep('otp_verify');
      toast.success(t('profile.codeSentToChannel', { channel: channel === 'email' ? t('profile.emailChannel') : t('profile.whatsappChannel') }));
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.otpSendFailed'));
    } finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    if (!otp || otp.length !== 6) { toast.error(t('profile.enterSixDigitsError')); return; }
    setLoading(true);
    try {
      await API.post('/auth/verify-otp', { identifier: otpId, otp, purpose: 'account_deletion' });
      setStep('confirm');
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.invalidCode'));
    } finally { setLoading(false); }
  };

  const confirmDeletion = async () => {
    setLoading(true);
    try {
      const { data } = await API.post('/auth/delete-account/confirm', { channel });
      setScheduledDate(data.scheduledDeletionDate);
      setStep('done');
      timerRef.current = setTimeout(() => {
        logout();
        onDeleted();
      }, 4000);
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.scheduleFailed'));
    } finally { setLoading(false); }
  };

  const STEPS = { warning: 1, password: 2, otp_channel: 3, otp_verify: 3, confirm: 4, done: 5 };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-auto">

        {/* Header */}
        {step !== 'done' && (
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={16} className="text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">{t('profile.deleteAccountTitle')}</p>
                <p className="text-[10px] text-gray-400">{t('profile.modalStepOf', { step: STEPS[step] })}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">&times;</button>
          </div>
        )}

        <div className="p-6">

          {/* ── Step 1: Warning ──────────────────── */}
          {step === 'warning' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3">
                <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-1">{t('profile.beforeYouContinue')}</p>
                  <p className="text-xs text-red-600 leading-relaxed">
                    {t('profile.deleteAccountDesc')}
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-xs text-amber-700 leading-relaxed">
                  <strong>{t('profile.recoveryWindowTitle')}</strong> {t('profile.recoveryWindowDesc')}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="btn-outline flex-1">{t('common.cancel')}</button>
                <button onClick={() => setStep('password')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                  {t('common.continue')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Password verification ────── */}
          {step === 'password' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">{t('profile.enterCurrentPasswordPrompt')}</p>
              <div>
                <label className="label">{t('profile.currentPassword')}</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className="input pr-10"
                    placeholder={t('profile.currentPasswordPlaceholder')}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && verifyPassword()} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('warning')} className="btn-outline flex-1">{t('common.back')}</button>
                <button onClick={verifyPassword} disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {loading ? t('common.verifying') : t('profile.verifyPasswordBtn')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3a: OTP channel selection ───── */}
          {step === 'otp_channel' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">{t('profile.channelQuestion')}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'email', label: t('profile.emailChannel'), icon: Mail, desc: user?.email || t('profile.noEmailOnFile'), disabled: !user?.email },
                  { value: 'whatsapp', label: t('profile.whatsappChannel'), icon: MessageSquare, desc: user?.phone },
                ].map(({ value, label, icon: Icon, desc, disabled }) => (
                  <button key={value} type="button" disabled={disabled}
                    onClick={() => setChannel(value)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${channel === value ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <Icon size={20} className={`mb-2 ${channel === value ? 'text-red-600' : 'text-gray-400'}`} />
                    <p className={`text-sm font-semibold ${channel === value ? 'text-red-700' : 'text-gray-700'}`}>{label}</p>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('password')} className="btn-outline flex-1">{t('common.back')}</button>
                <button onClick={sendOTP} disabled={!channel || loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {loading ? t('common.sending') : t('profile.sendCodeBtn')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3b: OTP entry ────────────────── */}
          {step === 'otp_verify' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {t('profile.enterCodeSentTo', { channel: channel === 'email' ? t('profile.emailChannel') : t('profile.whatsappChannel') })}{' '}
                <span className="font-semibold text-gray-800">{otpId}</span>.
              </p>
              <div>
                <label className="label">{t('profile.verificationCode')}</label>
                <input className="input text-center text-2xl tracking-[0.4em] font-bold"
                  placeholder="——————" maxLength={6}
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && verifyOTP()} />
              </div>
              <button onClick={() => { setOtp(''); setStep('otp_channel'); }}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <RotateCcw size={11} /> {t('profile.resendChangeMethod')}
              </button>
              <div className="flex gap-3">
                <button onClick={() => setStep('otp_channel')} className="btn-outline flex-1">{t('common.back')}</button>
                <button onClick={verifyOTP} disabled={loading || otp.length !== 6}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {loading ? t('common.verifying') : t('profile.verifyCodeBtn')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Final confirmation ────────── */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-800 text-lg">{t('profile.confirmDeletionTitle')}</h3>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm text-gray-600">
                <p>{t('profile.confirmNote1')}</p>
                <p>{t('profile.confirmNote2')}</p>
                <p>{t('profile.confirmNote3')}</p>
                <p>{t('profile.confirmNote4')}</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-600">
                {t('profile.requestedScheduledDates', { requested: new Date().toLocaleDateString('en-IN'), scheduled: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-IN') })}
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-outline flex-1">{t('common.cancel')}</button>
                <button onClick={confirmDeletion} disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {loading ? t('common.processing') : t('profile.confirmDeletionBtn')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Done ─────────────────────── */}
          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-800 text-lg">{t('profile.deletionDoneTitle')}</h3>
              <p className="text-sm text-gray-500">
                {t('profile.deletionDoneDesc', { date: scheduledDate ? new Date(scheduledDate).toLocaleDateString('en-IN') : '—' })}
              </p>
              <p className="text-xs text-gray-400">
                {t('profile.deletionDoneNote')}
              </p>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full animate-[progressbar_4s_linear_forwards]" style={{ width: '100%' }} />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Profile() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name:     user?.name     || '',
    email:    user?.email    || '',
    pincode:  user?.pincode  || '',
    state:    user?.state    || '',
    city:     user?.city     || '',
    district: user?.district || '',
    address:  user?.address  || '',
  });
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false });
  const [pwSaving, setPwSaving] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ── WhatsApp Communication Preferences (backend consent state) ────────────
  // Source of truth is the backend WhatsAppPreference document (the same
  // system the registration screen and the WhatsApp STOP webhook use). The
  // toggles initialize from the real stored state — never hardcoded defaults.
  const [consentLoading, setConsentLoading]     = useState(true);
  const [consentError, setConsentError]         = useState(false);
  const [marketingOptedIn, setMarketingOptedIn] = useState(false);
  const [consentSaving, setConsentSaving]       = useState(false);

  const loadConsent = async () => {
    setConsentLoading(true);
    setConsentError(false);
    try {
      const { data } = await API.get('/users/consent/whatsapp');
      setMarketingOptedIn(data.consent?.whatsapp?.marketing?.status === 'opted_in');
    } catch (err) {
      setConsentError(true);
    } finally {
      setConsentLoading(false);
    }
  };

  useEffect(() => { loadConsent(); }, []);

  const handleMarketingToggle = async (next) => {
    if (consentSaving) return;              // request lock — no duplicate submits
    const previous = marketingOptedIn;
    setMarketingOptedIn(next);              // immediate interaction feedback
    setConsentSaving(true);
    try {
      const { data } = await API.patch('/users/consent/whatsapp', { marketingConsent: next });
      // Re-sync from the authoritative backend state (also covers a no-op).
      setMarketingOptedIn(data.consent?.whatsapp?.marketing?.status === 'opted_in');
      toast.success(next
        ? t('profile.promoEnabledToast')
        : t('profile.promoDisabledToast'));
    } catch (err) {
      setMarketingOptedIn(previous);        // restore previous state on failure
      toast.error(err.response?.data?.message || t('profile.prefUpdateFailed'));
    } finally {
      setConsentSaving(false);
    }
  };

  // Referral system temporarily hidden — backend intact, UI disabled
  // const [referral, setReferral] = useState(null);
  // useEffect(() => { API.get('/referral/my').then(({ data }) => setReferral(data)).catch(() => {}); }, []);

  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.patch('/users/profile', form);
      await refreshUser();
      toast.success(t('profile.updatedToast'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) { toast.error(t('profile.pwMismatch')); return; }
    if (pwForm.newPassword.length < 6)         { toast.error(t('profile.pwMinLength'));   return; }
    setPwSaving(true);
    try {
      await API.patch('/users/change-password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success(t('profile.changedToast'));
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.pwChangeFailed'));
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-spiritual-light py-10">
      <div className="max-w-3xl mx-auto px-4 space-y-6">

        <h1 className="text-2xl font-bold text-maroon-700">{t('profile.title')}</h1>

        {/* ── Photo section ─────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100">
          <h2 className="font-semibold text-gray-700 mb-4">{t('profile.photoSection')}</h2>
          <ProfilePhoto
            currentPhoto={user?.profilePhoto}
            onUpdate={refreshUser}
            endpoint="/users/profile/photo"
            deleteEndpoint="/users/profile/photo"
          />
          <div className="mt-4 text-center">
            <p className="font-bold text-gray-800">{user?.name}</p>
            <p className="text-sm text-gray-500 capitalize">{t('profile.accountType', { role: user?.role })}</p>
            <p className="text-xs text-gray-400">{user?.phone}</p>
          </div>
        </div>

        {/* ── Personal details ──────────────────────── */}
        <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100">
          <h2 className="font-semibold text-gray-700 mb-5">{t('profile.personalDetails')}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('common.fields.fullName')}</label>
                <input className="input" value={form.name} onChange={set('name')} />
              </div>
              <div>
                <label className="label">{t('common.fields.email')}</label>
                <input type="email" className="input" value={form.email} onChange={set('email')} placeholder={t('profile.emailPlaceholder')} />
              </div>
            </div>

            <div>
              <label className="label">{t('common.fields.pincode')}</label>
              <PincodeInput
                value={form.pincode}
                onChange={(v) => setForm({ ...form, pincode: v })}
                onFill={({ state, city, district }) => setForm((prev) => ({ ...prev, state, city, district }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[['state',t('common.fields.state')],['city',t('common.fields.city')],['district',t('common.fields.district')]].map(([f, l]) => (
                <div key={f}>
                  <label className="label text-xs">{l}</label>
                  <input className="input bg-saffron-50 text-sm" value={form[f]} onChange={set(f)} />
                </div>
              ))}
            </div>

            <div>
              <label className="label">{t('common.fields.address')}</label>
              <textarea rows={2} className="input resize-none" value={form.address} onChange={set('address')} placeholder={t('profile.addressPlaceholder')} />
            </div>

            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={16} /> {saving ? t('profile.saving') : t('profile.saveChanges')}
            </button>
          </form>
        </div>

        {/* Referral section temporarily hidden */}

        {/* ── WhatsApp Communication Preferences ──────────────────── */}
        <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare size={15} className="text-green-600" />
            <h2 className="font-semibold text-gray-700">{t('profile.whatsappPrefs')}</h2>
          </div>
          <p className="text-xs text-gray-400 mb-5">{t('profile.whatsappPrefsSub')}</p>

          {consentLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 animate-pulse">
                  <div className="space-y-2">
                    <div className="h-3.5 w-44 bg-gray-200 rounded" />
                    <div className="h-2.5 w-60 bg-gray-100 rounded" />
                  </div>
                  <div className="w-11 h-6 bg-gray-200 rounded-full" />
                </div>
              ))}
            </div>
          ) : consentError ? (
            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-red-50 border border-red-100">
              <p className="text-xs text-red-600">{t('profile.consentLoadError')}</p>
              <button onClick={loadConsent}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-saffron-700 border border-saffron-200 bg-white hover:bg-saffron-50 px-3 py-2 rounded-xl transition-colors">
                <RotateCcw size={12} /> {t('common.retry')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">

              {/* Transactional / service — required, mirrors registration copy */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-green-50 border border-green-100">
                <div>
                  <p className="font-semibold text-sm text-gray-700">{t('profile.transactionalTitle')}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {t('profile.transactionalDesc')}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
                    <Lock size={10} /> {t('profile.requiredNote')}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                  {t('profile.alwaysOn')}
                </span>
              </div>

              {/* Promotional / marketing — user-manageable */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border transition-colors"
                style={marketingOptedIn
                  ? { borderColor: '#f59e0b', backgroundColor: '#fffbeb' }
                  : { borderColor: '#e5e7eb', backgroundColor: '#f9fafb' }}>
                <div>
                  <p className="font-semibold text-sm text-gray-700">{t('profile.promotionalTitle')}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed max-w-xs">
                    {t('profile.promotionalDesc')}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    {t('profile.optionalStopNote')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5" title={marketingOptedIn ? t('profile.promoOffTitle') : t('profile.promoOnTitle')}>
                  <input type="checkbox" className="sr-only peer"
                    checked={marketingOptedIn}
                    disabled={consentSaving}
                    onChange={(e) => handleMarketingToggle(e.target.checked)} />
                  <div className={`w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-saffron-200 rounded-full peer peer-checked:bg-saffron-500 transition-colors ${consentSaving ? 'opacity-60' : ''}`} />
                  <span className="absolute top-0.5 left-0 w-5 h-5 translate-x-0.5 peer-checked:translate-x-5 bg-white rounded-full shadow transition-transform duration-200" />
                </label>
              </div>

            </div>
          )}
        </div>

        {/* ── Change Password ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-md p-6 border border-saffron-100">
          <h2 className="font-semibold text-gray-700 mb-5">{t('profile.changePasswordHeading')}</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            {[
              ['currentPassword', t('profile.currentPassword'), 'current'],
              ['newPassword',     t('profile.newPassword'),     'new'],
              ['confirm',         t('profile.confirmNewPassword'), 'new'],
            ].map(([field, label, showKey]) => (
              <div key={field}>
                <label className="label">{label}</label>
                <div className="relative">
                  <input type={showPw[showKey] ? 'text' : 'password'} className="input pr-10"
                    value={pwForm[field]}
                    onChange={(e) => setPwForm({ ...pwForm, [field]: e.target.value })} />
                  <button type="button" onClick={() => setShowPw({ ...showPw, [showKey]: !showPw[showKey] })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw[showKey] ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            ))}
            <button type="submit" disabled={pwSaving} className="btn-primary flex items-center gap-2">
              <Save size={16} /> {pwSaving ? t('profile.changing') : t('profile.changePasswordHeading')}
            </button>
          </form>
        </div>

        {/* ── Privacy & Security ───────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-md p-6 border border-red-100">
          <h2 className="font-semibold text-gray-700 mb-1">{t('profile.privacySecurity')}</h2>
          <p className="text-xs text-gray-400 mb-5">{t('profile.privacySecuritySub')}</p>

          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-red-50 border border-red-100">
            <div>
              <p className="font-semibold text-red-700 text-sm">{t('profile.deleteAccountTitle')}</p>
              <p className="text-xs text-red-500 mt-0.5 max-w-xs leading-relaxed">
                {t('profile.deleteAccountDesc')}
              </p>
            </div>
            <button onClick={() => setShowDeleteModal(true)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-300 bg-white hover:bg-red-50 px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
              <Trash2 size={13} /> {t('profile.deleteAccountBtn')}
            </button>
          </div>
        </div>

      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => navigate('/login')}
        />
      )}

    </div>
  );
}
