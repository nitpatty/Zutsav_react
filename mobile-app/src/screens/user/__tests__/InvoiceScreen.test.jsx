import fs from 'fs';
import path from 'path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../../api/axios';
import { formatCurrency, fmtInvoiceDate } from '../../../utils/helpers';
import { company } from '../../../config/company.config';
import InvoiceScreen from '../InvoiceScreen';
import { booking, invoice, finalInvoice, responseBody } from '../../../utils/__tests__/invoiceFixtures';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/invoice.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

const route = (over = {}) => ({ params: { type: 'booking', id: 'bk1', ...over } });
const mockInvoices = (body) => api.get.mockImplementation(async (url) => {
  if (url === '/invoices/booking/bk1') return { data: body };
  throw new Error(`unexpected GET ${url}`);
});
// value text of a row in the invoice header (Invoice No, Order No, Issue Date, …)
const meta = (label) => screen.getByTestId(`invoice-meta-${label}`).props.children;
const sharedHtml = () => Print.printToFileAsync.mock.calls[Print.printToFileAsync.mock.calls.length - 1][0].html;

beforeEach(() => {
  api.get.mockReset();
  Print.printToFileAsync.mockClear();
  Sharing.shareAsync.mockClear();
});

describe('InvoiceScreen — official persisted booking invoice (F-02)', () => {
  it('requests the persisted-invoice API (not the legacy { booking, paymentLedger } endpoint)', async () => {
    mockInvoices(responseBody());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/invoices/booking/bk1');
  });

  it('shows the official invoice number, issue date, order number, seller and stored amounts', async () => {
    mockInvoices(responseBody());
    render(<InvoiceScreen route={route()} />);

    await screen.findByText('INV-2026-000101');
    expect(meta('Invoice No')).toBe('INV-2026-000101');
    expect(meta('Issue Date')).toBe(fmtInvoiceDate('2026-03-02T09:15:00.000Z'));
    expect(meta('Order No')).toBe('ZB-2026-0042');                            // a different identifier
    expect(screen.getAllByText('Advance Payment').length).toBeGreaterThan(0);
    expect(screen.getByText(`GSTIN: ${company.gstin}`)).toBeTruthy();         // config seller (booking invoices have no snapshot)
    expect(screen.getAllByText('Griha Pravesh').length).toBeGreaterThan(0);   // invoice snapshot (line item + details), not "CURRENT-CATALOG Pooja Name"
    expect(screen.queryByText(/CURRENT-CATALOG/)).toBeNull();
    expect(screen.getByText('Asha Test')).toBeTruthy();                       // customer snapshot
    expect(screen.queryByText('BOOKING-TIME Name')).toBeNull();
    expect(meta('Place of Supply')).toBe('KARNATAKA');                        // place of supply from the snapshot
    expect(screen.getAllByText(formatCurrency(2492)).length).toBeGreaterThan(0); // grand total
    expect(screen.getAllByText(formatCurrency(1492)).length).toBeGreaterThan(0); // balance due
    expect(screen.getByText('Urgent Booking Surcharge')).toBeTruthy();
    expect(screen.getByText('Total Tax Collected')).toBeTruthy();
    expect(screen.getAllByText(formatCurrency(36)).length).toBeGreaterThan(0);   // stored CGST / SGST
  });

  it('never uses the booking number as the invoice number', async () => {
    mockInvoices(responseBody());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    expect(meta('Invoice No')).toBe('INV-2026-000101');
    expect(meta('Invoice No')).not.toBe('ZB-2026-0042');
    expect(meta('Order No')).toBe('ZB-2026-0042');
  });

  it('shows the seller snapshot instead of the static company when the invoice carries one', async () => {
    const snap = { legalName: 'Snapshot Legal Pvt Ltd', gstin: '29SNAPSHOT0000Z1', pan: 'SNAPSHOT00', address: '9 Snapshot Rd', state: 'Karnataka' };
    mockInvoices(responseBody([invoice({ sellerSnapshot: snap })]));
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('Snapshot Legal Pvt Ltd')).toBeTruthy();
    expect(screen.getByText('GSTIN: 29SNAPSHOT0000Z1')).toBeTruthy();
    expect(screen.queryByText(`GSTIN: ${company.gstin}`)).toBeNull();
  });

  it('shows a single invoice without the selector or payment-history sections', async () => {
    mockInvoices(responseBody());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    expect(screen.queryByText(/invoices for this booking/)).toBeNull();
    expect(screen.queryByText(/Payment History for Order/)).toBeNull();
  });

  it('handles a cancelled invoice (status shown, no balance due, refund note)', async () => {
    mockInvoices(responseBody([invoice({ status: 'cancelled' })], booking({ status: 'cancelled', refund: { status: 'pending' } })));
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(meta('Invoice Status')).toBe('CANCELLED');
    expect(screen.getByText('Payment: Refund Pending')).toBeTruthy();
    expect(screen.queryByText('Balance Due')).toBeNull();
  });

  it('renders a sparse invoice (no optional fields, no booking details) without crashing', async () => {
    mockInvoices({ success: true, booking: null, invoices: [{ invoiceNumber: 'INV-2026-000999', paymentType: 'FULL', amountPaid: 500, grandTotal: 500 }] });
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('INV-2026-000999')).toBeTruthy();
    expect(screen.getAllByText('Status Unavailable').length).toBeGreaterThan(0);
    expect(screen.queryByText('Total Tax Collected')).toBeNull();
  });
});

