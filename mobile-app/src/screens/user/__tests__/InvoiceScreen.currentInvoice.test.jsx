import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../../api/axios';
import { company } from '../../../config/company.config';
import InvoiceScreen from '../InvoiceScreen';
import { buildInvoiceView } from '../../../utils/bookingInvoice';
import { buildBookingInvoiceHtml } from '../../../utils/bookingInvoiceHtml';
import { booking, invoice, finalInvoice, responseBody } from '../../../utils/__tests__/invoiceFixtures';

// Day 30: the app showed an OLD invoice. Root cause: GET /api/invoices/booking/:id returns a booking's invoices oldest first (one per
// payment) and the screen opened index 0 — the advance — so after the final payment it still showed the advance invoice (balance due)
// instead of the final one. It now opens the current invoice (latest ACTIVE payment, by the persisted invoiceDate), keeps older ones
// selectable, ignores replies for a booking the user has left, and never keeps another booking's invoice on screen.
// Fixtures are synthetic. Official invoice content/HTML is asserted to be byte-identical to what the unchanged builders produce.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/invoice.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

const route = (id = 'bk1') => ({ params: { type: 'booking', id } });
const meta = (label) => screen.getByTestId(`invoice-meta-${label}`).props.children;
const hasInvoice = () => screen.queryByTestId('invoice-meta-Invoice No') !== null;
const sharedHtml = () => Print.printToFileAsync.mock.calls[Print.printToFileAsync.mock.calls.length - 1][0].html;
const share = async (count) => { fireEvent.press(screen.getByText('Share / Download PDF')); await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(count)); };
const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

// A second, different booking with its own invoices.
const bk2 = () => booking({ _id: 'bk2', bookingNumber: 'ZB-2026-0099', paymentStatus: 'FULLY_PAID' });
const bk2Invoice = (over = {}) => invoice({
  _id: 'inv-c', invoiceNumber: 'INV-2026-000201', bookingId: 'bk2', bookingNumber: 'ZB-2026-0099', paymentType: 'FULL',
  merchantTransactionId: 'MT-TEST-9', amountPaid: 2492, previouslyPaid: 0, outstandingAfter: 0, invoiceDate: '2026-03-08T08:00:00.000Z', ...over,
});

const serve = (map) => api.get.mockImplementation(async (url) => {
  const hit = Object.entries(map).find(([u]) => u === url);
  if (!hit) throw new Error(`unexpected GET ${url}`);
  const [, value] = hit;
  if (value instanceof Error) throw value;
  return { data: typeof value === 'function' ? value() : value };
});
const two = () => responseBody([invoice(), finalInvoice()], booking({ paymentStatus: 'FULLY_PAID' }));

beforeEach(() => { api.get.mockReset(); Print.printToFileAsync.mockClear(); Sharing.shareAsync.mockClear(); });

