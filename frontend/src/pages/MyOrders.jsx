import React, { useEffect, useState, useCallback } from 'react';
import {
  Package, ChevronDown, ChevronUp, MapPin, CreditCard,
  Truck, CheckCircle, Clock, XCircle, RefreshCw, RotateCcw, ExternalLink, FileText, Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';

function _openCustomerInvoice(order, shipment) {
  const addr    = order.shippingAddress || {};
  const user    = order.userId || {};
  const fmtINR  = (n) => `₹${(+(n || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date    = new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const total   = order.totalAmount || 0;
  const taxAmt  = Math.round(total * 0.18 / 1.18 * 100) / 100;
  const pretax  = Math.round((total - taxAmt) * 100) / 100;

  const rows = order.items.map(it => `
    <tr>
      <td class="td">${it.name}${it.variantLabel ? `<br><small style="color:#9ca3af">${it.variantLabel}</small>` : ''}</td>
      <td class="td tc">${it.quantity}</td>
      <td class="td tr">${fmtINR(it.price)}</td>
      <td class="td tr fw">${fmtINR(it.price * it.quantity)}</td>
    </tr>`).join('');

  const w = window.open('', '_blank', 'width=860,height=700');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Invoice INV-${order.orderNumber}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#374151;background:#fff;padding:28px}
    .page{max-width:760px;margin:0 auto}
    .hdr{background:#1B1F3B;padding:22px 26px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:flex-start}
    .brand{font-size:20px;font-weight:900;font-family:Georgia,serif;color:#D4AF37}
    .sub{color:rgba(255,255,255,0.55);font-size:11px;margin-top:4px}
    .ititle{text-align:right;color:#D4AF37;font-size:15px;font-weight:900;letter-spacing:2px}
    .parties{display:flex;gap:20px;padding:14px 26px;border:1px solid #e5e7eb;border-top:none;background:#f9fafb}
    .p{flex:1}.pl{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:5px}
    .pn{font-weight:700;color:#1B1F3B;margin-bottom:2px}.ps{font-size:12px;color:#6b7280;line-height:1.5}
    table{width:100%;border-collapse:collapse}
    .th{background:#1B1F3B;color:white;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700}
    .td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top}
    tr:nth-child(even) .td{background:#f9fafb}
    .tc{text-align:center}.tr{text-align:right}.fw{font-weight:700}
    .sr td{padding:8px 12px;border-top:1px solid #e5e7eb;color:#6b7280;text-align:right}
    .gr td{padding:11px 12px;background:#1B1F3B;color:#D4AF37;font-weight:900;font-size:14px;text-align:right}
    .paid{margin:14px 0;padding:12px 18px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
    .pa{font-size:18px;font-weight:900;color:#15803d}
    .pb{padding:5px 14px;border-radius:999px;background:#dcfce7;color:#15803d;font-weight:700;font-size:12px}
    .ft{text-align:center;color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.7}
    @media print{body{padding:0}.page{max-width:100%}}
  </style>
  </head><body><div class="page">
    <div class="hdr">
      <div><div class="brand">🪔 Zutsav</div><div class="sub">GSTIN: 09AAAFZ1234Z1Z5 | info@zutsav.com</div></div>
      <div><div class="ititle">TAX INVOICE</div><div class="sub" style="color:rgba(255,255,255,0.6)">INV-${order.orderNumber}<br>Order: #${order.orderNumber}<br>${date}</div></div>
    </div>
    <div class="parties">
      <div class="p"><div class="pl">Bill To</div><div class="pn">${addr.name || ''}</div><div class="ps">${addr.phone || ''}<br>${user.email || ''}</div></div>
      <div class="p"><div class="pl">Ship To</div><div class="pn">${addr.name || ''}</div><div class="ps">${[addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}</div></div>
    </div>
    <table><thead><tr>
      <th class="th" style="text-align:left">Product</th><th class="th tc">Qty</th><th class="th tr">Unit Price</th><th class="th tr">Amount</th>
    </tr></thead><tbody>${rows}</tbody>
    <tfoot>
      <tr class="sr"><td colspan="3">Subtotal (excl. GST)</td><td>${fmtINR(pretax)}</td></tr>
      <tr class="sr"><td colspan="3">GST @ 18%</td><td>${fmtINR(taxAmt)}</td></tr>
      <tr class="gr"><td colspan="3">GRAND TOTAL</td><td>${fmtINR(total)}</td></tr>
    </tfoot></table>
    <div class="paid"><div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:2px">Amount Paid</div><div class="pa">${fmtINR(total)}</div></div><div class="pb">✅ Paid in Full</div></div>
    <div class="ft">Computer-generated invoice. No signature required.<br>Support: info@zutsav.com | +91-8851576605</div>
    <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:9px 24px;background:#1B1F3B;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🖨 Print / Save as PDF</button></div>
  </div></body></html>`);
  w.document.close();
}

