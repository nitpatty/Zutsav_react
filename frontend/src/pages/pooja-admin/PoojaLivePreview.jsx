import React, { useMemo } from 'react';
import { Eye, Clock3, Languages as LanguagesIcon } from 'lucide-react';
import { getImageUrl } from '../../config';

export default function PoojaLivePreview({ form, categories, image, isEditing, editingPooja }) {
  const coverUrl = useMemo(() => {
    if (image) return URL.createObjectURL(image);
    if (isEditing && editingPooja?.image) return getImageUrl(editingPooja.image);
    return null;
  }, [image, isEditing, editingPooja]);

  const categoryNames = (form.categoryIds || [])
    .map((id) => categories.find((c) => c._id === id)?.name)
    .filter(Boolean);

  const mrp = Number(form.mrp) || 0;
  const salePrice = Number(form.salePrice) || 0;
  const price = salePrice || mrp || Number(form.price) || 0;
  const discountPct = mrp && salePrice && salePrice < mrp ? Math.round((1 - salePrice / mrp) * 100) : 0;
  const isPublished = isEditing ? !!editingPooja?.isActive : false;

  const descText = (form.description || '').replace(/<[^>]+>/g, '').trim();

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <Eye size={13} className="text-gray-400" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Live Preview</h3>
      </div>

      <div className="relative mx-5 mt-2 rounded-xl overflow-hidden" style={{ background: 'var(--t-surface)' }}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-32 object-cover" />
        ) : (
          <div className="w-full h-32 flex items-center justify-center text-3xl">🪔</div>
        )}
        <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${isPublished ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>
          {isPublished ? 'Published' : 'Draft'}
        </span>
      </div>

      <div className="p-5 pt-3">
        <p className="font-bold text-gray-800 text-base truncate">{form.name || 'Pooja Name'}</p>

        {categoryNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
            {categoryNames.map((name) => (
              <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-saffron-50 text-saffron-700 font-medium">{name}</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-300 mt-1.5 mb-2">No category selected</p>
        )}

        <div className="flex items-center gap-2 mb-1.5">
          {price ? <span className="font-bold text-saffron-600 text-sm">₹{price.toLocaleString('en-IN')}</span> : <span className="text-xs text-gray-300">Price not set</span>}
          {mrp > 0 && mrp !== price && <span className="text-xs text-gray-400 line-through">₹{mrp.toLocaleString('en-IN')}</span>}
          {discountPct > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{discountPct}% OFF</span>}
        </div>

        <div className="space-y-1 text-xs text-gray-500 mb-3">
          {form.durationValue && (
            <p className="flex items-center gap-1.5"><Clock3 size={12} className="text-gray-400" /> {form.durationValue} {form.durationUnit}</p>
          )}
          {form.languages && (
            <p className="flex items-center gap-1.5"><LanguagesIcon size={12} className="text-gray-400" /> {form.languages}</p>
          )}
          <p className="flex items-center gap-1.5">
            <span className="text-gray-400">GST</span> {form.taxEnabled ? `Applicable (${form.taxRate || 0}%)` : 'Not Applicable'}
          </p>
        </div>

        {descText && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 border-t pt-3" style={{ borderColor: 'var(--t-border)' }}>
            {descText}
          </p>
        )}
      </div>
    </div>
  );
}