describe('which invoice is shown', () => {
  it('advance + final payment (API order oldest-first): the screen opens the FINAL-payment invoice, not the old advance', async () => {
    serve({ '/invoices/booking/bk1': two() });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000102');
    expect(screen.getAllByText('Final Payment').length).toBeGreaterThan(0);
    expect(screen.queryByText('Balance Due')).toBeNull();              // the advance invoice's outstanding balance is not what is shown
  });

  it('the screen does not depend on the order the API happens to use', async () => {
    serve({ '/invoices/booking/bk1': responseBody([finalInvoice(), invoice()], booking({ paymentStatus: 'FULLY_PAID' })) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000102');
  });

  it('is decided by the persisted invoice date, not the invoice-number string', async () => {
    const olderBigNumber = invoice({ _id: 'inv-x', invoiceNumber: 'INV-2026-000999', invoiceDate: '2026-03-01T00:00:00.000Z' });
    const newerSmallNumber = finalInvoice({ _id: 'inv-y', invoiceNumber: 'INV-2026-000010', invoiceDate: '2026-03-09T00:00:00.000Z' });
    serve({ '/invoices/booking/bk1': responseBody([olderBigNumber, newerSmallNumber]) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000010');
  });

  it('a cancelled newest invoice is listed (marked CANCELLED) but the latest ACTIVE one is the one shown', async () => {
    serve({ '/invoices/booking/bk1': responseBody([invoice(), finalInvoice({ status: 'cancelled' })]) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000101');
    expect(screen.getByLabelText('Invoice INV-2026-000102')).toBeTruthy();   // still selectable
    expect(screen.getAllByText(/CANCELLED/).length).toBeGreaterThan(0);
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000102'));
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000102'));
  });

  it('when every invoice is cancelled the latest one is shown, as a cancelled document', async () => {
    serve({ '/invoices/booking/bk1': responseBody([invoice({ status: 'cancelled' }), finalInvoice({ status: 'cancelled' })], booking({ status: 'cancelled' })) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000102');
    expect(screen.getAllByText(/CANCELLED/).length).toBeGreaterThan(0);
  });

  it('a booking with one invoice is unchanged (no selector, that invoice)', async () => {
    serve({ '/invoices/booking/bk1': responseBody([invoice()]) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByTestId('invoice-meta-Invoice No');
    expect(meta('Invoice No')).toBe('INV-2026-000101');
    expect(screen.queryByText(/invoices for this booking/)).toBeNull();
  });

  it('the older invoice stays selectable and keeps its own, unchanged figures', async () => {
    serve({ '/invoices/booking/bk1': two() });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000101'));
    expect(screen.getAllByText('Advance Payment').length).toBeGreaterThan(0);
    expect(screen.getByText('Balance Due')).toBeTruthy();
  });
});

describe('booking changes, stale replies, refresh and errors', () => {
  it('switching to another booking never shows the previous booking\'s invoice — not while loading, not after', async () => {
    let releaseSecond;
    api.get.mockImplementation((url) => {
      if (url === '/invoices/booking/bk1') return Promise.resolve({ data: two() });
      return new Promise((r) => { releaseSecond = () => r({ data: responseBody([bk2Invoice()], bk2()) }); });
    });
    const { rerender } = render(<InvoiceScreen route={route('bk1')} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000102');

    rerender(<InvoiceScreen route={route('bk2')} />);
    expect(hasInvoice()).toBe(false);                                   // loading: the first booking's invoice is gone, not left behind
    expect(screen.queryByText('INV-2026-000102')).toBeNull();
    await act(async () => { releaseSecond(); });
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000201'));
    expect(meta('Order No')).toBe('ZB-2026-0099');
    expect(screen.queryByText(/INV-2026-00010/)).toBeNull();
  });

  it('a late reply for the booking the user already left cannot overwrite the current one', async () => {
    let releaseFirst;
    api.get.mockImplementation((url) => {
      if (url === '/invoices/booking/bk1') return new Promise((r) => { releaseFirst = () => r({ data: two() }); });
      return Promise.resolve({ data: responseBody([bk2Invoice()], bk2()) });
    });
    const { rerender } = render(<InvoiceScreen route={route('bk1')} />);
    rerender(<InvoiceScreen route={route('bk2')} />);
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000201'));
    await act(async () => { releaseFirst(); });                           // bk1's slow reply arrives last
    expect(meta('Invoice No')).toBe('INV-2026-000201');
    expect(meta('Order No')).toBe('ZB-2026-0099');
    expect(screen.queryByText('2 invoices for this booking')).toBeNull();
  });

  it('a failed load for the new booking shows the error, not the previous booking\'s invoice', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/invoices/booking/bk1') return { data: two() };
      throw new Error('Network Error');
    });
    const { rerender } = render(<InvoiceScreen route={route('bk1')} />);
    await screen.findByText('2 invoices for this booking');
    rerender(<InvoiceScreen route={route('bk2')} />);
    expect(await screen.findByText('Could not load the invoice. Check your connection and try again.')).toBeTruthy();
    expect(hasInvoice()).toBe(false);
    expect(screen.queryByText('INV-2026-000102')).toBeNull();
  });

  it('reopening the screen after a new payment shows the newly created invoice as the current one', async () => {
    serve({ '/invoices/booking/bk1': responseBody([invoice()], booking()) });
    const first = render(<InvoiceScreen route={route()} />);
    await screen.findByTestId('invoice-meta-Invoice No');
    expect(meta('Invoice No')).toBe('INV-2026-000101');
    first.unmount();

    serve({ '/invoices/booking/bk1': two() });                           // the final payment has been made in the meantime
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000102');
  });

  it('a pick made on one booking does not carry over: going away and coming back shows the current invoice again, and a failed visit shows no invoice at all', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/invoices/booking/bk1') return { data: two() };
      throw new Error('Network Error');
    });
    const { rerender } = render(<InvoiceScreen route={route('bk1')} />);
    await screen.findByText('2 invoices for this booking');
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000101'));

    rerender(<InvoiceScreen route={route('bk2')} />);                      // this load fails
    expect(await screen.findByText('Could not load the invoice. Check your connection and try again.')).toBeTruthy();
    expect(hasInvoice()).toBe(false);                                      // the old invoice is not left on screen as if it were current

    rerender(<InvoiceScreen route={route('bk1')} />);                      // back to the first booking
    await screen.findByText('2 invoices for this booking');
    expect(meta('Invoice No')).toBe('INV-2026-000102');                    // the current invoice again, not the earlier pick
  });

  it('loading, empty, error and access-denied states stay distinguishable and never show an invoice', async () => {
    serve({ '/invoices/booking/bk1': responseBody([]) });
    const empty = render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('No invoice yet')).toBeTruthy();
    expect(hasInvoice()).toBe(false);
    empty.unmount();

    api.get.mockReset();
    api.get.mockRejectedValue({ response: { status: 404, data: {} } });
    const denied = render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('Invoice not found or you do not have access.')).toBeTruthy();
    expect(hasInvoice()).toBe(false);
    denied.unmount();

    api.get.mockReset();
    api.get.mockRejectedValue(new Error('Network Error'));
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText('Could not load the invoice. Check your connection and try again.')).toBeTruthy();
    expect(hasInvoice()).toBe(false);
  });
});

describe('display, download and share are the same invoice', () => {
  it('by default the PDF that is shared is the invoice on screen (the current one), built by the unchanged official builder', async () => {
    const body = two();
    serve({ '/invoices/booking/bk1': body });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    await share(1);
    expect(sharedHtml()).toContain('INV-2026-000102');
    expect(sharedHtml()).not.toContain('INV-2026-000101');
    // Byte-identical to what the (untouched) official builders produce for that same persisted invoice + booking.
    expect(sharedHtml()).toBe(buildBookingInvoiceHtml(buildInvoiceView(finalInvoice(), body.booking, company)));
  });

  it('after the user picks the older invoice the shared PDF is that invoice, byte-identical to its official rendering', async () => {
    const body = two();
    serve({ '/invoices/booking/bk1': body });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000101'));
    await share(1);
    expect(sharedHtml()).toContain('INV-2026-000101');
    expect(sharedHtml()).not.toContain('INV-2026-000102');
    expect(sharedHtml()).toBe(buildBookingInvoiceHtml(buildInvoiceView(invoice(), body.booking, company)));
  });

  it('after switching bookings the shared PDF is the new booking\'s invoice — a stale document cannot be shared', async () => {
    api.get.mockImplementation(async (url) => (url === '/invoices/booking/bk1' ? { data: two() } : { data: responseBody([bk2Invoice()], bk2()) }));
    const { rerender } = render(<InvoiceScreen route={route('bk1')} />);
    await screen.findByText('2 invoices for this booking');
    rerender(<InvoiceScreen route={route('bk2')} />);
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000201'));
    await share(1);
    expect(sharedHtml()).toContain('INV-2026-000201');
    expect(sharedHtml()).toContain('ZB-2026-0099');
    expect(sharedHtml()).not.toMatch(/INV-2026-00010[12]/);
    expect(sharedHtml()).not.toContain('ZB-2026-0042');
  });
});

describe('official data is untouched', () => {
  it('selecting never mutates or recalculates the persisted invoices and booking (deep-frozen fixtures would throw)', async () => {
    const body = deepFreeze(two());
    serve({ '/invoices/booking/bk1': body });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000101'));
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000102'));
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000102'));
    expect(body.invoices.map((i) => i.invoiceNumber)).toEqual(['INV-2026-000101', 'INV-2026-000102']);
    expect(body.invoices[1].amountPaid).toBe(1492);
    expect(body.invoices[1].outstandingAfter).toBe(0);
  });

  it('only the existing authenticated invoice endpoint is used, once per visit, and nothing is written', async () => {
    serve({ '/invoices/booking/bk1': two() });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));
    expect(api.get.mock.calls.map(([u]) => u)).toEqual(['/invoices/booking/bk1']);
  });
});
