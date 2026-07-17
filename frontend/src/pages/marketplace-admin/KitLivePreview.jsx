import React, { useMemo } from 'react';
import { Eye, Package, ExternalLink } from 'lucide-react';
import { getImageUrl } from '../../config';

// Pure derived preview — kitTotalCost/kitSellingPrice are passed in as-is
// from the existing pricing useEffect in MarketplaceTab, not recomputed here,
// so the preview can never drift from the actual value that gets submitted.
export default function KitLivePreview({ kitForm, kitItems, kitLinkedPoojas, kitImage, currentImage, kitTotalCost, kitSellingPrice }) {
  const coverUrl = useMemo(() => {
    if (kitImage) return URL.createObjectURL(kitImage);
    if (currentImage) return getImageUrl(currentImage);
    return null;
  }, [kitImage, currentImage]);

  const itemCount = (kitItems || []).filter((i) => i.productId).length;
  const totalCost = Number(kitTotalCost) || 0;
  const sellingPrice = Number(kitSellingPrice) || 0;
  const discountPct = totalCost && sellingPrice && sellingPrice < totalCost
    ? Math.round((1 - sellingPrice / totalCost) * 100)
    : 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <Eye size={13} className="text-gray-400" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Kit Preview</h3>
        </div>
        <span className="text-[10px] text-saffron-600 flex items-center gap-1 font-medium">
          Preview <ExternalLink size={10} />
        </span>
      </div>

      <div className="relative mx-5 mt-2 rounded-xl overflow-hidden" style={{ background: 'var(--t-surface)' }}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-40 object-cover" />
        ) : (
          <div className="w-full h-40 flex items-center justify-center text-3xl">🎁</div>
        )}
        <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white text-gray-700 shadow">
          Preview
        </span>
      </div>

      <div className="p-5 pt-3">
        <p className="font-bold text-gray-800 text-base truncate">{kitForm.name || 'Kit Name'}</p>
        <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1 mb-2">
          <Package size={12} /> Includes {itemCount} item{itemCount !== 1 ? 's' : ''}
        </p>

        <div className="flex items-center gap-2 mb-1.5">
          {sellingPrice ? <span className="font-bold text-saffron-600 text-sm">₹{sellingPrice.toLocaleString('en-IN')}</span> : <span className="text-xs text-gray-300">Price not set</span>}
          {totalCost > 0 && sellingPrice > 0 && totalCost !== sellingPrice && <span className="text-xs text-gray-400 line-through">₹{totalCost.toLocaleString('en-IN')}</span>}
          {discountPct > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{discountPct}% OFF</span>}
        </div>

        <div className="space-y-1 text-xs text-gray-500 border-t pt-3 mt-2" style={{ borderColor: 'var(--t-border)' }}>
          <p><span className="text-gray-400">Tax (GST)</span> &nbsp; {kitForm.taxRate ? `${kitForm.taxRate}%` : '—'}</p>
          <p><span className="text-gray-400">Linked Poojas</span> &nbsp; {(kitLinkedPoojas || []).length} Selected</p>
          <p><span className="text-gray-400">Featured Kit</span> &nbsp; {kitForm.isFeatured ? 'Yes' : 'No'}</p>
        </div>
      </div>
    </div>
  );
}
