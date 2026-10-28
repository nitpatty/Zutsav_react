import { formatStatus } from './helpers';

// Display labels for order and shipment statuses. The status itself is an API constant and is never changed — only
// the text shown for a KNOWN status is translated; an unknown status falls back to the humanized value as before.
const ORDER_KEYS = {
  pending_payment:  'orders.statusPendingPayment',
  paid:             'orders.statusPaid',
  confirmed:        'orders.statusConfirmed',
  packed:           'orders.statusPacked',
  shipped:          'orders.statusShipped',
  out_for_delivery: 'orders.statusOutForDelivery',
  delivered:        'orders.statusDelivered',
  cancelled:        'orders.statusCancelled',
  refunded:         'orders.statusRefunded',
  payment_failed:   'orders.statusPaymentFailed',
};

const SHIPMENT_KEYS = {
  pending_courier_selection: 'orders.shipPendingCourier',
  created:          'orders.shipCreated',
  picked_up:        'orders.shipPickedUp',
  in_transit:       'orders.shipInTransit',
  out_for_delivery: 'orders.statusOutForDelivery',
  delivered:        'orders.statusDelivered',
  failed_delivery:  'orders.shipFailedDelivery',
  cancelled:        'orders.statusCancelled',
  returned:         'orders.shipReturned',
};

const has = (map, status) => typeof status === 'string' && Object.prototype.hasOwnProperty.call(map, status);

export const orderStatusLabel = (status, t) => (has(ORDER_KEYS, status) ? t(ORDER_KEYS[status]) : formatStatus(status));
export const shipmentStatusLabel = (status, t) => (has(SHIPMENT_KEYS, status) ? t(SHIPMENT_KEYS[status]) : formatStatus(status));
