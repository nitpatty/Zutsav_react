import React, { useMemo } from 'react';
import { Eye, MapPin } from 'lucide-react';
import { getImageUrl } from '../../config';

export default function TempleLivePreview({ form, coverFile, coverUrl }) {
  const previewUrl = useMemo(() => {
    if (coverFile) return URL.createObjectURL(coverFile);
    if (coverUrl) return getImageUrl(coverUrl);
    return null;
  }, [coverFile, coverUrl]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <Eye size={13} className="text-gray-400" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Temple Preview</h3>
      </div>

      <div className="relative mx-5 mt-2 rounded-xl overflow-hidden" style={{ background: 'var(--t-surface)' }}>
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-full h-40 object-cover" />
        ) : (
          <div className="w-full h-40 flex items-center justify-center text-3xl">🛕</div>
        )}
      </div>

      <div className="p-5 pt-3">
        <p className="font-bold text-gray-800 text-base truncate">{form.name || 'Temple Name'}</p>
        <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
          <MapPin size={11} className="text-saffron-500 shrink-0" />
          {form.city || form.state ? `${form.city}${form.city && form.state ? ', ' : ''}${form.state}` : 'City, State'}
        </p>
        {form.category && (
          <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-saffron-50 text-saffron-700 font-medium">
            {form.category}
          </span>
        )}

        <div className="space-y-1 text-xs text-gray-500 border-t pt-3 mt-3" style={{ borderColor: 'var(--t-border)' }}>
          <p><span className="text-gray-400">Deity</span> &nbsp; {form.primaryDeity || '—'}</p>
          <p><span className="text-gray-400">Hours</span> &nbsp; {form.openingHours || '—'}</p>
        </div>
      </div>
    </div>
  );
}