describe('InvoiceScreen — multiple invoices for one booking', () => {
  const two = () => responseBody([invoice(), finalInvoice()], booking({ paymentStatus: 'FULLY_PAID' }));

  // Day 30: the API returns a booking's invoices OLDEST first (one per payment). The screen used to open index 0 — the advance — so
  // after the final payment it still showed the old invoice. It now opens the current one (see utils/invoiceSelection.js).
  it('lists every official invoice, defaults to the CURRENT one (the latest payment\'s), keeps the older one selectable, and shows the payment history', async () => {
    mockInvoices(two());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(screen.getByLabelText('Invoice INV-2026-000102').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Invoice INV-2026-000101').props.accessibilityState.selected).toBe(false);
    expect(meta('Invoice No')).toBe('INV-2026-000102');
    expect(screen.getByText('Payment History for Order ZB-2026-0042')).toBeTruthy();
    expect(screen.getByText('INV-2026-000101 · Txn: MT-TEST-1')).toBeTruthy();
    expect(screen.getByText('INV-2026-000102 · Txn: MT-TEST-2')).toBeTruthy();
  });

  it('switching invoices shows that invoice\'s own number, type and payment figures', async () => {
    mockInvoices(two());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000102');          // the current (final-payment) invoice
    expect(screen.getAllByText('Final Payment').length).toBeGreaterThan(0);
    expect(screen.getByText('Previously Paid')).toBeTruthy();
    expect(screen.queryByText('Balance Due')).toBeNull();

    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));   // the older, advance invoice is still there to inspect

    await waitFor(() => expect(screen.getByLabelText('Invoice INV-2026-000101').props.accessibilityState.selected).toBe(true));
    expect(meta('Invoice No')).toBe('INV-2026-000101');
    expect(screen.getAllByText('Advance Payment').length).toBeGreaterThan(0);
    expect(screen.getByText('Balance Due')).toBeTruthy();
    expect(screen.queryByText('Previously Paid')).toBeNull();
  });

  it('Share / Download PDF operates on the SELECTED invoice only', async () => {
    mockInvoices(two());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');

    fireEvent.press(screen.getByText('Share / Download PDF'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(sharedHtml()).toContain('INV-2026-000102');          // by default the PDF is the one on screen: the current invoice
    expect(sharedHtml()).not.toContain('INV-2026-000101');

    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));
    fireEvent.press(await screen.findByText('Share / Download PDF'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
    expect(sharedHtml()).toContain('INV-2026-000101');
    expect(sharedHtml()).not.toContain('INV-2026-000102');
    expect(Sharing.shareAsync).toHaveBeenLastCalledWith('file:///tmp/invoice.pdf', { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });
});

describe('InvoiceScreen — empty, error and retry states', () => {
  it('a booking without a persisted invoice shows an empty state — nothing is invented from the booking', async () => {
    mockInvoices(responseBody([]));
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('No invoice yet')).toBeTruthy();
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
    expect(screen.queryByText('ZB-2026-0042')).toBeNull();      // booking number is NOT shown as an invoice
    expect(screen.queryByText('Share / Download PDF')).toBeNull();
  });

  it('the empty state can be refreshed and then shows the invoice once it exists', async () => {
    mockInvoices(responseBody([]));
    render(<InvoiceScreen route={route()} />);
    fireEvent.press(await screen.findByText('Refresh'));
    mockInvoices(responseBody());
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    // (the second fetch used the first mock's empty body or the new one; re-press to be deterministic)
    fireEvent.press(await screen.findByText('Refresh'));
    expect(await screen.findByText('INV-2026-000101')).toBeTruthy();
  });

  it('a network failure shows an error with Retry, and Retry recovers', async () => {
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('Could not load the invoice. Check your connection and try again.')).toBeTruthy();

    mockInvoices(responseBody());
    fireEvent.press(screen.getByText('Retry'));

    expect(await screen.findByText('INV-2026-000101')).toBeTruthy();
    expect(screen.queryByText(/Could not load the invoice/)).toBeNull();
  });

  it.each([403, 404])('HTTP %i is reported as not found / no access (and exposes nothing)', async (status) => {
    api.get.mockRejectedValue({ response: { status, data: { message: 'Access denied' } } });
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('Invoice not found or you do not have access.')).toBeTruthy();
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
  });
});

