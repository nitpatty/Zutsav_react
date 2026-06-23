/**
 * Tekipost Courier Integration
 * API Base: https://app.tekipost.com
 * Auth: POST /api-login → JWT Bearer token (expires 24h)
 * Create shipment: POST /api-b2c-quick-shipment
 * Track shipment:  GET  /api-tracking-details/{tracking_number}
 */

const BASE_URL = 'https://app.tekipost.com';

let _tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const email    = process.env.TEKIPOST_EMAIL    || 'zutsav.official@gmail.com';
  const password = process.env.TEKIPOST_PASSWORD || 'Ch@ng3m3';

  const res  = await fetch(`${BASE_URL}/api-login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  const data = await res.json();

  if (!data.success || !data.data?.token) {
    throw new Error(`Tekipost login failed: ${data.message || 'unknown error'}`);
  }

  const expiresIn = data.data.expires_in || 86400;
  _tokenCache = {
    token:     data.data.token,
    expiresAt: Date.now() + (expiresIn - 300) * 1000, // refresh 5 min early
  };
  return _tokenCache.token;
}

/**
 * Create a B2C quick shipment on Tekipost.
 * Returns { success, trackingId, courier, labelUrl, freightCharges, error }
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
  items          = [],
}) {
  try {
    const token           = await getToken();
    const senderAddressId = Number(process.env.TEKIPOST_SENDER_ADDRESS_ID || 1);

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
      order_type:           0,   // prepaid
      product_quantity:     productDetails.reduce((s, p) => s + p.product_quantity, 0),
      cod_amount:           0,
      physical_weight:      weight,
      product_length:       length,
      product_width:        width,
      product_height:       height,
      order_value:          orderValue,
      productdetatis:       productDetails,
      sender_address_id:    senderAddressId,
      return_address_same_as_pickup_address: 1,
    };

    const res  = await fetch(`${BASE_URL}/api-b2c-quick-shipment`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.status !== 1 && !data.success) {
      return { success: false, error: data.message || 'Shipment creation failed' };
    }

    return {
      success:        true,
      trackingId:     String(data.tracking_number || data.data?.awb_number || ''),
      courier:        data.courier_name || 'Tekipost',
      labelUrl:       data.label_url    || '',
      freightCharges: data.freight_charges || '',
    };
  } catch (err) {
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
