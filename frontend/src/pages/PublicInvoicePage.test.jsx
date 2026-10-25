import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import PublicInvoicePage from './PublicInvoicePage';

// The shared API client builds an axios instance at import time; the page under
// test must NOT use it, so only the bare `get` matters here.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    create: () => ({ interceptors: { request: { use: () => {} }, response: { use: () => {} } }, get: jest.fn(), post: jest.fn() }),
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const TOKEN = 'T0kenForTestsOnly_abcdefghijklmnopqrstuvwxyz0123';

const manualPayload = (overrides = {}) => ({
  success: true,
  invoice: {
    invoiceNumber: 'MAN-2026-000042', source: 'manual', status: 'active', paymentType: 'PARTIAL',
    invoiceDate: '2026-03-01T10:00:00.000Z', amountPaid: 80, outstandingAfter: 120, grandTotal: 200,
    totalGST: 0, taxApplied: false, taxMode: 'none',
    gstBreakdown: { cgst: 0, sgst: 0, igst: 0, isInterstate: false },
    customerName: 'Priya Sharma', customerPhone: 'XXXXXX3210', customerEmail: 'p***@example.com',
    customerAddress: '12 Lotus Lane', customerState: 'Delhi',
    sellerSnapshot: { legalName: 'Zutsav Test Enterprises', gstin: '07AACCZ8054C1ZB', state: 'Delhi', stateCode: '07', address: 'New Delhi' },
    lineItems: [{ lineType: 'custom', name: 'Haldi', variantLabel: '50g', quantity: 2, unitPrice: 100, discount: 0, taxRate: 0, taxAmount: 0, lineTotal: 200 }],
    ...overrides,
  },
  payments: [{ kind: 'RECEIPT', method: 'UPI', amount: 80, receivedAt: '2026-03-01T10:05:00.000Z' }],
  paymentSummary: { netReceived: 80, outstanding: 120 },
});

const bookingPayload = (overrides = {}) => ({
  success: true,
  invoice: {
    invoiceNumber: 'INV-2026-000007', source: 'booking', status: 'active', paymentType: 'FULL',
    invoiceDate: '2026-03-02T10:00:00.000Z', amountPaid: 1118, outstandingAfter: 0, grandTotal: 1118,
    poojaAmount: 1000, platformFee: 100, platformGST: 18, kitAmount: 0, kitGST: 0, urgentSurcharge: 0, totalGST: 18,
    gstBreakdown: { cgst: 0, sgst: 0, igst: 18, isInterstate: true },
    ...overrides,
  },
  booking: {
    bookingNumber: 'BK-1001', status: 'paid', paymentStatus: 'FULLY_PAID', amountPaid: 1118, grandTotal: 1118, amount: 1118,
    scheduledDate: '2026-04-01T00:00:00.000Z', scheduledTime: '09:00', language: 'Hindi',
    poojaId: { name: 'Satyanarayan Katha' }, kitIds: [], withKit: false,
    userDetails: { name: 'Rahul Verma', phone: 'XXXXXX2233', address: '5 Temple Road', city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001' },
  },
});

let container; let root;

async function renderAt(path = `/share/invoice/${TOKEN}`) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/share/invoice/:token" element={<PublicInvoicePage />} /></Routes>
      </MemoryRouter>
    );
  });
  // let the mocked request resolve and the state update flush
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PublicInvoicePage', () => {
  it('shows a manual invoice without any login, using an unauthenticated request', async () => {
    axios.get.mockResolvedValue({ data: manualPayload() });
    await renderAt();

    expect(axios.get).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = axios.get.mock.calls[0];
    expect(calledUrl).toMatch(new RegExp(`/public/invoices/${TOKEN}$`));
    expect(options.withCredentials).toBe(false);
    // The API's CORS policy only allows Content-Type and Authorization request headers.
    // Any other custom header makes the browser's preflight fail (regression: a stray
    // Cache-Control header made every share link look "invalid" in real browsers).
    const sent = Object.keys(options.headers || {}).map((h) => h.toLowerCase());
    expect(sent.filter((h) => !['content-type', 'accept'].includes(h))).toEqual([]);

    const text = container.textContent;
    expect(text).toContain('MAN-2026-000042');
    expect(text).toContain('Priya Sharma');
    expect(text).toContain('Haldi');
    expect(text).toContain('Partially Paid');
    expect(text).toContain('₹120'); // outstanding balance
    expect(text).toContain('XXXXXX3210');
  });

  it('is read-only and free of admin chrome and internal columns', async () => {
    axios.get.mockResolvedValue({ data: manualPayload() });
    await renderAt();
    const text = container.textContent;
    expect(text).not.toContain('Manual Billing');       // admin back-navigation
    expect(text).not.toContain('Recorded By');
    expect(text).not.toContain('Reference');
    expect(text).not.toContain('fallback company registration');
    expect(container.querySelectorAll('input, textarea, select, form')).toHaveLength(0);
    // The only action available is print.
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent.trim());
    expect(buttons).toEqual(['Print / Save PDF']);
  });

  it('keeps the token out of storage, the title and the DOM', async () => {
    axios.get.mockResolvedValue({ data: manualPayload() });
    await renderAt();
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(TOKEN);
    expect(document.title).not.toContain(TOKEN);
    expect(container.innerHTML).not.toContain(TOKEN);
    expect(document.querySelector('meta[name="referrer"]').content).toBe('no-referrer');
    expect(document.querySelector('meta[name="robots"]').content).toMatch(/noindex/);
  });

  it('marks a cancelled invoice clearly instead of presenting it as payable', async () => {
    axios.get.mockResolvedValue({ data: manualPayload({ status: 'cancelled', cancelledAt: '2026-03-05T00:00:00.000Z' }) });
    await renderAt();
    expect(container.textContent).toContain('Cancelled');
    expect(container.textContent).not.toContain('Payment Pending');
  });

  it('renders a shared booking invoice from the customer-safe payload', async () => {
    axios.get.mockResolvedValue({ data: bookingPayload() });
    await renderAt();
    const text = container.textContent;
    expect(text).toContain('INV-2026-000007');
    expect(text).toContain('Satyanarayan Katha');
    expect(text).toContain('Rahul Verma');
    expect(text).toContain('Paid in Full');
    expect(text).not.toContain('My Bookings');           // account navigation
    expect(text).not.toContain('Txn');                    // gateway transaction details
    expect(text).not.toContain('Merchant');
  });

  it('shows a cancelled booking invoice as cancelled', async () => {
    const payload = bookingPayload({ status: 'cancelled' });
    payload.booking.status = 'cancelled';
    axios.get.mockResolvedValue({ data: payload });
    await renderAt();
    expect(container.textContent).toContain('Cancelled');
  });

  it('shows one generic message for invalid, revoked or unknown links', async () => {
    axios.get.mockRejectedValue({ response: { status: 404, data: { message: 'whatever' } } });
    await renderAt();
    expect(container.textContent).toContain('This invoice link is invalid or is no longer available.');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

  });

  it('does not call a connectivity or CORS failure an invalid link', async () => {
    axios.get.mockRejectedValue(new Error('Network Error')); // no err.response
    await renderAt();
    expect(container.textContent).toContain('check your connection');
    expect(container.textContent).not.toContain('invalid');
  });

  it('reports server errors separately from bad links', async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } });
    await renderAt();
    expect(container.textContent).toContain('temporarily unavailable');
  });

  it('tells a throttled visitor to retry later', async () => {
    axios.get.mockRejectedValue({ response: { status: 429 } });
    await renderAt();
    expect(container.textContent).toContain('Too many requests');
  });
});
