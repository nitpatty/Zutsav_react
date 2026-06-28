/**
 * Tekipost Courier Integration
 * API Base: https://app.tekipost.com
 * Auth:              POST /api-login                → JWT Bearer token (expires 24h)
 *
 * Single Order API (marketplace orders — 2-step flow):
 *   Step 1 — Create order:   POST /api-b2c-single-order   → returns tekipostOrderId + available couriers
 *   Step 2 — Confirm courier:POST /api-b2c-confirm-order  → returns AWB, label URL, tracking URL
 *   Cancel AWB:              POST /api-cancel-shipment    → returns wallet refund amount
 *
 * Quick shipment (legacy — kit booking delivery only):
 *                            POST /api-b2c-quick-shipment → one-shot AWB (no courier selection)
 *
 * Track shipment:            GET  /api-tracking-details/{awb}
 *
 * Required env vars:
 *   TEKIPOST_EMAIL              — account email
 *   TEKIPOST_PASSWORD           — account password
 *   TEKIPOST_SENDER_ADDRESS_ID  — sender address ID from TekiPost dashboard
 *   TEKIPOST_LOGISTICS_ID       — (quick-shipment only) 0 = TekiPost auto-select
 *
 * NOTE: If TekiPost changes endpoint URLs, update the constants inside each function.
 */

const BASE_URL = 'https://app.tekipost.com';

let _tokenCache = { token: null, expiresAt: 0 };

// ─── friendly error map ─────────────────────────────────────────────────────
const TEKIPOST_ERROR_MAP = [
  { match: /wallet.*balance.*not.*enough/i,         friendly: 'TekiPost wallet balance is insufficient. Please recharge your TekiPost account wallet before creating a shipment.' },
  { match: /insufficient.*balance/i,                friendly: 'TekiPost wallet balance is insufficient. Please recharge your TekiPost account wallet before creating a shipment.' },
  { match: /no logistics defined/i,                 friendly: 'No logistics partner is configured for your TekiPost account. Check Logistics Settings in the dashboard.' },
  { match: /no courier.*available/i,                friendly: 'No courier service is available for this pickup/delivery pincode combination.' },
  { match: /no.*couriers.*found/i,                  friendly: 'No couriers available for this route. Try a different pincode or check TekiPost Logistics Settings.' },
  { match: /sender.*address.*not found/i,           friendly: 'Pickup address not found. Verify TEKIPOST_SENDER_ADDRESS_ID matches an address in your TekiPost dashboard.' },
  { match: /sender.*address.*id/i,                  friendly: 'Invalid pickup address ID. Check TEKIPOST_SENDER_ADDRESS_ID env var.' },
  { match: /pickup.*pincode.*not.*serviceable/i,    friendly: 'Pickup pincode is not serviceable by any active courier.' },
  { match: /delivery.*pincode.*not.*serviceable/i,  friendly: 'Delivery pincode is not serviceable. The customer\'s area may not be covered.' },
  { match: /pincode.*not.*serviceable/i,            friendly: 'Pincode not serviceable by any active courier.' },
  { match: /invalid.*pincode/i,                     friendly: 'Invalid pincode in the delivery address.' },
  { match: /weight.*required/i,                     friendly: 'Package weight is required.' },
  { match: /invalid.*weight/i,                      friendly: 'Invalid package weight. Must be a positive number.' },
  { match: /account.*configuration/i,               friendly: 'TekiPost account configuration is incomplete. Ensure rates and courier partners are activated.' },
  { match: /invalid.*token/i,                       friendly: 'TekiPost authentication failed. Credentials may have changed — check TEKIPOST_EMAIL and TEKIPOST_PASSWORD.' },
  { match: /unauthorized/i,                         friendly: 'TekiPost API returned unauthorized. Verify account credentials in env vars.' },
  { match: /duplicate.*order/i,                     friendly: 'This order number was already submitted to TekiPost.' },
  { match: /mobile.*no.*required/i,                 friendly: 'Customer mobile number is required.' },
  { match: /invalid.*mobile/i,                      friendly: 'Invalid customer mobile number.' },
  { match: /consignee.*name.*required/i,            friendly: 'Customer name (consignee name) is required.' },
  { match: /receiver.*address.*required/i,          friendly: 'Delivery address is required.' },
  { match: /validation failed/i,                    friendly: 'TekiPost validation failed. See backend logs for the full error details.' },
  { match: /service unavailable/i,                  friendly: 'TekiPost service is temporarily unavailable. Please try again in a few minutes.' },
  { match: /already cancelled/i,                    friendly: 'This shipment has already been cancelled.' },
  { match: /cannot.*cancel/i,                       friendly: 'Shipment cannot be cancelled at this stage (likely already picked up).' },
];