describe('InvoiceScreen — marketplace order invoices are untouched (F-03 is a separate task)', () => {
  it('still loads /marketplace/orders/:id/invoice for type=order', async () => {
    api.get.mockResolvedValue({ data: { order: { orderNumber: 'ORD-1', items: [{ name: 'Diya', quantity: 2, price: 10 }], totalAmount: 20 } } });
    render(<InvoiceScreen route={route({ type: 'order', id: 'o1' })} />);
    expect(await screen.findByText('Order #ORD-1')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/marketplace/orders/o1/invoice');
  });
});

// ── Authorization / document-type guards (static, read-only scans of the mobile source) ──────────────
const SRC = path.resolve(__dirname, '../../..');
const listSource = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === '__tests__' ? [] : listSource(p);
  return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
});

describe('document types and access paths stay distinct', () => {
  it('no mobile code calls the legacy /bookings/:id/invoice endpoint (the website never does either)', () => {
    // string literals only (a quote right before "/bookings/…/invoice"), so explanatory comments don't count
    const offenders = listSource(SRC).filter((f) => /['"`]\/bookings\/[^'"`]*\/invoice/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('the only invoice endpoint used for bookings is the authenticated /invoices/booking/:id', () => {
    const src = fs.readFileSync(path.join(SRC, 'screens/user/InvoiceScreen.jsx'), 'utf8');
    expect(src).toContain('/invoices/booking/${id}');
    expect(src).not.toMatch(/share\/invoice|public/i); // no public/share-link path is introduced
  });

  it('no Pandit screen opens the customer tax invoice (Pandits have no invoice entry point)', () => {
    const panditDir = path.join(SRC, 'screens/pandit');
    const offenders = listSource(panditDir).filter((f) => /navigate\(\s*['"]Invoice['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the invoice entry points are exactly: customer booking/order detail and the admin booking/refund screens', () => {
    const callers = listSource(SRC)
      .filter((f) => /navigate\(\s*['"]Invoice['"]/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
      .sort();
    expect(callers).toEqual([
      'screens/admin/AdminBookingDetailScreen.jsx',
      'screens/admin/AdminRefundDetailScreen.jsx',
      'screens/user/BookingDetailScreen.jsx',
      'screens/user/OrderDetailScreen.jsx',
    ]);
  });
});