const STATUS_META = {
  pending_payment:  { label: 'Awaiting Payment', color: 'bg-yellow-100 text-yellow-700',   dot: 'bg-yellow-400' },
  paid:             { label: 'Order Placed',      color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500'   },
  confirmed:        { label: 'Confirmed',          color: 'bg-indigo-100 text-indigo-700',   dot: 'bg-indigo-500' },
  processing:       { label: 'Confirmed',          color: 'bg-indigo-100 text-indigo-700',   dot: 'bg-indigo-500' },
  packed:           { label: 'Packed',             color: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-500' },
  shipped:          { label: 'Shipped',            color: 'bg-orange-100 text-orange-700',   dot: 'bg-orange-500' },
  out_for_delivery: { label: 'Out for Delivery',   color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500'  },
  delivered:        { label: 'Delivered',          color: 'bg-green-100 text-green-700',     dot: 'bg-green-500'  },
  cancelled:        { label: 'Cancelled',          color: 'bg-red-100 text-red-700',         dot: 'bg-red-500'    },
  refunded:         { label: 'Refunded',           color: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400'   },
  payment_failed:   { label: 'Payment Failed',     color: 'bg-red-100 text-red-700',         dot: 'bg-red-500'    },
};

const SHIPMENT_STATUS_META = {
  created:          { label: 'Shipment Created',  color: 'bg-blue-100 text-blue-700'    },
  picked_up:        { label: 'Picked Up',          color: 'bg-indigo-100 text-indigo-700'},
  in_transit:       { label: 'In Transit',         color: 'bg-purple-100 text-purple-700'},
  out_for_delivery: { label: 'Out for Delivery',   color: 'bg-amber-100 text-amber-700'  },
  delivered:        { label: 'Delivered',          color: 'bg-green-100 text-green-700'  },
  failed_delivery:  { label: 'Failed Delivery',    color: 'bg-red-100 text-red-700'      },
  cancelled:        { label: 'Cancelled',          color: 'bg-red-100 text-red-700'      },
  returned:         { label: 'Returned',           color: 'bg-gray-100 text-gray-600'    },
};

const TRACKING_STEPS = [
  { key: 'created',          label: 'Shipment Created'  },
  { key: 'picked_up',        label: 'Picked Up'         },
  { key: 'in_transit',       label: 'In Transit'        },
  { key: 'out_for_delivery', label: 'Out for Delivery'  },
  { key: 'delivered',        label: 'Delivered'         },
];

const ORDER_TIMELINE_STEPS = [
  { key: 'paid',             label: 'Order Placed'       },
  { key: 'confirmed',        label: 'Confirmed'          },
  { key: 'packed',           label: 'Packed'             },
  { key: 'shipped',          label: 'Shipped'            },
  { key: 'out_for_delivery', label: 'Out for Delivery'   },
  { key: 'delivered',        label: 'Delivered'          },
];

const FILTERS = [
  { key: '',          value: 'All Orders'  },
  { key: 'active',    value: 'Active'      },
  { key: 'delivered', value: 'Delivered'   },
  { key: 'cancelled', value: 'Cancelled'   },
];

// ── Shipment tracking timeline (when shipment record exists) ────
function ShipmentTimeline({ shipment }) {
  const historyMap = {};
  (shipment.shipmentHistory || []).forEach(h => { if (!historyMap[h.status]) historyMap[h.status] = h; });
  const currentIdx = TRACKING_STEPS.findIndex(s => s.key === shipment.shipmentStatus);

  const isTerminal = ['cancelled', 'returned', 'failed_delivery'].includes(shipment.shipmentStatus);

  if (isTerminal) {
    const meta = SHIPMENT_STATUS_META[shipment.shipmentStatus];
    const lastEntry = (shipment.shipmentHistory || []).slice(-1)[0];
    return (
      <div className={`flex items-center gap-3 py-3 px-4 rounded-xl border ${shipment.shipmentStatus === 'returned' ? 'bg-gray-50 border-gray-100' : 'bg-red-50 border-red-100'}`}>
        <XCircle size={18} className={shipment.shipmentStatus === 'returned' ? 'text-gray-400' : 'text-red-500'} />
        <div>
          <p className="text-sm font-semibold" style={{ color: shipment.shipmentStatus === 'returned' ? '#374151' : '#b91c1c' }}>{meta?.label || shipment.shipmentStatus}</p>
          {lastEntry?.timestamp && (
            <p className="text-xs text-gray-400 mt-0.5">{new Date(lastEntry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {TRACKING_STEPS.map((step, idx) => {
        const entry    = historyMap[step.key];
        const stepIdx  = TRACKING_STEPS.findIndex(s => s.key === step.key);
        const reached  = stepIdx <= currentIdx;
        const isCurrent = step.key === shipment.shipmentStatus;
        return (
          <div key={step.key} className="flex items-start gap-3 relative">
            {idx < TRACKING_STEPS.length - 1 && (
              <div className="absolute left-[9px] top-5 w-0.5 h-8" style={{ background: reached ? '#1B1F3B' : '#e5e7eb' }} />
            )}
            <div className="w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center"
              style={{ borderColor: reached ? '#1B1F3B' : '#e5e7eb', background: reached ? '#1B1F3B' : 'white' }}>
              {reached && <CheckCircle size={10} className="text-white" />}
            </div>
            <div className="pb-8">
              <p className={`text-sm font-semibold ${reached ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</p>
              {entry?.timestamp && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(entry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {isCurrent && !entry && <p className="text-xs text-indigo-500 font-medium mt-0.5">Current stage</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Fallback order timeline (when no shipment record) ───────────
function OrderTimeline({ order }) {
  const timelineMap = {};
  (order.statusTimeline || []).forEach(e => { timelineMap[e.status] = e; });
  if (timelineMap.processing && !timelineMap.confirmed) timelineMap.confirmed = timelineMap.processing;
  const cancelledOrRefunded = ['cancelled', 'refunded', 'payment_failed'].includes(order.status);

  if (cancelledOrRefunded) {
    return (
      <div className="flex items-center gap-3 py-3 px-4 bg-red-50 rounded-xl border border-red-100">
        <XCircle size={20} className="text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">{STATUS_META[order.status]?.label || order.status}</p>
          {order.cancelReason && <p className="text-xs text-red-500 mt-0.5">Reason: {order.cancelReason}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {ORDER_TIMELINE_STEPS.map((step, idx) => {
        const entry     = timelineMap[step.key];
        const isReached = !!entry;
        const isCurrent = order.status === step.key || (step.key === 'confirmed' && order.status === 'processing');
        return (
          <div key={step.key} className="flex items-start gap-3 relative">
            {idx < ORDER_TIMELINE_STEPS.length - 1 && (
              <div className="absolute left-[9px] top-5 w-0.5 h-8" style={{ background: isReached ? '#1B1F3B' : '#e5e7eb' }} />
            )}
            <div className="w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center"
              style={{ borderColor: isReached ? '#1B1F3B' : '#e5e7eb', background: isReached ? '#1B1F3B' : 'white' }}>
              {isReached && <CheckCircle size={10} className="text-white" />}
            </div>
            <div className="pb-8">
              <p className={`text-sm font-semibold ${isReached ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</p>
              {entry?.timestamp && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(entry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {isCurrent && !entry && <p className="text-xs text-indigo-500 font-medium mt-0.5">Current stage</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order }) {
  const [expanded,     setExpanded]     = useState(false);
  const [invoiceLoading, setInvLoading] = useState(false);
  const meta      = STATUS_META[order.status] || STATUS_META.paid;
  const firstItem = order.items?.[0];
  const shipment  = order.shipment || null;

  const displayName     = shipment?.courierName || shipment?.deliveryPartner || order.courier || null;
  const displayTracking = shipment?.trackingNumber || shipment?.awbNumber || order.trackingId || null;
  const shipMeta        = shipment ? SHIPMENT_STATUS_META[shipment.shipmentStatus] : null;
  const canDownloadInvoice = ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status);

  const handleDownloadInvoice = async () => {
    setInvLoading(true);
    try {
      const { data } = await API.get(`/marketplace/orders/${order._id}/invoice`);
      _openCustomerInvoice(data.order, data.shipment);
    } catch { toast.error('Could not load invoice'); }
    finally { setInvLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      {/* Card header */}
      <button onClick={() => setExpanded(p => !p)} className="w-full text-left px-5 py-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
          <Package size={22} style={{ color: '#1B1F3B' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">#{order.orderNumber}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
            {shipMeta && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${shipMeta.color}`}>{shipMeta.label}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 font-sans">
            {firstItem?.name}{order.items?.length > 1 ? ` +${order.items.length - 1} more` : ''} · {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {displayName && !expanded && (
            <p className="text-[10px] text-indigo-600 mt-0.5 flex items-center gap-1">
              <Truck size={9} /> {displayName}{displayTracking ? ` · ${displayTracking}` : ''}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-800 text-sm" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            ₹{order.totalAmount?.toLocaleString('en-IN')}
          </p>
          {expanded ? <ChevronUp size={16} className="text-gray-400 ml-auto mt-1" /> : <ChevronDown size={16} className="text-gray-400 ml-auto mt-1" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-5">

          {/* Items */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Items Ordered</p>
            <div className="space-y-2">
              {order.items?.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-gray-700">{item.name} <span className="text-gray-400">×{item.quantity}</span></span>
                  <span className="font-semibold text-gray-800">₹{item.total?.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-gray-200 pt-2 flex justify-between font-bold">
                <span className="text-gray-800">Total</span>
                <span style={{ color: '#1B1F3B', fontFamily: "'Cormorant Garamond', serif", fontSize: '1.1rem' }}>
                  ₹{order.totalAmount?.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Shipping address */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MapPin size={12} /> Delivery Address
            </p>
            <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 leading-relaxed">
              <p className="font-semibold">{order.shippingAddress?.name}</p>
              <p className="text-gray-500 text-xs">{order.shippingAddress?.phone}</p>
              <p className="text-gray-600 text-xs mt-1">
                {[order.shippingAddress?.address, order.shippingAddress?.city, order.shippingAddress?.district, order.shippingAddress?.state, order.shippingAddress?.pincode].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>

          {/* Shipment info (rich) */}
          {shipment ? (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Truck size={12} /> Shipment Details
              </p>
              <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${shipment.shippingMethod === 'tekipost' ? 'bg-indigo-200 text-indigo-800' : 'bg-purple-200 text-purple-800'}`}>
                      {shipment.shippingMethod === 'tekipost' ? '🚀 TekiPost' : `✋ ${shipment.manualType === 'local_delivery' ? 'Local Delivery' : 'Manual'}`}
                    </span>
                    {shipMeta && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${shipMeta.color}`}>{shipMeta.label}</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(shipment.courierName || shipment.deliveryPartner) && (
                    <div>
                      <p className="text-indigo-400 mb-0.5">{shipment.manualType === 'local_delivery' ? 'Partner' : 'Courier'}</p>
                      <p className="font-bold text-indigo-800">{shipment.courierName || shipment.deliveryPartner}</p>
                    </div>
                  )}
                  {displayTracking && (
                    <div>
                      <p className="text-indigo-400 mb-0.5">Tracking #</p>
                      <p className="font-bold text-indigo-800 font-mono">{displayTracking}</p>
                    </div>
                  )}
                  {shipment.awbNumber && shipment.awbNumber !== shipment.trackingNumber && (
                    <div>
                      <p className="text-indigo-400 mb-0.5">AWB</p>
                      <p className="font-bold text-indigo-800 font-mono">{shipment.awbNumber}</p>
                    </div>
                  )}
                  {shipment.estimatedDelivery && (
                    <div>
                      <p className="text-indigo-400 mb-0.5">Expected By</p>
                      <p className="font-bold text-indigo-800">
                        {new Date(shipment.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {shipment.driverName && (
                    <div>
                      <p className="text-indigo-400 mb-0.5">Driver</p>
                      <p className="font-bold text-indigo-800">{shipment.driverName}{shipment.driverPhone ? ` · ${shipment.driverPhone}` : ''}</p>
                    </div>
                  )}
                  {shipment.expectedTime && (
                    <div>
                      <p className="text-indigo-400 mb-0.5">Expected Time</p>
                      <p className="font-bold text-indigo-800">{shipment.expectedTime}</p>
                    </div>
                  )}
                </div>
                {shipment.trackingUrl && (
                  <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-700 font-semibold hover:underline mt-1">
                    <ExternalLink size={11} /> Track Online
                  </a>
                )}
              </div>
            </div>
          ) : (order.trackingId || order.courier) ? (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Truck size={12} /> Tracking
              </p>
              <div className="bg-indigo-50 rounded-xl p-3 text-sm">
                {order.courier    && <p className="font-semibold text-indigo-800">{order.courier}</p>}
                {order.trackingId && <p className="text-indigo-600 font-mono text-xs mt-0.5">{order.trackingId}</p>}
              </div>
            </div>
          ) : null}

          {/* Payment */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <CreditCard size={12} /> Payment
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">PhonePe</span>
              {order.phonePeTransactionId && (
                <span className="text-gray-400 text-xs font-mono">{order.phonePeTransactionId}</span>
              )}
            </div>
          </div>

          {/* OTP notice when out for delivery */}
          {order.status === 'out_for_delivery' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
              <span className="text-amber-500 mt-0.5 shrink-0 text-base">🔐</span>
              <div>
                <p className="text-xs font-bold text-amber-800">Delivery OTP Sent</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  A 6-digit OTP has been sent to your registered WhatsApp and email. Share it with the delivery executive <strong>only after receiving your order</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Invoice download */}
          {canDownloadInvoice && (
            <div>
              <button onClick={handleDownloadInvoice} disabled={invoiceLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all disabled:opacity-50">
                {invoiceLoading ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" /> Loading...</> : <><FileText size={12} /> Download Invoice</>}
              </button>
            </div>
          )}

          {/* Tracking timeline */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Timeline</p>
            {shipment && !['cancelled', 'refunded', 'payment_failed'].includes(order.status) ? (
              <ShipmentTimeline shipment={shipment} />
            ) : (
              <OrderTimeline order={order} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyOrders() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('');

  const ACTIVE_STATUSES = ['paid', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/marketplace/orders/my');
      setOrders(data.orders || []);
    } catch {
      toast.error('Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    if (!filter)                return o.status !== 'pending_payment';
    if (filter === 'active')    return ACTIVE_STATUSES.includes(o.status);
    if (filter === 'delivered') return o.status === 'delivered';
    if (filter === 'cancelled') return ['cancelled', 'refunded', 'payment_failed'].includes(o.status);
    return true;
  });

  const activeCount    = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length;
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1B1F3B', fontFamily: "'Cormorant Garamond', serif" }}>My Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length > 0 ? `${orders.length} total order${orders.length !== 1 ? 's' : ''}` : 'No orders yet'}</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      {orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',     value: orders.filter(o => o.status !== 'pending_payment').length, color: '#1B1F3B' },
            { label: 'Active',    value: activeCount,    color: '#7c3aed' },
            { label: 'Delivered', value: deliveredCount, color: '#059669' },
            { label: 'Cancelled', value: orders.filter(o => ['cancelled', 'refunded'].includes(o.status)).length, color: '#dc2626' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-bold" style={{ color, fontFamily: "'Cormorant Garamond', serif" }}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(({ key, value }) => (
          <button key={key} onClick={() => setFilter(key)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: filter === key ? '#1B1F3B' : 'white',
              color:      filter === key ? 'white'   : '#6b7280',
              border:     `1px solid ${filter === key ? '#1B1F3B' : '#e5e7eb'}`,
            }}>
            {value}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Package size={36} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-700 text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            {filter ? 'No orders in this category' : 'No orders yet'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {filter ? 'Try a different filter' : 'Your marketplace orders will appear here after purchase'}
          </p>
          {filter && (
            <button onClick={() => setFilter('')} className="mt-4 btn-outline text-sm">
              <RotateCcw size={13} /> Clear Filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => <OrderCard key={order._id} order={order} />)}
        </div>
      )}
    </div>
  );
}