function _parseTekipostError(data, httpStatus) {
  const fieldErrors = (data?.errors || [])
    .map((e) => {
      const field = e.field ? `${e.field}: ` : '';
      return `${field}${e.message}`;
    })
    .join('; ');

  const rawMessage = data?.message || '';
  const combined   = [rawMessage, fieldErrors].filter(Boolean).join(' — ');

  for (const rule of TEKIPOST_ERROR_MAP) {
    if (rule.match.test(combined) || rule.match.test(rawMessage) || rule.match.test(fieldErrors)) {
      return fieldErrors ? `${rule.friendly} (${fieldErrors})` : rule.friendly;
    }
  }

  if (httpStatus === 503) return `TekiPost service unavailable (HTTP 503). ${combined}`;
  if (httpStatus === 401) return `TekiPost authentication failed. Check credentials. ${combined}`;
  if (httpStatus === 400) return `TekiPost rejected the request: ${combined || 'Validation error — see backend logs.'}`;

  return combined || 'TekiPost request failed. Check backend logs for details.';
}

// ─── env var check (warn only, don't crash) ─────────────────────────────────
function _checkEnv() {
  const required = ['TEKIPOST_EMAIL', 'TEKIPOST_PASSWORD', 'TEKIPOST_SENDER_ADDRESS_ID'];
  required.forEach((key) => {
    if (!process.env[key]) {
      console.warn(`[TekiPost] WARNING: env var ${key} is not set. Using hardcoded fallback — set it in .env for production.`);
    }
  });
}

// ─── shared payload builder ─────────────────────────────────────────────────
function _buildOrderPayload({ bookingNumber, recipientName, recipientPhone, recipientEmail = '',
  address, landmark = '', city, state, pincode,
  weight = 0.5, length = 20, width = 15, height = 10,
  orderValue = 500, isCOD = false, codAmount = 0, items = [] }) {
  const senderAddressId = Number(process.env.TEKIPOST_SENDER_ADDRESS_ID || 1);

  const productDetails = items.length > 0
    ? items.map((item, i) => ({
        sku_number:       i + 1,
        product_name:     item.name  || 'Pooja Samagri',
        product_quantity: item.qty   || 1,
        product_value:    item.value || Math.round(orderValue / items.length),
      }))
    : [{ sku_number: 1, product_name: 'Pooja Samagri Kit', product_quantity: 1, product_value: orderValue }];

  return {
    consignee_name:       recipientName,
    mobile_no:            Number(String(recipientPhone).replace(/\D/g, '')),
    alternate_mobile_no:  Number(String(recipientPhone).replace(/\D/g, '')),
    email_id:             recipientEmail,
    receiver_address:     address,
    receiver_pincode:     Number(pincode),
    receiver_city:        city,
    receiver_state:       state,
    receiver_landmark:    landmark,
    customer_order_no:    bookingNumber,
    order_type:           isCOD ? 1 : 0,
    product_quantity:     productDetails.reduce((s, p) => s + p.product_quantity, 0),
    cod_amount:           isCOD ? codAmount : 0,
    physical_weight:      weight,
    product_length:       length,
    product_width:        width,
    product_height:       height,
    order_value:          orderValue,
    productdetatis:       productDetails,  // TekiPost's own misspelling — do not fix
    sender_address_id:    senderAddressId,
    return_address_same_as_pickup_address: 1,
  };
}

