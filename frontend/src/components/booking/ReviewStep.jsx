import React from 'react';
import { Sparkles, Zap, Package, Shield, ArrowLeft, ShoppingCart, BadgeCheck } from 'lucide-react';
import { formatDuration } from '../../utils/durationFormatter';
import { formatINR, roundToPaise } from '../../utils/priceEngine';
import { getImageUrl } from '../../config';
import { fmtTime } from './constants';
import StepHeader from './StepHeader';
import PriceLine from './PriceLine';

export default function ReviewStep({
  pooja, pricing, rates, isUrgent, withKit, selectedKits,
  scheduledDate, scheduledTime, language, userDetails,
  referralToken, referralInfo,
  partialConfig, paymentMode, setPaymentMode, partialAmount, setPartialAmount,
  paying, onBack, onPay, onAddToCart,
}) {
  return (
    <div className="card-premium rounded-3xl p-6">
      <StepHeader icon={Sparkles} title="Review & Pay" desc="Confirm your ceremony booking" />

      {/* Pooja summary */}
      <div className="rounded-2xl p-4 border border-orange-100 mb-4" style={{ background: 'linear-gradient(135deg,var(--t-surface),var(--t-bg))' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-orange-100 shrink-0">
            {pooja.image
              ? <img src={getImageUrl(pooja.image)} alt={pooja.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-xl">🪔</div>}
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">{pooja.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {isUrgent && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><Zap size={9} />Urgent</span>}
              {formatDuration(pooja) && <p className="text-xs text-gray-400">{formatDuration(pooja)}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
          {[
            ['Date', scheduledDate ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''],
            ['Time', scheduledTime ? fmtTime(scheduledTime) : ''],
            ['Language', language || ''],
            ['Address', userDetails.address ? `${userDetails.address}${userDetails.city ? ', ' + userDetails.city : ''}` : ''],
          ].filter(([, v]) => v).map(([l, v]) => (
            <div key={l}><span className="text-gray-400">{l}: </span><span className="text-gray-700 font-medium">{v}</span></div>
          ))}
        </div>
      </div>

      {referralToken && referralInfo?.panditId && (
        <div className="mb-4 rounded-2xl p-3 border border-green-200 bg-green-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-orange-100 shrink-0">
            {referralInfo.panditId.profilePhoto
              ? <img src={getImageUrl(referralInfo.panditId.profilePhoto)} alt={referralInfo.panditId.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-lg">🙏</div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Referred by {referralInfo.panditId.name}</p>
            <p className="text-xs text-green-600">Secure Referral Link · Verified Pandit</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold shrink-0">
            <BadgeCheck size={10} /> Referral
          </span>
        </div>
      )}

      {withKit && selectedKits?.length > 0 && !isUrgent && (
        <div className="mb-4 rounded-2xl p-3 border border-amber-200 bg-amber-50 flex items-start gap-3">
          <Package size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1.5">
            {selectedKits.map((kit) => (
              <div key={kit._id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800 truncate">{kit.name}</p>
                  <p className="text-xs text-amber-600">Includes {kit.items?.length || 0} items</p>
                </div>
                <span className="font-bold text-amber-700 text-sm shrink-0">{formatINR(kit.discountPrice || 0)}</span>
              </div>
            ))}
            {selectedKits.length > 1 && (
              <div className="border-t border-amber-200 pt-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700">Kits Total</span>
                <span className="font-bold text-amber-800 text-sm">{formatINR(pricing.kitAmount)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Price breakdown */}
      <div className="rounded-2xl border border-orange-200 overflow-hidden mb-4">
        <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-200">
          <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">Price Breakdown</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <PriceLine label="Pooja Service" amount={pricing.poojaAmount} sub="Religious services are GST-exempt" />
          {pricing.platformFee > 0 && (
            <PriceLine
              label={rates.commissionType === 'fixed' ? `Platform Fee (₹${rates.commissionFixed} fixed)` : `Platform Fee (${rates.commissionPercent}%)`}
              amount={pricing.platformFee} muted sub="Convenience fee"
            />
          )}
          {pricing.platformGST > 0 && (
            <PriceLine label={`GST on Platform Fee (${rates.gstPercent}%)`} amount={pricing.platformGST} muted />
          )}
          {pricing.kitAmount > 0 && (
            selectedKits.length > 1
              ? selectedKits.map((kit) => (
                  <PriceLine key={kit._id} label={`Samagri Kit — ${kit.name}`} amount={kit.discountPrice || 0} muted />
                ))
              : <PriceLine label={`Samagri Kit — ${selectedKits[0]?.name}`} amount={pricing.kitAmount} muted sub="Delivered to ceremony address" />
          )}
          {pricing.kitGST > 0 && (
            <PriceLine label={`GST on Kit (${rates.gstPercent}%)`} amount={pricing.kitGST} muted />
          )}

          <div className="border-t border-orange-100 pt-2.5 flex justify-between items-center">
            <span className="font-bold text-gray-800 text-sm">Grand Total</span>
            <span className="font-bold text-orange-600 text-2xl" style={{ fontFamily: "'Cormorant Garamond',serif" }}>
              {formatINR(pricing.grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Mode Selection */}
      {partialConfig.enabled && (
        <div className="rounded-2xl border border-indigo-200 overflow-hidden mb-4">
          <div className="bg-indigo-50 px-4 py-2.5 border-b border-indigo-200">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Payment Option</p>
          </div>
          <div className="p-4 space-y-3">
            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              paymentMode === 'FULL' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'
            }`}>
              <input type="radio" name="paymentMode" value="FULL" checked={paymentMode === 'FULL'}
                onChange={() => setPaymentMode('FULL')} className="accent-indigo-600" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-800">Pay Full Amount</p>
                <p className="text-xs text-gray-500 mt-0.5">Pay {formatINR(pricing.grandTotal)} now · No pending balance</p>
              </div>
              <span className="font-bold text-indigo-700 text-sm">{formatINR(pricing.grandTotal)}</span>
            </label>

            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              paymentMode === 'PARTIAL' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200'
            }`}>
              <input type="radio" name="paymentMode" value="PARTIAL" checked={paymentMode === 'PARTIAL'}
                onChange={() => {
                  setPaymentMode('PARTIAL');
                  const opts = partialConfig.mode === 'percentage'
                    ? partialConfig.options.map(p => roundToPaise(pricing.grandTotal * p / 100))
                    : partialConfig.options;
                  if (opts.length > 0 && !partialAmount) setPartialAmount(opts[0]);
                }} className="accent-orange-500" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-800">Pay Partial Amount</p>
                <p className="text-xs text-gray-500 mt-0.5">Minimum ₹{partialConfig.minAmount} · Pay rest later</p>
              </div>
            </label>

            {paymentMode === 'PARTIAL' && (
              <div className="pt-1 pl-2 space-y-3">
                {partialConfig.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {partialConfig.options.map((opt) => {
                      const resolvedAmt = partialConfig.mode === 'percentage'
                        ? roundToPaise(pricing.grandTotal * opt / 100)
                        : opt;
                      const label = partialConfig.mode === 'percentage' ? `${opt}%` : formatINR(resolvedAmt);
                      const isDisabled = resolvedAmt < partialConfig.minAmount || resolvedAmt >= pricing.grandTotal;
                      return (
                        <button
                          key={opt} type="button" disabled={isDisabled}
                          onClick={() => setPartialAmount(resolvedAmt)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            partialAmount === resolvedAmt ? 'border-orange-500 bg-orange-500 text-white' : 'border-orange-200 text-orange-700 hover:border-orange-400'
                          }`}
                        >
                          {label}
                          {partialConfig.mode === 'percentage' && <span className="ml-1 text-[10px] opacity-80">({formatINR(resolvedAmt)})</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Or enter custom amount</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">₹</span>
                    <input
                      type="number"
                      min={partialConfig.minAmount}
                      max={pricing.grandTotal - 1}
                      value={partialAmount || ''}
                      onChange={(e) => setPartialAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="input flex-1 text-sm"
                      placeholder={`Min ₹${partialConfig.minAmount}`}
                    />
                  </div>
                  {partialAmount > 0 && partialAmount < partialConfig.minAmount && (
                    <p className="text-red-500 text-xs mt-1">Minimum partial payment is ₹{partialConfig.minAmount}</p>
                  )}
                </div>

                {partialAmount >= partialConfig.minAmount && partialAmount < pricing.grandTotal && (
                  <div className="rounded-xl border border-orange-200 bg-amber-50 px-4 py-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Pay Now</span>
                      <span className="font-bold text-orange-600">{formatINR(partialAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Pay Later</span>
                      <span className="font-semibold text-red-600">{formatINR(pricing.grandTotal - partialAmount)}</span>
                    </div>
                    <div className="border-t border-orange-200 pt-1.5 flex justify-between text-xs text-gray-500">
                      <span>Total Booking Amount</span>
                      <span>{formatINR(pricing.grandTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5 py-2.5 px-3.5 rounded-xl border border-blue-100 bg-blue-50 mb-4">
        <Shield size={13} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">Secure payment via PhonePe · UPI, Cards, Net Banking supported</p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="btn-outline flex items-center gap-2 shrink-0">
            <ArrowLeft size={14} /> Edit
          </button>
          <button type="button" onClick={onPay} disabled={paying} className="btn-primary flex-1 py-3.5 text-base">
            {paying ? 'Processing…' : paymentMode === 'PARTIAL' && partialAmount >= partialConfig.minAmount
              ? `Pay ${formatINR(partialAmount)} Now 🙏`
              : `Pay ${formatINR(pricing.grandTotal)} 🙏`}
          </button>
        </div>

        <button
          type="button"
          onClick={onAddToCart}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-orange-300 text-orange-700 font-semibold text-sm hover:bg-orange-50 transition-colors"
        >
          <ShoppingCart size={16} /> Add to Cart · Continue Shopping
        </button>
      </div>
    </div>
  );
}
