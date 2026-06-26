/**
 * Tekipost Courier Integration
 * API Base: https://app.tekipost.com
 * Auth: POST /api-login → JWT Bearer token (expires 24h)
 * Create shipment: POST /api-b2c-quick-shipment
 * Track shipment:  GET  /api-tracking-details/{tracking_number}
 *
 * Required env vars:
 *   TEKIPOST_EMAIL              — account email
 *   TEKIPOST_PASSWORD           — account password
 *   TEKIPOST_SENDER_ADDRESS_ID  — sender address ID from TekiPost dashboard (Pickup Addresses)
 *   TEKIPOST_LOGISTICS_ID       — logistics partner ID from TekiPost Logistics Settings;
 *                                  set to 0 (or leave unset) to let TekiPost auto-select courier
 *                                  based on the priority order you configured in the dashboard
 */

const BASE_URL = 'https://app.tekipost.com';

let _tokenCache = { token: null, expiresAt: 0 };

// ─── friendly error map ─────────────────────────────────────────────────────
const TEKIPOST_ERROR_MAP = [
  { match: /wallet.*balance.*not.*enough/i,      friendly: 'TekiPost wallet balance is insufficient. Please recharge your TekiPost account wallet before creating a shipment.' },
  { match: /insufficient.*balance/i,             friendly: 'TekiPost wallet balance is insufficient. Please recharge your TekiPost account wallet before creating a shipment.' },
  { match: /no logistics defined/i,              friendly: 'No logistics partner is configured for your TekiPost account. Check Logistics Settings in the dashboard.' },
  { match: /no courier.*available/i,             friendly: 'No courier service is available for this pickup/delivery pincode combination.' },
  { match: /sender.*address.*not found/i,        friendly: 'Pickup address not found. Verify TEKIPOST_SENDER_ADDRESS_ID matches an address in your TekiPost dashboard.' },
  { match: /sender.*address.*id/i,               friendly: 'Invalid pickup address ID. Check TEKIPOST_SENDER_ADDRESS_ID env var.' },
  { match: /pickup.*pincode.*not.*serviceable/i, friendly: 'Pickup pincode is not serviceable by any active courier.' },
  { match: /delivery.*pincode.*not.*serviceable/i, friendly: 'Delivery pincode is not serviceable. The customer\'s area may not be covered.' },
  { match: /pincode.*not.*serviceable/i,         friendly: 'Pincode not serviceable by any active courier.' },
  { match: /invalid.*pincode/i,                  friendly: 'Invalid pincode in the delivery address.' },
  { match: /weight.*required/i,                  friendly: 'Package weight is required.' },
  { match: /invalid.*weight/i,                   friendly: 'Invalid package weight. Must be a positive number.' },
  { match: /account.*configuration/i,            friendly: 'TekiPost account configuration is incomplete. Ensure rates and courier partners are activated.' },
  { match: /invalid.*token/i,                    friendly: 'TekiPost authentication failed. Credentials may have changed — check TEKIPOST_EMAIL and TEKIPOST_PASSWORD.' },
  { match: /unauthorized/i,                      friendly: 'TekiPost API returned unauthorized. Verify account credentials in env vars.' },
  { match: /duplicate.*order/i,                  friendly: 'This order number was already submitted to TekiPost.' },
  { match: /mobile.*no.*required/i,              friendly: 'Customer mobile number is required.' },
  { match: /invalid.*mobile/i,                   friendly: 'Invalid customer mobile number.' },
  { match: /consignee.*name.*required/i,         friendly: 'Customer name (consignee name) is required.' },
  { match: /receiver.*address.*required/i,       friendly: 'Delivery address is required.' },
  { match: /validation failed/i,                 friendly: 'TekiPost validation failed. See backend logs for the full error details.' },
  { match: /service unavailable/i,               friendly: 'TekiPost service is temporarily unavailable. Please try again in a few minutes.' },
];

