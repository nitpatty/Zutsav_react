/**
 * Shipping configuration — single source of truth for all courier/delivery partner lists
 * and status mappings. Add new providers here without changing any controller logic.
 */

const COURIER_PROVIDERS = [
  { value: 'DTDC',                 label: 'DTDC'                 },
  { value: 'Blue Dart',            label: 'Blue Dart'            },
  { value: 'Delhivery',            label: 'Delhivery'            },
  { value: 'XpressBees',           label: 'XpressBees'           },
  { value: 'Ecom Express',         label: 'Ecom Express'         },
  { value: 'India Post',           label: 'India Post'           },
  { value: 'Shadowfax',            label: 'Shadowfax'            },
  { value: 'Professional Courier', label: 'Professional Courier' },
  { value: 'Trackon',              label: 'Trackon'              },
  { value: 'Other',                label: 'Other'                },
];

const LOCAL_DELIVERY_PARTNERS = [
  { value: 'Porter',            label: 'Porter'            },
  { value: 'Borzo',             label: 'Borzo'             },
  { value: 'Dunzo',             label: 'Dunzo'             },
  { value: 'WeFast',            label: 'WeFast'            },
  { value: 'Internal Delivery', label: 'Internal Delivery' },
  { value: 'Other',             label: 'Other'             },
];

// Maps TekiPost's raw status strings to our internal shipmentStatus enum values
const TEKIPOST_STATUS_MAP = {
  'Booked':              'created',
  'Shipment Created':    'created',
  'Picked Up':           'picked_up',
  'In Transit':          'in_transit',
  'Out for Delivery':    'out_for_delivery',
  'Out For Delivery':    'out_for_delivery',
  'Delivered':           'delivered',
  'Failed Delivery':     'failed_delivery',
  'Delivery Failed':     'failed_delivery',
  'Undelivered':         'failed_delivery',
  'Cancelled':           'cancelled',
  'RTO Initiated':       'returned',
  'RTO In Transit':      'returned',
  'RTO Delivered':       'returned',
  'Returned':            'returned',
  'Return':              'returned',
};

// Human-readable labels for each shipment status
const SHIPMENT_STATUS_LABELS = {
  created:          'Shipment Created',
  picked_up:        'Picked Up',
  in_transit:       'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  failed_delivery:  'Failed Delivery',
  cancelled:        'Cancelled',
  returned:         'Returned',
};

// Which shipment statuses should automatically update the parent order status
const SHIPMENT_TO_ORDER_STATUS = {
  out_for_delivery: 'out_for_delivery',
  delivered:        'delivered',
  cancelled:        'cancelled',
};

// Ordered list of tracking timeline steps shown to users
const TRACKING_TIMELINE = [
  { key: 'created',          label: 'Shipment Created'  },
  { key: 'picked_up',        label: 'Picked Up'         },
  { key: 'in_transit',       label: 'In Transit'        },
  { key: 'out_for_delivery', label: 'Out for Delivery'  },
  { key: 'delivered',        label: 'Delivered'         },
];

module.exports = {
  COURIER_PROVIDERS,
  LOCAL_DELIVERY_PARTNERS,
  TEKIPOST_STATUS_MAP,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_TO_ORDER_STATUS,
  TRACKING_TIMELINE,
};
