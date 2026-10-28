// Synthetic fixtures shaped like the real documents (backend/src/models/Invoice.js,
// GET /api/invoices/booking/:bookingId). No real people, numbers or payment data.
// Arithmetic: 2000 pooja + 100 fee + 18 fee-GST + 300 kit + 54 kit-GST + 20 urgent = 2492.

export const COMPANY = {
  name: 'Test Seller Co', gstin: '00TESTCO0000T0Z0', pan: 'TESTCO0000T',
  addr1: '1 Config Street', addr2: 'Config City - 000001',
  email: 'support@example.invalid', phone: '+00-0000000000', web: 'www.example.invalid',
};

export const booking = (over = {}) => ({
  _id: 'bk1', bookingNumber: 'ZB-2026-0042', status: 'pandit_accepted', paymentStatus: 'PARTIALLY_PAID',
  amountPaid: 1000, remainingAmount: 1492, scheduledDate: '2026-03-10T00:00:00.000Z', scheduledTime: '10:30',
  language: 'Hindi', withKit: true, isUrgent: true, bookingType: 'urgent', urgentHikeType: 'percent', urgentHikePercent: 1,
  poojaId: { _id: 'pj1', name: 'CURRENT-CATALOG Pooja Name' },
  panditId: { _id: 'pd1', name: 'Pandit Test' },
  kitId: { _id: 'k1', name: 'Griha Kit', discountPrice: 999 }, // today's catalog price differs from the invoiced 300
  kitIds: [],
  userDetails: { name: 'BOOKING-TIME Name', phone: '9000000000', email: 'live@example.invalid', address: 'Live Addr', city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001' },
  ...over,
});

export const invoice = (over = {}) => ({
  _id: 'inv-a', invoiceNumber: 'INV-2026-000101', source: 'booking', status: 'active',
  bookingId: 'bk1', bookingNumber: 'ZB-2026-0042', poojaName: 'Griha Pravesh',
  scheduledDate: '2026-03-10T00:00:00.000Z', scheduledTime: '10:30',
  customerName: 'Asha Test', customerPhone: '9111111111', customerEmail: 'asha@example.invalid',
  customerAddress: '12 Snapshot Lane', customerCity: 'Bengaluru', customerState: 'Karnataka', customerPincode: '560001',
  invoiceDate: '2026-03-02T09:15:00.000Z',
  paymentType: 'PARTIAL', paymentGateway: 'phonepe', merchantTransactionId: 'MT-TEST-1', gatewayTransactionId: 'GT-TEST-1',
  amountPaid: 1000, previouslyPaid: 0, outstandingAfter: 1492,
  grandTotal: 2492, poojaAmount: 2000, kitAmount: 300, kitGST: 54, platformFee: 100, platformGST: 18, urgentSurcharge: 20,
  totalGST: 72, gstBreakdown: { cgst: 36, sgst: 36, igst: 0, isInterstate: false },
  isLegacy: false, ...over,
});

export const finalInvoice = (over = {}) => invoice({
  _id: 'inv-b', invoiceNumber: 'INV-2026-000102', invoiceDate: '2026-03-05T11:00:00.000Z', paymentType: 'REMAINING',
  merchantTransactionId: 'MT-TEST-2', gatewayTransactionId: 'GT-TEST-2',
  amountPaid: 1492, previouslyPaid: 1000, outstandingAfter: 0, ...over,
});

export const responseBody = (invoices = [invoice()], b = booking()) => ({ success: true, booking: b, invoices });
