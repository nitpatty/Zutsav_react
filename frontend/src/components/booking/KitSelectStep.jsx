import React from 'react';
import { ShoppingBag, Package, Tag, Eye, CheckCircle } from 'lucide-react';
import { kitSavingsPct, formatINR } from '../../utils/priceEngine';
import { getImageUrl, handleImageError } from '../../config';
import StepHeader from './StepHeader';
import NavButtons from './NavButtons';

export default function KitSelectStep({ linkedKits, kitsLoading, kitId, setKitId, errors, setErrors, onViewItems, onBack, onNext }) {
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={ShoppingBag} title="Select a Samagri Kit" desc="Choose the right kit for your ceremony" />

      {kitsLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {linkedKits.map((kit) => {
            const items = kit.items?.map(it => it.productId?.name).filter(Boolean) || [];
            const savings = kitSavingsPct(kit.totalCost, kit.discountPrice);
            const isSelected = kitId === kit._id;

            return (
              <div
                key={kit._id}
                onClick={() => { setKitId(kit._id); setErrors(e => ({ ...e, kitId: '' })); }}
                className={`rounded-2xl border-2 cursor-pointer transition-all duration-200 overflow-hidden ${
                  isSelected ? 'border-orange-400 shadow-md' : 'border-gray-200 hover:border-orange-200 hover:shadow-sm'
                }`}
              >
                <div className={`px-5 py-4 ${isSelected ? 'bg-orange-50' : 'bg-white'}`}>
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-amber-50 shrink-0 flex items-center justify-center">
                      {kit.image
                        ? <img src={getImageUrl(kit.image)} alt={kit.name} onError={handleImageError} className="w-full h-full object-cover" />
                        : <Package size={26} className="text-orange-300" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`font-bold text-base ${isSelected ? 'text-orange-800' : 'text-gray-800'}`}>{kit.name}</p>
                          {kit.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{kit.description}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-orange-600 text-lg" style={{ fontFamily: "'Cormorant Garamond',serif" }}>
                            {formatINR(kit.discountPrice || 0)}
                          </p>
                          {savings > 0 && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">{savings}% off</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1 text-[11px] text-gray-500">
                          <Package size={11} /><span>{items.length} items</span>
                        </div>
                        {savings > 0 && (
                          <div className="flex items-center gap-1 text-[11px] text-green-600">
                            <Tag size={11} /><span>Save {formatINR(kit.totalCost - kit.discountPrice)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`px-5 py-3 border-t flex items-center justify-between ${isSelected ? 'border-orange-200 bg-orange-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onViewItems(kit); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <Eye size={13} /> View Items
                  </button>

                  {isSelected ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                      <CheckCircle size={13} /> Kit Selected
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setKitId(kit._id); setErrors(err => ({ ...err, kitId: '' })); }}
                      className="text-xs font-semibold text-orange-600 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      Select Kit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {errors.kitId && <p className="text-red-500 text-xs mt-3">{errors.kitId}</p>}
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}
