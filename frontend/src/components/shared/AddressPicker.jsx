/**
 * AddressPicker — shared address selector used by CartPage (and reusable elsewhere).
 *
 * Reads from GET  /users/addresses
 * Writes to POST /users/addresses
 * Deletes via DELETE /users/addresses/:id
 *
 * Props:
 *   value      – { address, pincode, state, city, district }
 *   onChange   – (fields) => void   called whenever the active address changes
 */
import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Trash2, CheckCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import PincodeInput from './PincodeInput';

const LABELS = ['Home', 'Office', 'Other'];

export default function AddressPicker({ value, onChange }) {
  const [addresses,      setAddresses]      = useState([]);
  const [selectedId,     setSelectedId]     = useState('');   // '' = nothing yet, 'new' = new form
  const [newAddr,        setNewAddr]        = useState({ address: '', pincode: '', state: '', city: '', district: '' });
  const [saveLabel,      setSaveLabel]      = useState('Home');
  const [wantSave,       setWantSave]       = useState(null);  // null | true | false
  const [saving,         setSaving]         = useState(false);
  const [loading,        setLoading]        = useState(true);

  // Fetch saved addresses on mount
  useEffect(() => {
    API.get('/users/addresses')
      .then(({ data }) => {
        const addrs = data.addresses || [];
        setAddresses(addrs);
        if (addrs.length > 0) {
          const def = addrs.find((a) => a.isDefault) || addrs[0];
          setSelectedId(def._id);
          onChange({ address: def.address || '', pincode: def.pincode || '', state: def.state || '', city: def.city || '', district: def.district || '' });
        } else {
          setSelectedId('new');
        }
      })
      .catch(() => { setSelectedId('new'); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSaved = (addr) => {
    setSelectedId(addr._id);
    setWantSave(null);
    onChange({ address: addr.address || '', pincode: addr.pincode || '', state: addr.state || '', city: addr.city || '', district: addr.district || '' });
  };

  const selectNew = () => {
    setSelectedId('new');
    setWantSave(null);
    onChange({ address: '', pincode: '', state: '', city: '', district: '' });
  };

  const handleNewAddrChange = (fields) => {
    const next = { ...newAddr, ...fields };
    setNewAddr(next);
    setWantSave(null);
    onChange(next);
  };

  const deleteAddress = async (addr) => {
    try {
      const { data } = await API.delete(`/users/addresses/${addr._id}`);
      const remaining = data.addresses || [];
      setAddresses(remaining);
      if (selectedId === addr._id) {
        if (remaining.length > 0) {
          selectSaved(remaining[0]);
        } else {
          selectNew();
        }
      }
    } catch {
      toast.error('Could not delete address');
    }
  };

  const saveNewAddress = async () => {
    if (!newAddr.address || !newAddr.pincode) { toast.error('Please fill address and pincode'); return; }
    setSaving(true);
    try {
      const { data } = await API.post('/users/addresses', {
        label:    saveLabel || 'Home',
        address:  newAddr.address,
        pincode:  newAddr.pincode,
        state:    newAddr.state,
        city:     newAddr.city,
        district: newAddr.district,
      });
      const addrs = data.addresses || [];
      setAddresses(addrs);
      const saved = addrs.at(-1);
      if (saved) {
        setSelectedId(saved._id);
        setWantSave(true);
      }
      toast.success('Address saved!');
    } catch {
      toast.error('Could not save address');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-2">
      {/* Saved address cards */}
      {addresses.map((addr) => (
        <button
          key={addr._id}
          type="button"
          onClick={() => selectSaved(addr)}
          className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all ${
            selectedId === addr._id
              ? 'border-orange-400 bg-orange-50'
              : 'border-gray-200 bg-white hover:border-orange-200'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              {/* Radio dot */}
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                selectedId === addr._id ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
              }`}>
                {selectedId === addr._id && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
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
            {/* Delete */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); deleteAddress(addr); }}
              className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5 p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </button>
      ))}

      {/* Add new address option */}
      <button
        type="button"
        onClick={selectNew}
        className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all flex items-center gap-2.5 ${
          selectedId === 'new'
            ? 'border-orange-400 bg-orange-50'
            : 'border-dashed border-gray-300 bg-white hover:border-orange-300'
        }`}
      >
        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
          selectedId === 'new' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
        }`}>
          {selectedId === 'new'
            ? <span className="w-1.5 h-1.5 rounded-full bg-white block" />
            : <Plus size={9} className="text-gray-400" />
          }
        </div>
        <span className="text-sm font-medium text-gray-600">
          {addresses.length > 0 ? 'Use a different address' : 'Add a delivery address'}
        </span>
      </button>

      {/* New address form */}
      {selectedId === 'new' && (
        <div className="space-y-3 pt-1 pl-1">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Delivery Address *</label>
            <textarea
              rows={2}
              className="input resize-none text-sm"
              placeholder="House/flat no., street, area, landmark…"
              value={newAddr.address}
              onChange={(e) => handleNewAddrChange({ address: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Pincode *</label>
            <PincodeInput
              value={newAddr.pincode}
              onChange={(v) => handleNewAddrChange({ pincode: v })}
              onFill={({ state, city, district }) => handleNewAddrChange({ state, city, district })}
            />
          </div>
          {newAddr.state && (
            <div className="grid grid-cols-3 gap-2">
              {[['state', 'State'], ['city', 'City'], ['district', 'District']].map(([f, l]) => (
                <div key={f}>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">{l}</label>
                  <input
                    className="input text-sm bg-gray-50"
                    value={newAddr[f]}
                    onChange={(e) => handleNewAddrChange({ [f]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Save prompt */}
          {newAddr.address && newAddr.pincode && wantSave === null && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5">
              <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                <MapPin size={13} /> Save this address for future orders?
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <select
                  className="input text-sm flex-1"
                  value={saveLabel}
                  onChange={(e) => setSaveLabel(e.target.value)}
                >
                  {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveNewAddress}
                  className="btn-primary text-sm px-4 py-2 whitespace-nowrap"
                >
                  {saving ? 'Saving…' : 'Yes, Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setWantSave(false)}
                  className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2 whitespace-nowrap"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {wantSave === true && (
            <p className="text-xs text-green-600 flex items-center gap-1.5">
              <CheckCircle size={12} /> Address saved to your profile.
            </p>
          )}
          {wantSave === false && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Info size={12} /> Address will only be used for this order.
            </p>
          )}
        </div>
      )}

      {/* Confirmation when a saved address is selected */}
      {selectedId !== 'new' && selectedId && (
        <p className="text-xs text-gray-400 pl-1 flex items-center gap-1">
          <CheckCircle size={11} className="text-green-500" />
          Address auto-filled from your saved address.
        </p>
      )}
    </div>
  );
}
