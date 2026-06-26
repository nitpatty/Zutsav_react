import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  User, MapPin, GraduationCap, Briefcase, Star, Heart, CreditCard, ShieldCheck,
  Save, Upload, Plus, Trash2, Search, CheckCircle, Clock, XCircle, FileText,
  BadgeCheck, AlertTriangle, RefreshCw, Info, Loader, Languages,
} from 'lucide-react';
import ZutsavLoader, { ZutsavLoaderInline } from '../components/shared/ZutsavLoader';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import ProfilePhoto from '../components/shared/ProfilePhoto';
import PincodeInput from '../components/shared/PincodeInput';
import MapPicker, { forwardGeocode } from '../components/shared/MapPicker';
import { formatDuration, parseDurationForForm } from '../utils/durationFormatter';

const LANGUAGE_OPTIONS = [
  'Hindi','English','Sanskrit','Marathi','Punjabi','Gujarati',
  'Tamil','Telugu','Kannada','Bengali','Odia','Malayalam','Urdu','Bhojpuri',
];

const COVERAGE_OPTIONS = [
  { value: 'radius',    label: 'Custom Radius' },
  { value: 'city',      label: 'Entire City' },
  { value: 'district',  label: 'Entire District' },
  { value: 'state',     label: 'Entire State' },
  { value: 'pan_india', label: 'Pan India' },
];
const RADIUS_OPTIONS = [5, 10, 20, 25, 50, 100];

const PROFILE_TABS = [
  { id: 'personal',    label: 'Personal Details',             icon: User },
  { id: 'address',     label: 'Languages & Address',          icon: MapPin },
  { id: 'education',   label: 'Education',                    icon: GraduationCap },
  { id: 'experience',  label: 'Experience & Specializations', icon: Briefcase },
  { id: 'poojas',      label: 'Pooja Services',               icon: Star },
  { id: 'family',      label: 'Family Information',           icon: Heart },
  { id: 'payment',     label: 'Bank & UPI Details',           icon: CreditCard },
  { id: 'kyc',         label: 'KYC Verification',             icon: ShieldCheck },
];

