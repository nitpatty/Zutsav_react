import React from 'react';
import { ClipboardList, MapPin, Plus, Trash2, CheckCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import PincodeInput from '../shared/PincodeInput';
import StepHeader from './StepHeader';
import NavButtons from './NavButtons';

export default function DetailsStep({
  userDetails, setUserDetails, errors, setErrors, user,
  savedAddresses, setSavedAddresses, selectedAddrId, setSelectedAddrId,
  saveAddrLabel, setSaveAddrLabel, wantSaveAddr, setWantSaveAddr, savingAddr, setSavingAddr,
  onBack, onNext,
}) {
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={ClipboardList} title="Your Details" desc="Ceremony location and contact info" />

      <div className="space-y-4">
        {/* Name + Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Full Name *</label>
            <input className={`input ${errors.name ? 'border-red-400' : ''}`} value={userDetails.name}
              onChange={e => { setUserDetails(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })); }}
              placeholder="Your full name" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className={`input ${errors.phone ? 'border-red-400' : ''}`} value={userDetails.phone} maxLength={10}
              placeholder="10-digit mobile"
              onChange={e => { const v = e.target.value.replace(/\D/, '').slice(0, 10); setUserDetails(p => ({ ...p, phone: v })); setErrors(p => ({ ...p, phone: '' })); }} />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="label flex items-center gap-1.5">
            <MapPin size={13} className="text-orange-500" /> Ceremony Address *
          </label>

          {savedAddresses.length > 0 && (
            <div className="space-y-2 mb-3">
              {savedAddresses.map(addr => (
                <button
                  key={addr._id}
                  type="button"
                  onClick={() => {
                    setSelectedAddrId(addr._id);
                    setWantSaveAddr(null);
                    setUserDetails(p => ({
                      ...p,
                      address: addr.address || '',
                      pincode: addr.pincode || '',
                      state: addr.state || '',
                      city: addr.city || '',
                      district: addr.district || '',
                    }));
                  }}
                  className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all ${
                    selectedAddrId === addr._id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                        selectedAddrId === addr._id ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                      }`}>
                        {selectedAddrId === addr._id && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{addr.label}</p>
                        <p className="text-sm text-gray-600 mt-0.5 leading-snug">{addr.address}</p>
                        {(addr.city || addr.pincode) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        API.delete(`/users/addresses/${addr._id}`).then(({ data }) => {
                          setSavedAddresses(data.addresses || []);
                          if (selectedAddrId === addr._id) {
                            const remaining = data.addresses || [];
                            if (remaining.length > 0) {
                              const next = remaining[0];
                              setSelectedAddrId(next._id);
                              setUserDetails(p => ({ ...p, address: next.address, pincode: next.pincode || '', state: next.state || '', city: next.city || '', district: next.district || '' }));
                            } else {
                              setSelectedAddrId('new');
                              setUserDetails(p => ({ ...p, address: '', pincode: '', state: '', city: '', district: '' }));
                            }
                          }
                        }).catch(() => toast.error('Could not delete address'));
                      }}
                      className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setSelectedAddrId('new');
                  setWantSaveAddr(null);
                  setUserDetails(p => ({ ...p, address: '', pincode: '', state: '', city: '', district: '' }));
                }}
                className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all flex items-center gap-2.5 ${
                  selectedAddrId === 'new' ? 'border-orange-400 bg-orange-50' : 'border-dashed border-gray-300 bg-white hover:border-orange-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  selectedAddrId === 'new' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                }`}>
                  {selectedAddrId === 'new'
                    ? <span className="w-1.5 h-1.5 rounded-full bg-white block" />
                    : <Plus size={9} className="text-gray-400" />}
                </div>
                <span className="text-sm font-medium text-gray-600">Enter a new address</span>
              </button>
            </div>
          )}

          {selectedAddrId === 'new' && (
            <div className="space-y-3 mt-1">
              <div>
                <textarea rows={2} className={`input resize-none ${errors.address ? 'border-red-400' : ''}`} value={userDetails.address}
                  onChange={e => { setUserDetails(p => ({ ...p, address: e.target.value })); setErrors(p => ({ ...p, address: '' })); setWantSaveAddr(null); }}
                  placeholder="House no., street, area, landmark…" />
                {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
              </div>

              <div>
                <label className="label">Pincode *</label>
                <PincodeInput
                  value={userDetails.pincode}
                  onChange={v => { setUserDetails(p => ({ ...p, pincode: v })); setWantSaveAddr(null); }}
                  onFill={({ state, city, district }) => setUserDetails(p => ({ ...p, state, city, district }))}
                  error={errors.pincode}
                />
              </div>

              {userDetails.state && (
                <div className="grid grid-cols-3 gap-2">
                  {[['state', 'State'], ['city', 'City'], ['district', 'District']].map(([f, l]) => (
                    <div key={f}>
                      <label className="label text-xs">{l}</label>
                      <input className="input bg-gray-50 text-sm" value={userDetails[f]}
                        onChange={e => setUserDetails(p => ({ ...p, [f]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              )}

              {user && userDetails.address && userDetails.pincode && wantSaveAddr === null && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5">
                  <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                    <MapPin size={13} /> Save this address for future bookings?
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <input
                      className="input text-sm flex-1"
                      value={saveAddrLabel}
                      onChange={e => setSaveAddrLabel(e.target.value)}
                      placeholder="Label (e.g. Home, Office)"
                    />
                    <button
                      type="button"
                      disabled={savingAddr}
                      onClick={async () => {
                        setSavingAddr(true);
                        try {
                          const { data } = await API.post('/users/addresses', {
                            label: saveAddrLabel || 'Home',
                            address: userDetails.address,
                            pincode: userDetails.pincode,
                            state: userDetails.state,
                            city: userDetails.city,
                            district: userDetails.district,
                          });
                          setSavedAddresses(data.addresses || []);
                          const saved = (data.addresses || []).at(-1);
                          if (saved) setSelectedAddrId(saved._id);
                          setWantSaveAddr(true);
                          toast.success('Address saved!');
                        } catch {
                          toast.error('Could not save address');
                        } finally {
                          setSavingAddr(false);
                        }
                      }}
                      className="btn-primary text-sm px-4 py-2 whitespace-nowrap"
                    >
                      {savingAddr ? 'Saving…' : 'Yes, Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWantSaveAddr(false)}
                      className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2 whitespace-nowrap"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {wantSaveAddr === true && (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <CheckCircle size={12} /> Address saved to your profile.
                </p>
              )}
              {wantSaveAddr === false && (
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <Info size={12} /> Address will only be used for this booking.
                </p>
              )}
            </div>
          )}

          {selectedAddrId !== 'new' && selectedAddrId && (
            <div className="text-xs text-gray-400 mt-1">Address auto-filled from your saved address above.</div>
          )}
        </div>

        <div>
          <label className="label">Special Note <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
          <textarea rows={2} className="input resize-none" value={userDetails.specialNote}
            onChange={e => setUserDetails(p => ({ ...p, specialNote: e.target.value }))}
            placeholder="Any special requirements for the pandit…" />
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}