async function getToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  _checkEnv();

  const email    = process.env.TEKIPOST_EMAIL    || 'zutsav.official@gmail.com';
  const password = process.env.TEKIPOST_PASSWORD || 'Ch@ng3m3';

  const res  = await fetch(`${BASE_URL}/api-login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  const data = await res.json();

  if (!data.success || !data.data?.token) {
    console.error('[TekiPost] Login failed. Response:', JSON.stringify(data));
    throw new Error(`TekiPost login failed: ${data.message || 'unknown error'}`);
  }

  const expiresIn = data.data.expires_in || 86400;
  _tokenCache = {
    token:     data.data.token,
    expiresAt: Date.now() + (expiresIn - 300) * 1000,
  };
  return _tokenCache.token;
}

// ─── SINGLE ORDER API — Step 1 ──────────────────────────────────────────────
/**
 * Create a Single Order on TekiPost and return the list of available couriers.
 * Admin must then call confirmSingleOrder() with the selected logistics_id.
 *
 * Returns success=true  → { success, tekipostOrderId, couriers: [{logisticsId, courierName, ...}] }
 *         success=false → { success, error, tekipostResponse }
 */
async function createSingleOrder(params) {
  const ENDPOINT = `${BASE_URL}/api-b2c-single-order`;
  try {
    const token   = await getToken();
    const payload = _buildOrderPayload(params);

    console.log('[TekiPost-Single] POST', ENDPOINT, '| order:', payload.customer_order_no,
      '| weight:', payload.physical_weight, 'kg | pincode:', payload.receiver_pincode);

    const r    = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
    });
    const data = await r.json();

    const isSuccess = data.success || data.status === 1 ||
      (Number(data.code) === 200 && String(data.message || '').toLowerCase().includes('success'));

    if (!isSuccess) {
      console.error('[TekiPost-Single] createSingleOrder FAILED — HTTP', r.status);
      console.error('[TekiPost-Single] Request:', JSON.stringify(payload, null, 2));
      console.error('[TekiPost-Single] Response:', JSON.stringify(data, null, 2));
      return {
        success:          false,
        error:            _parseTekipostError(data, r.status),
        tekipostResponse: data,
      };
    }

    // TekiPost auto-selected courier and returned AWB directly (no courier selection step)
    if (data.tracking_number) {
      console.log('[TekiPost-Single] Auto-confirmed — AWB:', data.tracking_number, '| courier:', data.courier_name);
      return {
        success:          true,
        autoConfirmed:    true,
        tekipostOrderId:  '',
        couriers:         [],
        awbNumber:        String(data.tracking_number),
        courier:          data.courier_name  || 'TekiPost',
        labelUrl:         data.label_url     || '',
        freightCharges:   Number(data.freight_charges || 0),
        tekipostResponse: data,
      };
    }

    // Normalise courier list — TekiPost may use different field names across API versions
    const rawCouriers = data.data?.courier_options || data.data?.couriers ||
                        data.courier_options        || data.couriers       || [];

    const couriers = rawCouriers.map((c) => ({
      logisticsId:   c.logistics_id        || c.id              || '',
      courierCode:   c.courier_code        || c.code            || '',
      courierName:   c.courier_name        || c.name            || 'Unknown Courier',
      serviceType:   c.service_type        || c.type            || 'Standard',
      freightCharge: Number(c.freight_charge || c.charge || c.freight || 0),
      estimatedDays: c.estimated_delivery_days || c.eta_days    || null,
      pickupDate:    c.expected_pickup_date    || c.pickup_date  || null,
      isRecommended: !!(c.is_recommended       || c.recommended),
      rating:        c.rating                  || null,
      isCOD:         !!(c.cod_available        || c.is_cod),
    }));

    if (couriers.length === 0) {
      return {
        success: false,
        error:   'No courier services are available for this delivery route. Try a different delivery pincode or contact TekiPost support.',
      };
    }

    const tekipostOrderId = String(
      data.data?.order_id || data.data?.id || data.order_id || data.id || ''
    );

    console.log('[TekiPost-Single] createSingleOrder SUCCESS — order_id:', tekipostOrderId, '| couriers:', couriers.length);

    return {
      success:          true,
      tekipostOrderId,
      couriers,
      tekipostResponse: data,
    };
  } catch (err) {
    console.error('[TekiPost-Single] createSingleOrder exception:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

// ─── SINGLE ORDER API — Step 2 ──────────────────────────────────────────────
/**
 * Confirm the courier selection and generate AWB.
 *
 * Returns success=true  → { success, awbNumber, trackingId, courier, courierCode,
 *                           labelUrl, trackingUrl, freightCharges, pickupDate, estimatedDelivery }
 *         success=false → { success, error, tekipostResponse }
 */
async function confirmSingleOrder({ tekipostOrderId, logisticsId }) {
  const ENDPOINT = `${BASE_URL}/api-b2c-confirm-order`;
  try {
    const token   = await getToken();
    const payload = { order_id: tekipostOrderId, logistics_id: logisticsId };

    console.log('[TekiPost-Single] POST', ENDPOINT, '| order_id:', tekipostOrderId, '| logistics_id:', logisticsId);

    const r    = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
    });
    const data = await r.json();

    if (!data.success && data.status !== 1) {
      console.error('[TekiPost-Single] confirmSingleOrder FAILED — HTTP', r.status, JSON.stringify(data, null, 2));
      return {
        success:          false,
        error:            _parseTekipostError(data, r.status),
        tekipostResponse: data,
      };
    }

    const awb         = String(data.data?.awb_number || data.data?.tracking_number || data.awb_number || data.tracking_number || '');
    const courierCode = data.data?.courier_code  || data.courier_code  || '';
    const courierName = data.data?.courier_name  || data.courier_name  || 'TekiPost';
    const labelUrl    = data.data?.label_url     || data.label_url     || '';
    const trackingUrl = data.data?.tracking_url  || data.tracking_url  || '';
    const pickupDate  = data.data?.pickup_date   || data.pickup_date   || null;
    const estDelivery = data.data?.expected_delivery_date || data.expected_delivery_date || null;
    const freight     = data.data?.freight_charges || data.freight_charges || 0;

    console.log('[TekiPost-Single] confirmSingleOrder SUCCESS — AWB:', awb, '| courier:', courierName);

    return {
      success:           true,
      awbNumber:         awb,
      trackingId:        awb,
      courier:           courierName,
      courierCode,
      labelUrl,
      trackingUrl,
      freightCharges:    freight,
      pickupDate,
      estimatedDelivery: estDelivery,
      tekipostResponse:  data,
    };
  } catch (err) {
    console.error('[TekiPost-Single] confirmSingleOrder exception:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

// ─── CANCEL AWB ─────────────────────────────────────────────────────────────
/**
 * Cancel an AWB. TekiPost typically refunds the freight charge to the wallet.
 *
 * Returns success=true  → { success, refundAmount }
 *         success=false → { success, error, tekipostResponse }
 */
async function cancelShipment(awbNumber) {
  const ENDPOINT = `${BASE_URL}/api-cancel-shipment`;
  try {
    const token = await getToken();

    console.log('[TekiPost] POST', ENDPOINT, '| AWB:', awbNumber);

    const r    = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ awb_number: awbNumber }),
    });
    const data = await r.json();

    if (!data.success && data.status !== 1) {
      console.error('[TekiPost] cancelShipment FAILED — HTTP', r.status, JSON.stringify(data, null, 2));
      return {
        success:          false,
        error:            _parseTekipostError(data, r.status),
        tekipostResponse: data,
      };
    }

    const refundAmount = Number(data.data?.refund_amount || data.refund_amount || 0);
    console.log('[TekiPost] cancelShipment SUCCESS — AWB:', awbNumber, '| refund:', refundAmount);

    return { success: true, refundAmount, tekipostResponse: data };
  } catch (err) {
    console.error('[TekiPost] cancelShipment exception:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

// ─── QUICK SHIPMENT (legacy — kit booking delivery only) ────────────────────
/**
 * One-shot shipment creation using the Quick/B2C endpoint.
 * Used only for booking kit delivery. Marketplace orders must use createSingleOrder + confirmSingleOrder.
 *
 * Returns success=true  → { success, trackingId, awbNumber, courier, courierCode, labelUrl, trackingUrl,
 *                           freightCharges, pickupDate, estimatedDelivery, tekipostOrderNo }
 *         success=false → { success, error, tekipostResponse }
 */
async function createShipment({
  bookingNumber,
  recipientName,
  recipientPhone,
  recipientEmail = '',
  address,
  landmark       = '',
  city,
  state,
  pincode,
  weight         = 0.5,
  length         = 20,
  width          = 15,
  height         = 10,
  orderValue     = 500,
  isCOD          = false,
  codAmount      = 0,
  items          = [],
}) {
  try {
    const token          = await getToken();
    const rawLogisticsId = Number(process.env.TEKIPOST_LOGISTICS_ID || 0);
    const payload        = _buildOrderPayload({
      bookingNumber, recipientName, recipientPhone, recipientEmail,
      address, landmark, city, state, pincode,
      weight, length, width, height, orderValue, isCOD, codAmount, items,
    });

    if (rawLogisticsId > 0) {
      payload.logistics_id = rawLogisticsId;
    }

    const sendPayload = async (p) => {
      const url = `${BASE_URL}/api-b2c-quick-shipment`;
      console.log('[TekiPost-Quick] POST', url, '| order:', p.customer_order_no,
        '| weight:', p.physical_weight, 'kg | pincode:', p.receiver_pincode,
        '| logistics_id:', p.logistics_id ?? '(auto)');

      const r = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(p),
      });
      const d = await r.json();

      if (!d.success && d.status !== 1) {
        console.error('[TekiPost-Quick] FAILED — HTTP', r.status);
        console.error('[TekiPost-Quick] Request:', JSON.stringify(p, null, 2));
        console.error('[TekiPost-Quick] Response:', JSON.stringify(d, null, 2));
      } else {
        console.log(`[TekiPost-Quick] SUCCESS (HTTP ${r.status}) — tracking:`, d.tracking_number || d.data?.awb_number);
      }

      return { d, httpStatus: r.status };
    };

    let { d: data, httpStatus } = await sendPayload(payload);

    const isDuplicate = !data.success && data.status !== 1 &&
      (data.errors || []).some((e) => e.code === 'E_DUPLICATE_REF' && e.field === 'customer_order_no');

    if (isDuplicate) {
      const suffix       = Date.now().toString().slice(-6);
      const retryOrderNo = `${bookingNumber}-${suffix}`;
      console.log(`[TekiPost-Quick] Duplicate order_no — retrying as: ${retryOrderNo}`);
      ({ d: data, httpStatus } = await sendPayload({ ...payload, customer_order_no: retryOrderNo }));
      if (data.status === 1 || data.success) {
        data._tekipost_order_no = retryOrderNo;
      }
    }

    if (data.status !== 1 && !data.success) {
      return {
        success:          false,
        error:            _parseTekipostError(data, httpStatus),
        tekipostResponse: data,
      };
    }

    const awb         = String(data.tracking_number || data.data?.awb_number || data.awb_number || '');
    const courierCode = data.courier_code  || data.data?.courier_code  || '';
    const courierName = data.courier_name  || data.data?.courier_name  || 'TekiPost';
    const labelUrl    = data.label_url     || data.data?.label_url     || '';
    const trackingUrl = data.tracking_url  || data.data?.tracking_url  || '';
    const pickupDate  = data.pickup_date   || data.data?.pickup_date   || null;
    const estDelivery = data.expected_delivery_date || data.data?.expected_delivery_date || null;
    const freight     = data.freight_charges || data.data?.freight_charges || '';

    return {
      success:           true,
      trackingId:        awb,
      awbNumber:         awb,
      courier:           courierName,
      courierCode,
      labelUrl,
      trackingUrl,
      freightCharges:    freight,
      pickupDate,
      estimatedDelivery: estDelivery,
      tekipostOrderNo:   data._tekipost_order_no || bookingNumber,
      tekipostResponse:  data,
    };
  } catch (err) {
    console.error('[TekiPost-Quick] createShipment exception:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

// ─── TRACKING ────────────────────────────────────────────────────────────────
/**
 * Fetch latest tracking status for a shipment.
 * Returns { success, status, deliveryDate, events, error }
 */
async function trackShipment(trackingId) {
  try {
    const token = await getToken();
    const res   = await fetch(`${BASE_URL}/api-tracking-details/${trackingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data  = await res.json();

    if (!data.success) {
      return { success: false, error: data.message || 'Tracking failed' };
    }

    return {
      success:      true,
      status:       data.data?.status_name    || 'Unknown',
      deliveryDate: data.data?.delivery_date  || null,
      events:       data.data?.tracking_detail || [],
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { createSingleOrder, confirmSingleOrder, cancelShipment, createShipment, trackShipment };