const KYC_STATUS_CONFIG = {
  not_submitted:     { label: 'Not Submitted',     color: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400'    },
  submitted:         { label: 'Under Review',      color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
  approved:          { label: 'Approved',          color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'   },
  rejected:          { label: 'Rejected',          color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'     },
  reupload_required: { label: 'Re-upload Required',color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500'  },
};

function calcCompletion(pandit) {
  const checks = [
    !!pandit.profilePhoto,
    !!pandit.fatherName,
    !!pandit.gender,
    !!pandit.dob,
    !!pandit.bio,
    !!pandit.address,
    (pandit.languages?.length > 0),
    (pandit.qualifications?.length > 0),
    (pandit.specializations?.length > 0),
    (pandit.selectedPoojas?.length > 0),
    !!(pandit.bankDetails?.accountNumber || pandit.upiDetails?.upiId),
    !!(pandit.kycStatus && pandit.kycStatus !== 'not_submitted'),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ── Tab 1: Personal Details ─────────────────────────────────────
function PersonalDetailsTab({ pandit, reload }) {
  const [form, setForm] = useState({
    name:       pandit.name       || '',
    fatherName: pandit.fatherName || '',
    phone:      pandit.phone      || '',
    gender:     pandit.gender     || '',
    dob:        pandit.dob ? pandit.dob.split('T')[0] : '',
    bio:        pandit.bio        || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const age = form.dob ? Math.floor((Date.now() - new Date(form.dob)) / (365.25 * 864e5)) : null;

  const save = async () => {
    setSaving(true);
    try {
      await API.patch('/pandits/me/personal', form);
      await reload();
      toast.success('Personal details saved');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const completion = calcCompletion(pandit);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col sm:flex-row items-center gap-5">
        <ProfilePhoto currentPhoto={pandit.profilePhoto} onUpdate={reload}
          endpoint="/pandits/me/photo" deleteEndpoint="/pandits/me/photo" size="md" />
        <div className="flex-1 text-center sm:text-left w-full">
          <p className="font-semibold text-gray-700 mb-1">Profile Completion</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-saffron-500 rounded-full transition-all" style={{ width: `${completion}%` }} />
            </div>
            <span className="text-sm font-bold text-saffron-600 shrink-0">{completion}%</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${pandit.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              KYC: {pandit.govtIdType?.toUpperCase() || 'Pending'}
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${pandit.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {pandit.status === 'approved' ? '✓ Verified' : pandit.status?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Your full name" />
          </div>
          <div>
            <label className="label">Father's Name</label>
            <input className="input" value={form.fatherName} onChange={set('fatherName')} placeholder="Father's full name" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Mobile Number *</label>
            <input className="input" value={form.phone} onChange={set('phone')} maxLength={10} placeholder="10-digit number" />
          </div>
          <div>
            <label className="label">Email (read-only)</label>
            <input className="input bg-gray-50 cursor-not-allowed" value={pandit.email} readOnly />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={set('gender')}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <div className="flex gap-2 items-center">
              <input type="date" className="input flex-1" value={form.dob} onChange={set('dob')}
                max={new Date().toISOString().split('T')[0]} />
              {age !== null && <span className="text-sm text-saffron-600 font-semibold shrink-0">{age} yrs</span>}
            </div>
          </div>
        </div>
        <div>
          <label className="label">About Me</label>
          <textarea className="input min-h-[90px] resize-none text-sm" value={form.bio}
            onChange={set('bio')} placeholder="Tell devotees about your background, approach, and experience..." />
        </div>
        <button onClick={save} disabled={saving} className="btn-primary px-6 py-2.5 flex items-center gap-2">
          <Save size={15} /> {saving ? 'Saving...' : 'Save Personal Details'}
        </button>
      </div>
    </div>
  );
}

// ── Tab 2: Languages & Address ──────────────────────────────────
function LanguagesAddressTab({ pandit, reload }) {
  const [selectedLangs, setSelectedLangs] = useState(pandit.languages || []);
  const [customLang, setCustomLang] = useState('');
  const [addrForm, setAddrForm] = useState({
    pincode:  pandit.pincode   || '',
    state:    pandit.state     || '',
    city:     pandit.city      || '',
    district: pandit.district  || '',
    address:  pandit.address   || '',
  });
  const [coords, setCoords] = useState({
    lat: pandit.latitude  || 20.5937,
    lng: pandit.longitude || 78.9629,
  });
  const [coverage, setCoverage] = useState({
    type:     pandit.serviceCoverage?.type     || 'city',
    radiusKm: pandit.serviceCoverage?.radiusKm || 25,
  });
  const [saving, setSaving] = useState(false);
  const [geoStatus, setGeoStatus] = useState('idle');
  const geocodeTimerRef = useRef(null);
  const userChangedRef  = useRef(false);

  const toggleLang = (lang) => {
    setSelectedLangs((prev) => prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]);
  };
  const addCustom = () => {
    const v = customLang.trim();
    if (v && !selectedLangs.includes(v)) { setSelectedLangs((p) => [...p, v]); setCustomLang(''); }
  };
  const onPinMove = (lat, lng, address) => {
    setCoords({ lat, lng });
    if (address) setAddrForm((p) => ({ ...p, address }));
  };
  const handleAddrChange = (field) => (e) => {
    userChangedRef.current = true;
    setAddrForm((p) => ({ ...p, [field]: e.target.value }));
  };

  useEffect(() => {
    if (!userChangedRef.current) return;
    const { address, city, state, pincode } = addrForm;
    if (!address && !city && !state && !pincode) return;
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setGeoStatus('loading');
    geocodeTimerRef.current = setTimeout(async () => {
      const result = await forwardGeocode(address, city, state, pincode);
      if (result.found) {
        setCoords({ lat: result.lat, lng: result.lng });
        setGeoStatus('idle');
      } else {
        setGeoStatus('notfound');
        setTimeout(() => setGeoStatus((prev) => prev === 'notfound' ? 'idle' : prev), 3000);
      }
    }, 900);
  }, [addrForm.address, addrForm.city, addrForm.state, addrForm.pincode]);

  const save = async () => {
    setSaving(true);
    try {
      await API.patch('/pandits/me/languages-address', {
        languages: selectedLangs, ...addrForm,
        latitude: coords.lat, longitude: coords.lng,
        serviceCoverage: coverage,
      });
      await reload();
      toast.success('Languages & Address saved');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Languages size={18} className="text-saffron-500" />
          <h3 className="font-semibold text-gray-800">Languages Known</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((lang) => {
            const active = selectedLangs.includes(lang);
            return (
              <button key={lang} type="button" onClick={() => toggleLang(lang)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${active ? 'bg-saffron-500 text-white border-saffron-500' : 'bg-white text-gray-600 border-gray-200 hover:border-saffron-300'}`}>
                {active && <span className="mr-1">✓</span>}{lang}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1 text-sm" value={customLang} onChange={(e) => setCustomLang(e.target.value)}
            placeholder="Add other language..." onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
          <button onClick={addCustom} className="btn-outline px-4 py-2 text-sm">Add</button>
        </div>
        {selectedLangs.filter((l) => !LANGUAGE_OPTIONS.includes(l)).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedLangs.filter((l) => !LANGUAGE_OPTIONS.includes(l)).map((lang) => (
              <span key={lang} className="bg-saffron-100 text-saffron-700 text-sm px-3 py-1 rounded-full flex items-center gap-1">
                {lang}
                <button onClick={() => setSelectedLangs((p) => p.filter((l) => l !== lang))} className="hover:text-red-500 ml-1">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-saffron-500" />
          <h3 className="font-semibold text-gray-800">Address</h3>
        </div>
        <PincodeInput
          value={addrForm.pincode}
          onChange={(v) => { userChangedRef.current = true; setAddrForm((p) => ({ ...p, pincode: v })); }}
          onFill={({ state, city, district }) => {
            userChangedRef.current = true;
            setAddrForm((p) => ({ ...p, state, city, district }));
            if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
            setGeoStatus('loading');
            forwardGeocode(addrForm.address, city, state, addrForm.pincode).then((result) => {
              if (result.found) { setCoords({ lat: result.lat, lng: result.lng }); setGeoStatus('idle'); }
              else { setGeoStatus('notfound'); setTimeout(() => setGeoStatus((prev) => prev === 'notfound' ? 'idle' : prev), 3000); }
            });
          }}
        />
        {addrForm.state && (
          <div className="grid grid-cols-3 gap-3">
            {[['state','State'],['city','City'],['district','District']].map(([f,l]) => (
              <div key={f}>
                <label className="label text-xs">{l}</label>
                <input className="input bg-saffron-50 text-sm" value={addrForm[f]} onChange={handleAddrChange(f)} />
              </div>
            ))}
          </div>
        )}
        <div>
          <label className="label">Full Address</label>
          <textarea className="input min-h-[60px] resize-none text-sm" value={addrForm.address}
            onChange={handleAddrChange('address')} placeholder="House/flat, street, locality..." />
        </div>
        <div>
          <label className="label">Pin Location on Map</label>
          <p className="text-xs text-gray-400 mb-2">Drag the pin or click on the map to set your exact location</p>
          {geoStatus === 'loading' && (
            <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl mb-2">
              <ZutsavLoaderInline size={14} /> Updating map location...
            </div>
          )}
          {geoStatus === 'notfound' && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl mb-2">
              Nearby location shown — enter more details for a precise pin.
            </div>
          )}
          <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 320 }}>
            <MapPicker lat={coords.lat} lng={coords.lng} onPinMove={onPinMove} />
          </div>
          {coords.lat && (
            <p className="text-xs text-gray-400 mt-1.5">Coordinates: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-saffron-500" />
          <h3 className="font-semibold text-gray-800">Service Coverage Area</h3>
        </div>
        <p className="text-xs text-gray-500">Define the area where you are willing to travel for pooja services.</p>
        <div>
          <label className="label">Coverage Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {COVERAGE_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => setCoverage((c) => ({ ...c, type: opt.value }))}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all text-left ${coverage.type === opt.value ? 'bg-saffron-500 text-white border-saffron-500' : 'bg-white text-gray-600 border-gray-200 hover:border-saffron-300'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {coverage.type === 'radius' && (
          <div>
            <label className="label">Coverage Radius</label>
            <div className="flex flex-wrap gap-2">
              {RADIUS_OPTIONS.map((r) => (
                <button key={r} type="button" onClick={() => setCoverage((c) => ({ ...c, radiusKm: r }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${coverage.radiusKm === r ? 'bg-saffron-500 text-white border-saffron-500' : 'bg-white text-gray-600 border-gray-200 hover:border-saffron-300'}`}>
                  {r} KM
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Custom KM:</label>
              <input type="number" min="1" max="500" className="input w-24 text-sm" value={coverage.radiusKm}
                onChange={(e) => setCoverage((c) => ({ ...c, radiusKm: Math.max(1, parseInt(e.target.value) || 1) }))} />
            </div>
          </div>
        )}
        <div className="bg-saffron-50 rounded-xl p-3 text-xs text-saffron-700">
          <strong>Current setting:</strong>{' '}
          {coverage.type === 'radius'   ? `${coverage.radiusKm} KM radius from your pinned location` :
           coverage.type === 'city'     ? `Entire city (${addrForm.city || 'set your city above'})` :
           coverage.type === 'district' ? `Entire district (${addrForm.district || 'set your district above'})` :
           coverage.type === 'state'    ? `Entire state (${addrForm.state || 'set your state above'})` :
           'Pan India (all locations)'}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary px-6 py-2.5 flex items-center gap-2">
        <Save size={15} /> {saving ? 'Saving...' : 'Save Languages & Address'}
      </button>
    </div>
  );
}

// ── Tab 3: Education ────────────────────────────────────────────
function EducationTab({ pandit, reload }) {
  const [quals, setQuals] = useState(
    pandit.qualifications?.length > 0
      ? pandit.qualifications
      : [{ category: '', customName: '', description: '', certificationDetails: '', institution: '', passingYear: '' }]
  );
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    API.get('/masters/education-masters')
      .then(({ data }) => setCategories(data.masters || []))
      .catch(() => setCategories([]))
      .finally(() => setLoadingCats(false));
  }, []);

  const setQ = (idx, field, val) => setQuals((prev) => prev.map((q, i) => i === idx ? { ...q, [field]: val } : q));
  const addQual = () => setQuals((p) => [...p, { category: '', customName: '', description: '', certificationDetails: '', institution: '', passingYear: '' }]);
  const removeQual = (idx) => setQuals((p) => p.filter((_, i) => i !== idx));

  const save = async () => {
    const valid = quals.filter((q) => q.category.trim());
    if (valid.length === 0) { toast.error('Add at least one qualification'); return; }
    setSaving(true);
    try {
      await API.patch('/pandits/me/qualifications', { qualifications: valid });
      await reload();
      toast.success('Education saved');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const allowsCustom = (catName) => categories.find((c) => c.name === catName)?.allowCustom;

  return (
    <div className="space-y-4">
      {loadingCats ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="animate-pulse h-8 bg-gray-100 rounded-xl w-48" />
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 text-sm text-yellow-800">
          Education categories are not set up yet. Please ask the admin to add education categories.
        </div>
      ) : (
        <>
          {quals.map((q, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-700">Qualification #{idx + 1}</h4>
                {quals.length > 1 && (
                  <button onClick={() => removeQual(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                )}
              </div>
              <div>
                <label className="label">Qualification Category *</label>
                <select className="input" value={q.category} onChange={(e) => setQ(idx, 'category', e.target.value)}>
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              {q.category && allowsCustom(q.category) && (
                <div className="space-y-3 border-l-4 border-saffron-200 pl-4">
                  <div>
                    <label className="label">Custom Qualification Name *</label>
                    <input className="input" value={q.customName} onChange={(e) => setQ(idx, 'customName', e.target.value)} placeholder="Enter qualification name" />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <textarea className="input min-h-[60px] resize-none text-sm" value={q.description}
                      onChange={(e) => setQ(idx, 'description', e.target.value)} placeholder="Describe this qualification..." />
                  </div>
                  <div>
                    <label className="label">Certification Details</label>
                    <input className="input" value={q.certificationDetails} onChange={(e) => setQ(idx, 'certificationDetails', e.target.value)} placeholder="Certificate number or issuing body" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Institution / University</label>
                  <input className="input" value={q.institution} onChange={(e) => setQ(idx, 'institution', e.target.value)} placeholder="e.g. Banaras Hindu University" />
                </div>
                <div>
                  <label className="label">Passing Year</label>
                  <input type="number" className="input" value={q.passingYear} onChange={(e) => setQ(idx, 'passingYear', e.target.value)}
                    placeholder="e.g. 2005" min="1950" max={new Date().getFullYear()} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addQual} className="w-full border-2 border-dashed border-saffron-200 text-saffron-600 rounded-2xl py-3 flex items-center justify-center gap-2 hover:bg-saffron-50 transition-colors text-sm font-medium">
            <Plus size={16} /> Add More Qualification
          </button>
          <button onClick={save} disabled={saving} className="btn-primary px-6 py-2.5 flex items-center gap-2">
            <Save size={15} /> {saving ? 'Saving...' : 'Save Education'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Tab 4: Experience & Specializations ────────────────────────
function ExperienceTab({ pandit, reload }) {
  const [overall,       setOverall]        = useState(pandit.experience || '');
  const [specs,         setSpecs]          = useState(
    pandit.specializations?.length > 0
      ? pandit.specializations
      : [{ name: '', yearsOfExperience: '' }]
  );
  const [specMasters,   setSpecMasters]    = useState([]);
  const [loadingMasters,setLoadingMasters] = useState(true);
  const [saving,        setSaving]         = useState(false);

  useEffect(() => {
    API.get('/masters/specialization-masters')
      .then(({ data }) => setSpecMasters(data.masters || []))
      .catch(() => setSpecMasters([]))
      .finally(() => setLoadingMasters(false));
  }, []);

  const panditAge = pandit.dob ? Math.floor((Date.now() - new Date(pandit.dob)) / (365.25 * 864e5)) : null;
  const setS = (idx, field, val) => setSpecs((p) => p.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  const addSpec = () => setSpecs((p) => [...p, { name: '', yearsOfExperience: '' }]);
  const removeSpec = (idx) => setSpecs((p) => p.filter((_, i) => i !== idx));
  const usedNames = (currentIdx) => specs.filter((_, i) => i !== currentIdx).map((s) => s.name).filter(Boolean);

  const save = async () => {
    const valid = specs.filter((s) => s.name.trim());
    if (valid.length === 0) { toast.error('Add at least one specialization'); return; }
    if (panditAge !== null) {
      for (const s of valid) {
        if (+s.yearsOfExperience > panditAge) {
          toast.error(`Experience in "${s.name}" cannot exceed your age (${panditAge} years)`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      await API.patch('/pandits/me/specializations', {
        specializations: valid.map((s) => ({ name: s.name.trim(), yearsOfExperience: +s.yearsOfExperience || 0 })),
        experience: overall || 0,
      });
      await reload();
      toast.success('Experience & Specializations saved');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Overall Experience (Optional)</h3>
        <div className="flex items-center gap-3 max-w-xs">
          <input type="number" min="0" className="input flex-1" value={overall}
            onChange={(e) => setOverall(e.target.value)} placeholder="Total years" />
          <span className="text-sm text-gray-500 shrink-0">years</span>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Specializations</h3>
          {panditAge && <span className="text-xs text-gray-400">Max experience: {panditAge} years</span>}
        </div>
        {loadingMasters ? (
          <div className="animate-pulse space-y-2">{[1,2].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-xl" />)}</div>
        ) : specMasters.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
            Specialization options are not set up yet. Please ask the admin to add specializations.
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_140px_40px] gap-3 text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
              <span>Specialization</span><span>Years of Experience</span><span />
            </div>
            {specs.map((s, idx) => {
              const taken = usedNames(idx);
              const available = specMasters.filter((m) => !taken.includes(m.name));
              return (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_40px] gap-3 items-center">
                  <select className="input text-sm" value={s.name} onChange={(e) => setS(idx, 'name', e.target.value)}>
                    <option value="">Select specialization</option>
                    {s.name && !available.find((m) => m.name === s.name) && (
                      <option value={s.name}>{s.name}</option>
                    )}
                    {available.map((m) => <option key={m._id} value={m.name}>{m.name}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" className="input text-sm" value={s.yearsOfExperience}
                      onChange={(e) => setS(idx, 'yearsOfExperience', e.target.value)} placeholder="Years" />
                    <span className="text-xs text-gray-400 sm:hidden">yrs</span>
                  </div>
                  {specs.length > 1 ? (
                    <button onClick={() => removeSpec(idx)} className="text-red-400 hover:text-red-600 flex items-center justify-center"><Trash2 size={16} /></button>
                  ) : <div />}
                </div>
              );
            })}
            {specs.length < specMasters.length && (
              <button onClick={addSpec} className="w-full border-2 border-dashed border-saffron-200 text-saffron-600 rounded-xl py-2.5 flex items-center justify-center gap-2 hover:bg-saffron-50 transition-colors text-sm">
                <Plus size={15} /> Add Specialization
              </button>
            )}
          </>
        )}
      </div>
      <button onClick={save} disabled={saving || loadingMasters} className="btn-primary px-6 py-2.5 flex items-center gap-2">
        <Save size={15} /> {saving ? 'Saving...' : 'Save Experience & Specializations'}
      </button>
    </div>
  );
}

// ── Tab 5: Pooja Services ───────────────────────────────────────
function PoojasTab({ pandit, reload }) {
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selected, setSelected] = useState(
    new Set((pandit.selectedPoojas || []).map((p) => (typeof p === 'string' ? p : p._id)))
  );
  const [saving, setSaving] = useState(false);
  const [charges, setCharges] = useState(() => {
    const map = {};
    (pandit.poojaCharges || []).forEach((c) => {
      const id = typeof c.poojaId === 'string' ? c.poojaId : c.poojaId?._id || c.poojaId;
      if (id) map[id] = c.expectedCharges ?? 0;
    });
    return map;
  });
  const approvedPrices = {};
  (pandit.poojaCharges || []).forEach((c) => {
    const id = typeof c.poojaId === 'string' ? c.poojaId : c.poojaId?._id || c.poojaId;
    if (id && c.priceApprovalStatus === 'approved' && c.approvedPrice != null) {
      approvedPrices[id] = c.approvedPrice;
    }
  });

  const [showRequest, setShowRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ name: '', description: '', durationValue: '', durationUnit: 'hours', categoryId: '' });
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    Promise.all([
      API.get('/pandits/catalog-poojas'),
      API.get('/poojas/categories'),
      API.get('/pandit/my-poojas'),
    ]).then(([{ data: c }, { data: cats }, { data: reqs }]) => {
      setCatalog(c.poojas || []);
      setCategories(cats.categories || cats || []);
      setMyRequests(reqs.poojas || []);
    }).catch(() => toast.error('Could not load poojas'))
      .finally(() => setLoadingCatalog(false));
  }, []);

  const togglePooja = (id) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const save = async () => {
    setSaving(true);
    try {
      const poojaCharges = Array.from(selected).map((id) => ({
        poojaId: id,
        expectedCharges: +charges[id] || 0,
      }));
      await API.patch('/pandits/me/pooja-services', { selectedPoojas: Array.from(selected), poojaCharges });
      await reload();
      toast.success('Pooja services saved');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!reqForm.name || !reqForm.categoryId) { toast.error('Name and category are required'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(reqForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
      const { data } = await API.post('/pandit/my-poojas', fd);
      setMyRequests((p) => [data.pooja, ...p]);
      setReqForm({ name: '', description: '', duration: '', categoryId: '' });
      setShowRequest(false);
      toast.success('Pooja request submitted! Pending admin approval.');
    } catch { toast.error('Failed to submit request'); } finally { setSubmitting(false); }
  };

  const filtered = catalog.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const STATUS_BADGE = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700' };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-gray-800">Select Poojas You Offer</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select each pooja and enter your expected charge. Our team will review and set the final approved price.</p>
          </div>
          {selected.size > 0 && (
            <span className="bg-saffron-100 text-saffron-700 text-xs font-bold px-3 py-1 rounded-full">{selected.size} selected</span>
          )}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search poojas..." />
        </div>
        {loadingCatalog ? (
          <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No poojas found</div>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {filtered.map((p) => {
              const isSelected = selected.has(p._id);
              const approved = approvedPrices[p._id];
              return (
                <div key={p._id} className={`rounded-xl border transition-all ${isSelected ? 'border-saffron-300 bg-saffron-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                  <button type="button" onClick={() => togglePooja(p._id)}
                    className="w-full flex items-center gap-3 p-3 text-left">
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-saffron-500 border-saffron-500' : 'border-gray-300'}`}>
                      {isSelected && <CheckCircle size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      {p.categoryId?.name && <p className="text-xs text-gray-400">{p.categoryId.name}</p>}
                    </div>
                    {formatDuration(p) && <p className="text-xs text-gray-400 shrink-0">{formatDuration(p)}</p>}
                  </button>
                  {isSelected && (
                    <div className="px-3 pb-3 flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 whitespace-nowrap">Expected charge</span>
                        <span className="text-sm text-gray-500 font-medium">₹</span>
                        <input type="number" min="0" step="100" className="input text-sm w-28 text-right py-1.5" placeholder="0"
                          value={charges[p._id] ?? ''}
                          onChange={(e) => setCharges((prev) => ({ ...prev, [p._id]: e.target.value }))} />
                      </div>
                      {approved != null && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                          <BadgeCheck size={12} /> Admin approved: ₹{approved}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button onClick={save} disabled={saving || loadingCatalog} className="btn-primary px-6 py-2.5 flex items-center gap-2">
          <Save size={15} /> {saving ? 'Saving...' : 'Save Pooja Services'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Request New Pooja</h3>
            <p className="text-xs text-gray-400 mt-0.5">Know a pooja not in our catalog? Request it for admin review.</p>
          </div>
          <button onClick={() => setShowRequest(!showRequest)}
            className="text-sm text-saffron-600 border border-saffron-200 px-3 py-1.5 rounded-xl hover:bg-saffron-50 flex items-center gap-1.5">
            <Plus size={14} /> Request Pooja
          </button>
        </div>
        {showRequest && (
          <form onSubmit={submitRequest} className="space-y-3 border-t border-gray-100 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Pooja Name *</label>
                <input className="input text-sm" value={reqForm.name}
                  onChange={(e) => setReqForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Mahamrityunjaya Jaap" />
              </div>
              <div>
                <label className="label">Category *</label>
                <select className="input text-sm" value={reqForm.categoryId}
                  onChange={(e) => setReqForm((p) => ({ ...p, categoryId: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-[60px] resize-none text-sm" value={reqForm.description}
                onChange={(e) => setReqForm((p) => ({ ...p, description: e.target.value }))} placeholder="Brief description of this pooja..." />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Estimated Duration</label>
                <div className="flex gap-2">
                  <input
                    type="number" min="1" max="30"
                    className="input text-sm w-24"
                    placeholder="e.g. 2"
                    value={reqForm.durationValue}
                    onChange={(e) => setReqForm((p) => ({ ...p, durationValue: e.target.value }))}
                  />
                  <select
                    className="input text-sm flex-1"
                    value={reqForm.durationUnit}
                    onChange={(e) => setReqForm((p) => ({ ...p, durationUnit: e.target.value }))}
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <button type="submit" disabled={submitting} className="btn-primary px-4 py-2.5 text-sm">
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button type="button" onClick={() => setShowRequest(false)} className="btn-outline px-4 py-2.5 text-sm">Cancel</button>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Your request will be reviewed by admin. It will appear for bookings only after approval.
            </div>
          </form>
        )}
        {myRequests.length > 0 && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Requests</p>
            {myRequests.map((r) => (
              <div key={r._id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-700">{r.name}</p>
                  {r.adminNote && <p className="text-xs text-red-500 mt-0.5">{r.adminNote}</p>}
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[r.approvalStatus] || 'bg-gray-100 text-gray-500'}`}>
                  {r.approvalStatus}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 6: Family Information ───────────────────────────────────
function FamilyTab({ pandit, reload }) {
  const fi = pandit.familyInfo || {};
  const [form, setForm] = useState({
    maritalStatus: fi.maritalStatus || '',
    spouseName:    fi.spouseName    || '',
    children:      fi.children      ?? 0,
  });
  const [members, setMembers] = useState(fi.members || []);
  const [saving, setSaving] = useState(false);
  const setF = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const setM = (idx, field, val) => setMembers((p) => p.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  const addMember = () => setMembers((p) => [...p, { name: '', relation: '', age: '' }]);
  const removeMember = (idx) => setMembers((p) => p.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    try {
      await API.patch('/pandits/me/family', {
        ...form, children: +form.children || 0,
        members: members.filter((m) => m.name.trim()),
      });
      await reload();
      toast.success('Family information saved');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Marital Status</label>
            <select className="input" value={form.maritalStatus} onChange={setF('maritalStatus')}>
              <option value="">Select status</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="widowed">Widowed</option>
              <option value="divorced">Divorced</option>
            </select>
          </div>
          <div>
            <label className="label">Number of Children</label>
            <input type="number" min="0" className="input" value={form.children} onChange={setF('children')} placeholder="0" />
          </div>
        </div>
        {form.maritalStatus === 'married' && (
          <div>
            <label className="label">Spouse Name</label>
            <input className="input" value={form.spouseName} onChange={setF('spouseName')} placeholder="Spouse's full name" />
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Family Members</h3>
        {members.map((m, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_80px_40px] gap-3 items-end">
            <div>
              {idx === 0 && <label className="label text-xs">Name</label>}
              <input className="input text-sm" value={m.name} onChange={(e) => setM(idx, 'name', e.target.value)} placeholder="Full name" />
            </div>
            <div>
              {idx === 0 && <label className="label text-xs">Relation</label>}
              <input className="input text-sm" value={m.relation} onChange={(e) => setM(idx, 'relation', e.target.value)} placeholder="e.g. Son, Mother" />
            </div>
            <div>
              {idx === 0 && <label className="label text-xs">Age</label>}
              <input type="number" min="0" className="input text-sm" value={m.age} onChange={(e) => setM(idx, 'age', e.target.value)} placeholder="Age" />
            </div>
            <div className={idx === 0 ? 'pt-5' : ''}>
              <button onClick={() => removeMember(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        <button onClick={addMember} className="w-full border-2 border-dashed border-gray-200 text-gray-500 rounded-xl py-2.5 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-sm">
          <Plus size={15} /> Add Family Member
        </button>
      </div>
      <button onClick={save} disabled={saving} className="btn-primary px-6 py-2.5 flex items-center gap-2">
        <Save size={15} /> {saving ? 'Saving...' : 'Save Family Information'}
      </button>
    </div>
  );
}

// ── Tab 7: Bank & UPI Details ───────────────────────────────────
function PaymentTab({ pandit, reload }) {
  const [bankForm, setBankForm] = useState({
    accountHolderName: pandit.bankDetails?.accountHolderName || '',
    accountNumber:     pandit.bankDetails?.accountNumber     || '',
    ifscCode:          pandit.bankDetails?.ifscCode          || '',
    bankName:          pandit.bankDetails?.bankName          || '',
  });
  const [upiId, setUpiId] = useState(pandit.upiDetails?.upiId || '');
  const [upiVerified, setUpiVerified] = useState({
    isVerified:   pandit.upiDetails?.isVerified   || false,
    verifiedName: pandit.upiDetails?.verifiedName || '',
    bankName:     pandit.upiDetails?.bankName     || '',
  });
  const [verifying, setVerifying] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [savingUPI, setSavingUPI] = useState(false);
  const setB = (f) => (e) => setBankForm((p) => ({ ...p, [f]: e.target.value }));

  const saveBank = async () => {
    setSavingBank(true);
    try { await API.patch('/pandits/me/bank', bankForm); await reload(); toast.success('Bank details saved'); }
    catch { toast.error('Failed to save'); } finally { setSavingBank(false); }
  };
  const verifyUPI = async () => {
    if (!upiId.trim()) { toast.error('Enter UPI ID first'); return; }
    setVerifying(true);
    try {
      const { data } = await API.post('/pandits/me/verify-upi', { upiId: upiId.trim() });
      setUpiVerified({ isVerified: true, verifiedName: data.verifiedName, bankName: data.bankName });
      toast.success('UPI ID verified!');
    } catch (err) {
      setUpiVerified({ isVerified: false, verifiedName: '', bankName: '' });
      toast.error(err.response?.data?.message || 'Verification failed');
    } finally { setVerifying(false); }
  };
  const saveUPI = async () => {
    setSavingUPI(true);
    try { await API.patch('/pandits/me/upi', { upiId: upiId.trim(), ...upiVerified }); await reload(); toast.success('UPI details saved'); }
    catch { toast.error('Failed to save'); } finally { setSavingUPI(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard size={18} className="text-saffron-500" />
          <h3 className="font-semibold text-gray-800">Bank Account Details</h3>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
          Bank details are used for processing payouts. They are stored securely and never shared.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Account Holder Name</label>
            <input className="input" value={bankForm.accountHolderName} onChange={setB('accountHolderName')} placeholder="As per bank records" />
          </div>
          <div>
            <label className="label">Bank Name</label>
            <input className="input" value={bankForm.bankName} onChange={setB('bankName')} placeholder="e.g. SBI, HDFC" />
          </div>
        </div>
        <div>
          <label className="label">Account Number</label>
          <input className="input" value={bankForm.accountNumber} onChange={setB('accountNumber')} placeholder="Your bank account number" />
        </div>
        <div>
          <label className="label">IFSC Code</label>
          <input className="input uppercase" value={bankForm.ifscCode}
            onChange={(e) => setBankForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase() }))}
            placeholder="e.g. SBIN0001234" maxLength={11} />
        </div>
        <button onClick={saveBank} disabled={savingBank} className="btn-primary px-6 py-2.5 flex items-center gap-2">
          <Save size={15} /> {savingBank ? 'Saving...' : 'Save Bank Details'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <BadgeCheck size={18} className="text-saffron-500" />
          <h3 className="font-semibold text-gray-800">UPI Details</h3>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">UPI ID</label>
            <input className="input" value={upiId}
              onChange={(e) => { setUpiId(e.target.value); setUpiVerified({ isVerified: false, verifiedName: '', bankName: '' }); }}
              placeholder="e.g. name@paytm or 9876543210@upi" />
          </div>
          <button onClick={verifyUPI} disabled={verifying || !upiId.trim()}
            className="btn-outline px-4 py-2.5 text-sm flex items-center gap-2 shrink-0 mb-0.5">
            {verifying ? <><RefreshCw size={14} className="animate-spin" /> Verifying...</> : <><BadgeCheck size={14} /> Verify UPI</>}
          </button>
        </div>
        {upiVerified.isVerified && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm font-semibold text-green-700">Verified Successfully</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-gray-400">Account Holder</p>
                <p className="font-semibold text-gray-800">{upiVerified.verifiedName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Bank</p>
                <p className="font-semibold text-gray-800">{upiVerified.bankName}</p>
              </div>
            </div>
          </div>
        )}
        {!upiVerified.isVerified && upiId && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2 text-xs text-amber-700">
            <Info size={14} className="shrink-0 mt-0.5" />
            UPI not verified. Click "Verify UPI" to confirm your account details.
          </div>
        )}
        <button onClick={saveUPI} disabled={savingUPI} className="btn-primary px-6 py-2.5 flex items-center gap-2">
          <Save size={15} /> {savingUPI ? 'Saving...' : 'Save UPI Details'}
        </button>
      </div>
    </div>
  );
}

// ── Tab 8: KYC Verification ─────────────────────────────────────
const GOVT_ID_OPTIONS = [
  { value: 'aadhaar',  label: 'Aadhaar Card' },
  { value: 'pan',      label: 'PAN Card' },
  { value: 'passport', label: 'Passport' },
  { value: 'voter',    label: 'Voter ID' },
  { value: 'driving',  label: 'Driving Licence' },
];

function KycVerificationTab({ pandit, reload }) {
  const kycStatus = pandit.kycStatus || 'not_submitted';
  const canEdit   = ['not_submitted', 'rejected', 'reupload_required'].includes(kycStatus);
  const [form, setForm]             = useState({ govtIdType: pandit.govtIdType || '', govtIdNumber: '' });
  const [files, setFiles]           = useState({ frontImage: null, backImage: null, selfieImage: null, addressProof: null });
  const [previews, setPreviews]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const setF = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleFile = (field) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFiles((p) => ({ ...p, [field]: file }));
    const reader = new FileReader();
    reader.onload = () => setPreviews((p) => ({ ...p, [field]: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.govtIdType) { toast.error('Select a Government ID type'); return; }
    if (!files.frontImage && !pandit.kycFrontImage) { toast.error('Front image of document is required'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('govtIdType', form.govtIdType);
      if (form.govtIdNumber) fd.append('govtIdNumber', form.govtIdNumber);
      if (files.frontImage)   fd.append('frontImage',   files.frontImage);
      if (files.backImage)    fd.append('backImage',    files.backImage);
      if (files.selfieImage)  fd.append('selfieImage',  files.selfieImage);
      if (files.addressProof) fd.append('addressProof', files.addressProof);
      await API.post('/pandits/me/kyc', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await reload();
      toast.success('KYC submitted! Awaiting admin verification.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  const FileUploadField = ({ field, label, required, existingUrl }) => (
    <div>
      <label className="label">{label}{required && ' *'}</label>
      <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${files[field] ? 'border-saffron-400 bg-saffron-50' : 'border-gray-200 hover:border-saffron-300 hover:bg-saffron-50'}`}>
        <Upload size={18} className="text-saffron-500 shrink-0" />
        <span className="text-sm text-gray-600 flex-1 truncate">
          {files[field] ? files[field].name : (existingUrl ? '✓ Already uploaded (re-upload to replace)' : `Upload ${label} (JPG/PNG)`)}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={handleFile(field)} disabled={!canEdit} />
      </label>
      {previews[field] && <img src={previews[field]} alt={label} className="mt-2 max-h-28 rounded-xl border border-gray-200 object-contain" />}
      {!previews[field] && existingUrl && (
        <a href={`http://localhost:5000/${existingUrl}`} target="_blank" rel="noopener noreferrer"
          className="mt-1 text-xs text-saffron-600 hover:underline flex items-center gap-1">
          <FileText size={12} /> View uploaded file
        </a>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 flex items-start gap-4 ${
        kycStatus === 'approved'          ? 'bg-green-50 border-green-200'  :
        kycStatus === 'submitted'         ? 'bg-blue-50 border-blue-200'   :
        kycStatus === 'rejected'          ? 'bg-red-50 border-red-200'     :
        kycStatus === 'reupload_required' ? 'bg-purple-50 border-purple-200' :
        'bg-gray-50 border-gray-200'
      }`}>
        {kycStatus === 'approved'          && <ShieldCheck size={28} className="text-green-600 shrink-0" />}
        {kycStatus === 'submitted'         && <Clock       size={28} className="text-blue-600 shrink-0"  />}
        {kycStatus === 'rejected'          && <XCircle     size={28} className="text-red-600 shrink-0"   />}
        {kycStatus === 'reupload_required' && <Upload      size={28} className="text-purple-600 shrink-0"/>}
        {kycStatus === 'not_submitted'     && <FileText    size={28} className="text-gray-500 shrink-0"  />}
        <div className="flex-1">
          <p className="font-bold text-gray-800">{KYC_STATUS_CONFIG[kycStatus]?.label}</p>
          {kycStatus === 'not_submitted'     && <p className="text-sm text-gray-600 mt-0.5">Upload your government ID to start the verification process.</p>}
          {kycStatus === 'submitted'         && <p className="text-sm text-gray-600 mt-0.5">Documents submitted. Our team will review within 1–2 business days.</p>}
          {kycStatus === 'approved'          && <p className="text-sm text-green-700 mt-0.5">Your KYC is verified! You are eligible to receive bookings.</p>}
          {(kycStatus === 'rejected' || kycStatus === 'reupload_required') && pandit.kycRejectionReason && (
            <p className="text-sm mt-1"><span className="font-semibold">Reason: </span>{pandit.kycRejectionReason}</p>
          )}
        </div>
      </div>

      {canEdit && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FileText size={16} className="text-saffron-500" /> Document Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Government ID Type *</label>
                <select className="input" value={form.govtIdType} onChange={setF('govtIdType')} required>
                  <option value="">Select ID type</option>
                  {GOVT_ID_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Document Number (optional)</label>
                <input className="input" value={form.govtIdNumber} onChange={setF('govtIdNumber')} placeholder="e.g. XXXX XXXX XXXX" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Upload size={16} className="text-saffron-500" /> Upload Documents
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FileUploadField field="frontImage"   label="Front Image"          required existingUrl={pandit.kycFrontImage} />
              <FileUploadField field="backImage"    label="Back Image"           required={false} existingUrl={pandit.kycBackImage} />
              <FileUploadField field="selfieImage"  label="Selfie with Document" required={false} existingUrl={pandit.kycSelfieImage} />
              <FileUploadField field="addressProof" label="Address Proof"        required={false} existingUrl={pandit.kycAddressProof} />
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Upload clear images. Blurry or incomplete documents will be rejected. Max file size: 10MB.
            </div>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary px-6 py-2.5 flex items-center gap-2">
            <ShieldCheck size={15} /> {submitting ? 'Submitting...' : 'Submit KYC Documents'}
          </button>
        </form>
      )}

      {!canEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Submitted Documents</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ['Front Image',          pandit.kycFrontImage],
              ['Back Image',           pandit.kycBackImage],
              ['Selfie with Document', pandit.kycSelfieImage],
              ['Address Proof',        pandit.kycAddressProof],
            ].map(([label, url]) => url && (
              <div key={label} className="bg-saffron-50 border border-saffron-100 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <a href={`http://localhost:5000/${url}`} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-saffron-600 hover:underline flex items-center gap-1.5">
                  <FileText size={13} /> View Document
                </a>
              </div>
            ))}
            <div className="bg-saffron-50 border border-saffron-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">ID Type</p>
              <p className="font-semibold text-gray-700 capitalize">{pandit.govtIdType || '—'}</p>
            </div>
            {pandit.govtIdNumber && (
              <div className="bg-saffron-50 border border-saffron-100 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Document Number</p>
                <p className="font-semibold text-gray-700">{pandit.govtIdNumber}</p>
              </div>
            )}
          </div>
          {kycStatus === 'submitted' && (
            <p className="text-xs text-blue-600 bg-blue-50 rounded-xl p-3 border border-blue-100">
              Documents are being reviewed. You will receive a notification once the review is complete.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Profile Tab Accordion Shell ──────────────────────────────────
function ProfileAccordion({ pandit, reload }) {
  const [open, setOpen] = useState({ personal: true });
  const toggle = (id) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const CONTENT = {
    personal:   <PersonalDetailsTab   pandit={pandit} reload={reload} />,
    address:    <LanguagesAddressTab  pandit={pandit} reload={reload} />,
    education:  <EducationTab         pandit={pandit} reload={reload} />,
    experience: <ExperienceTab        pandit={pandit} reload={reload} />,
    poojas:     <PoojasTab            pandit={pandit} reload={reload} />,
    family:     <FamilyTab            pandit={pandit} reload={reload} />,
    payment:    <PaymentTab           pandit={pandit} reload={reload} />,
    kyc:        <KycVerificationTab   pandit={pandit} reload={reload} />,
  };

  return (
    <div className="space-y-3">
      {PROFILE_TABS.map(({ id, label, icon: Icon }) => {
        const kycStatus = pandit.kycStatus || 'not_submitted';
        const kycBadge  = id === 'kyc' ? KYC_STATUS_CONFIG[kycStatus] : null;
        return (
          <div key={id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggle(id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
              style={open[id] ? { background: '#1B1F3B', color: 'white' } : { color: '#1B1F3B' }}
            >
              <div className="flex items-center gap-3">
                <Icon size={17} />
                <span className="font-semibold text-sm">{label}</span>
                {kycBadge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${open[id] ? 'bg-white/20 text-white' : kycBadge.color}`}>
                    {kycBadge.label}
                  </span>
                )}
              </div>
              <svg className="w-4 h-4 transition-transform shrink-0"
                style={{ transform: open[id] ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {open[id] && (
              <div className="p-4 border-t border-gray-100">{CONTENT[id]}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function PanditMyProfile() {
  const [pandit,  setPandit]  = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() =>
    API.get('/pandits/me')
      .then(({ data }) => setPandit(data.pandit))
      .catch(() => toast.error('Could not load profile'))
      .finally(() => setLoading(false)),
  []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ZutsavLoader size={60} message="Loading your profile…" />;

  if (!pandit) return (
    <div className="flex items-center justify-center py-24 text-center px-4">
      <p className="text-xl text-gray-500">Profile not found.</p>
    </div>
  );

  if (pandit.status === 'rejected' || pandit.status === 'suspended') {
    return <Navigate to="/pandit/dashboard" replace />;
  }

  const completion = calcCompletion(pandit);
  const kycCfg     = KYC_STATUS_CONFIG[pandit.kycStatus || 'not_submitted'];

  return (
    <div className="p-4 md:p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm">
        <Link to="/pandit/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">Dashboard</Link>
        <span className="text-gray-300">/</span>
        <span className="font-semibold text-gray-700">My Profile</span>
      </div>

      {/* Completion Status Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 w-full">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Profile Completion</p>
              <span className="text-sm font-bold" style={{ color: '#D4AF37' }}>{completion}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${completion}%`, background: 'linear-gradient(90deg, #D4AF37, #f5e09a)' }} />
            </div>
            {completion < 70 && (
              <p className="text-xs text-amber-600 mt-1.5">
                Complete your profile to 70% to start receiving bookings. ({completion}% done)
              </p>
            )}
            {completion >= 70 && (
              <p className="text-xs text-green-600 mt-1.5">Profile complete. You are eligible to receive bookings.</p>
            )}
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full border shrink-0 ${kycCfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${kycCfg.dot}`} />
            KYC: {kycCfg.label}
          </div>
        </div>
      </div>

      {/* Profile accordion */}
      <ProfileAccordion pandit={pandit} reload={load} />
    </div>
  );
}
