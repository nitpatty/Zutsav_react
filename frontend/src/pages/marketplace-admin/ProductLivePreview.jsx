import React, { useMemo } from 'react';
import { Eye, Package, ExternalLink } from 'lucide-react';
import { getImageUrl } from '../../config';

const VISIBILITY_LABEL = {
  marketplace: 'Visible to all',
  kit_only:    'Kit only',
  both:        'Marketplace + Kits',
};

export default function ProductLivePreview({ form, categories, files, isEditing, editingProd }) {
  const coverUrl = useMemo(() => {
    if (files && files.length > 0) return URL.createObjectURL(files[0]);
    if (isEditing && editingProd?.images?.length > 0) return getImageUrl(editingProd.images[0]);
    return null;
  }, [files, isEditing, editingProd]);

  const category = categories.find((c) => c.slug === form.category);
  const hasVariants = (form.variants || []).length > 0;

  const price = Number(form.price) || 0;
  const salePrice = Number(form.salePrice) || 0;
  const effectivePrice = salePrice || price;
  const discountPct = price && salePrice && salePrice < price ? Math.round((1 - salePrice / price) * 100) : 0;

  const stock = Number(form.stock) || 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <Eye size={13} className="text-gray-400" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Product Preview</h3>
        </div>
        <span className="text-[10px] text-saffron-600 flex items-center gap-1 font-medium">
          View Full <ExternalLink size={10} />
        </span>
      </div>

      <div className="relative mx-5 mt-2 rounded-xl overflow-hidden" style={{ background: 'var(--t-surface)' }}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-40 object-cover" />
        ) : (
          <div className="w-full h-40 flex items-center justify-center text-3xl">🛍️</div>
        )}
        <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white text-gray-700 shadow">
          Preview
        </span>
      </div>

      <div className="p-5 pt-3">
        <p className="font-bold text-gray-800 text-base truncate">{form.name || 'Product Name'}</p>
        {category ? (
          <span className="inline-block mt-1.5 mb-2 text-[10px] px-2 py-0.5 rounded-full bg-saffron-50 text-saffron-700 font-medium">
            {category.icon} {category.name}
          </span>
        ) : (
          <p className="text-xs text-gray-300 mt-1.5 mb-2">No category selected</p>
        )}

        {!hasVariants ? (
          <div className="flex items-center gap-2 mb-1.5">
            {effectivePrice ? <span className="font-bold text-saffron-600 text-sm">₹{effectivePrice.toLocaleString('en-IN')}</span> : <span className="text-xs text-gray-300">Price not set</span>}
            {price > 0 && salePrice > 0 && price !== salePrice && <span className="text-xs text-gray-400 line-through">₹{price.toLocaleString('en-IN')}</span>}
            {discountPct > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{discountPct}% OFF</span>}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <Package size={13} className="text-gray-400" /> {form.variants.length} Variant{form.variants.length > 1 ? 's' : ''}
          </p>
        )}

        <div className="space-y-1 text-xs text-gray-500 border-t pt-3 mt-2" style={{ borderColor: 'var(--t-border)' }}>
          {!hasVariants && <p><span className="text-gray-400">Stock</span> &nbsp; {stock} in stock</p>}
          <p><span className="text-gray-400">GST</span> &nbsp; {form.taxRate ? `${form.taxRate}%` : '—'}</p>
          <p><span className="text-gray-400">Visibility</span> &nbsp; {VISIBILITY_LABEL[form.visibilityType] || VISIBILITY_LABEL.marketplace}</p>
          <p><span className="text-gray-400">Category</span> &nbsp; {category ? category.name : '—'}</p>
          {hasVariants && <p><span className="text-gray-400">Variants</span> &nbsp; {form.variants.length}</p>}
        </div>
      </div>
    </div>
  );
}