function _parseTekipostError(data, httpStatus) {
  // Extract field-level validation errors first
  const fieldErrors = (data?.errors || [])
    .map((e) => {
      const field = e.field ? `${e.field}: ` : '';
      return `${field}${e.message}`;
    })
    .join('; ');

  const rawMessage = data?.message || '';
  const combined   = [rawMessage, fieldErrors].filter(Boolean).join(' — ');

  // Try to match a friendly message
  for (const rule of TEKIPOST_ERROR_MAP) {
    if (rule.match.test(combined) || rule.match.test(rawMessage) || rule.match.test(fieldErrors)) {
      return fieldErrors ? `${rule.friendly} (${fieldErrors})` : rule.friendly;
    }
  }

  // HTTP-level fallback
  if (httpStatus === 503) return `TekiPost service unavailable (HTTP 503). ${combined}`;
  if (httpStatus === 401) return `TekiPost authentication failed. Check credentials. ${combined}`;
  if (httpStatus === 400) return `TekiPost rejected the request: ${combined || 'Validation error — see backend logs.'}`;

  return combined || 'TekiPost shipment creation failed. Check backend logs for details.';
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

/**
 * Create a B2C quick shipment on TekiPost.
 *
 * Returns:
 *   success=true  → { success, trackingId, awbNumber, courier, courierCode, labelUrl, trackingUrl,
 *                     freightCharges, pickupDate, estimatedDelivery, tekipostOrderNo, tekipostResponse }
 *   success=false → { success, error, tekipostResponse }
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
    const token           = await getToken();
    const senderAddressId = Number(process.env.TEKIPOST_SENDER_ADDRESS_ID || 1);
    const rawLogisticsId  = Number(process.env.TEKIPOST_LOGISTICS_ID || 0);

    const productDetails = items.length > 0
      ? items.map((item, i) => ({
          sku_number:       i + 1,
          product_name:     item.name  || 'Pooja Samagri',
          product_quantity: item.qty   || 1,
          product_value:    item.value || Math.round(orderValue / items.length),
        }))
      : [{ sku_number: 1, product_name: 'Pooja Samagri Kit', product_quantity: 1, product_value: orderValue }];

    const payload = {
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

    // Only include logistics_id when explicitly configured (> 0).
    // Omitting it lets TekiPost auto-select the courier based on the
    // priority order configured in the dashboard (the recommended setup
    // once courier priorities are configured on the TekiPost side).
    if (rawLogisticsId > 0) {
      payload.logistics_id = rawLogisticsId;
    }

    const sendPayload = async (p) => {
      const url = `${BASE_URL}/api-b2c-quick-shipment`;
      console.log('[TekiPost] POST', url, '| order:', p.customer_order_no,
        '| weight:', p.physical_weight, 'kg | pincode:', p.receiver_pincode,
        '| logistics_id:', p.logistics_id ?? '(auto)', '| sender_address_id:', p.sender_address_id);

      const r = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify(p),
      });
      const d = await r.json();

      if (!d.success && d.status !== 1) {
        // Full debug dump on failure so admin can diagnose
        console.error('[TekiPost] FAILED — HTTP', r.status);
        console.error('[TekiPost] Request payload:', JSON.stringify(p, null, 2));
        console.error('[TekiPost] Response body:  ', JSON.stringify(d, null, 2));
      } else {
        console.log(`[TekiPost] SUCCESS (HTTP ${r.status}) — tracking:`, d.tracking_number || d.data?.awb_number);
      }

      return { d, httpStatus: r.status };
    };

    let { d: data, httpStatus } = await sendPayload(payload);

    // Retry with a unique suffix if TekiPost reports a duplicate order number.
    const isDuplicate = !data.success && data.status !== 1 &&
      (data.errors || []).some((e) => e.code === 'E_DUPLICATE_REF' && e.field === 'customer_order_no');

    if (isDuplicate) {
      const suffix       = Date.now().toString().slice(-6);
      const retryOrderNo = `${bookingNumber}-${suffix}`;
      console.log(`[TekiPost] Duplicate order_no — retrying as: ${retryOrderNo}`);
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

    // Extract all useful fields from the success response
    const awb          = String(data.tracking_number || data.data?.awb_number || data.awb_number || '');
    const courierCode  = data.courier_code  || data.data?.courier_code  || '';
    const courierName  = data.courier_name  || data.data?.courier_name  || 'TekiPost';
    const labelUrl     = data.label_url     || data.data?.label_url     || '';
    const trackingUrl  = data.tracking_url  || data.data?.tracking_url  || '';
    const pickupDate   = data.pickup_date   || data.data?.pickup_date   || null;
    const estDelivery  = data.expected_delivery_date || data.data?.expected_delivery_date || null;
    const freight      = data.freight_charges || data.data?.freight_charges || '';

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
    console.error('[TekiPost] createShipment exception:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch latest tracking status for a shipment.
 * Returns { success, status, deliveryDate, events, error }
 */
async function trackShipment(trackingId) {
  try {
    const token = await getToken();
    const res   = await fetch(`${BASE_URL}/api-tracking-details/${trackingId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
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

module.exports = { createShipment, trackShipment };
