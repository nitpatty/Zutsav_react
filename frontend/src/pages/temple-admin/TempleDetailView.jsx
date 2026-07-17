import React from 'react';
import { X, MapPin, Clock, Calendar, Navigation } from 'lucide-react';
import { getImageUrl } from '../../config';

const STATUS_LABEL = { draft: 'Draft', published: 'Published', hidden: 'Hidden', archived: 'Archived' };

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function TempleDetailView({ temple, onClose, onEdit }) {
  if (!temple) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-full overflow-y-auto">
        <div className="relative">
          {temple.coverImage ? (
            <img src={getImageUrl(temple.coverImage)} alt="" className="w-full h-56 object-cover rounded-t-3xl" />
          ) : (
            <div className="w-full h-40 rounded-t-3xl bg-saffron-50 flex items-center justify-center text-5xl">🛕</div>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow">
            <X size={16} />
          </button>
          <span className="absolute top-3 left-3 text-[11px] px-2.5 py-1 rounded-full font-semibold bg-white/95 text-gray-700 shadow">
            {STATUS_LABEL[temple.status] || 'Published'}
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{temple.name}</h2>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin size={13} className="text-saffron-500" /> {temple.city}, {temple.state}
              </p>
            </div>
            {temple.isFeatured && (
              <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold bg-amber-100 text-amber-700 shrink-0">★ Featured</span>
            )}
          </div>

          {(temple.category || temple.primaryDeity) && (
            <div className="flex flex-wrap gap-2">
              {temple.category && <span className="text-xs px-2.5 py-1 rounded-full bg-saffron-50 text-saffron-700 font-medium">{temple.category}</span>}
              {temple.primaryDeity && <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">🙏 {temple.primaryDeity}</span>}
            </div>
          )}

          {temple.description && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{temple.description}</p>
            </div>
          )}

          {temple.images?.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Gallery</h3>
              <div className="grid grid-cols-4 gap-2">
                {temple.images.map((url, i) => (
                  <img key={url + i} src={getImageUrl(url)} alt="" className="w-full h-20 object-cover rounded-lg" />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4" style={{ borderColor: 'var(--t-border)' }}>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Address</p>
              <p className="text-gray-700">{temple.address || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><Navigation size={11} /> Coordinates</p>
              <p className="text-gray-700 font-mono text-xs">
                {temple.latitude ? `${temple.latitude.toFixed(4)}, ${temple.longitude.toFixed(4)}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><Clock size={11} /> Opening Hours</p>
              <p className="text-gray-700">{temple.openingHours || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Pincode</p>
              <p className="text-gray-700">{temple.pincode || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><Calendar size={11} /> Created</p>
              <p className="text-gray-700">{fmt(temple.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><Calendar size={11} /> Last Updated</p>
              <p className="text-gray-700">{fmt(temple.updatedAt)}</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-outline flex-1">Close</button>
            <button onClick={() => onEdit(temple)} className="btn-primary flex-1">Edit Temple</button>
          </div>
        </div>
      </div>
    </div>
  );
}
