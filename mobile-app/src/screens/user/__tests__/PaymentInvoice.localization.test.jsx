import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { formatCurrency, fmtInvoiceDate } from '../../../utils/helpers';
import { company } from '../../../config/company.config';
import { buildInvoiceView } from '../../../utils/bookingInvoice';
import { buildBookingInvoiceHtml } from '../../../utils/bookingInvoiceHtml';
import { loadPendingPayments, resetPaymentRecoveryState } from '../../../utils/paymentRecovery';
import { booking, invoice, finalInvoice, responseBody } from '../../../utils/__tests__/invoiceFixtures';
import PaymentVerifyScreen from '../PaymentVerifyScreen';
import InvoiceScreen from '../InvoiceScreen';

// F-08 Phase 5: payment verification text and the invoice screen's controls. The verdict still comes only from the server
// verification flow, the endpoints/transaction families are unchanged, and the official invoice (screen document and
// generated PDF/HTML) is untouched — only the surrounding chrome is translated.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ title }) => <Text>{`HEADER:${title}`}</Text> };
});
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/invoice.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

const hi = getTranslator('hi');
const ta = getTranslator('ta');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

// ── Payment verification ─────────────────────────────────────────────────────
const CART_TXN = 'ZUT_CART_1700000000000_abc123';
const RETRY_TXN = 'ZUT_CART_RETRY_1700000000000_abc123_deadbeef';
const LEGACY_TXN = 'ZOM_1700000000000_abc123';
const nav = () => ({ replace: jest.fn(), navigate: jest.fn() });
const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
const tick = (ms) => act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
const mount = async (params, navigation = nav()) => {
  render(<PaymentVerifyScreen navigation={navigation} route={{ params }} />);
  await flush();
  return navigation;
};
const order = { type: 'marketplace', orderId: 'ord1' };

describe('PaymentVerifyScreen localization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    api.get.mockReset(); api.post.mockReset(); Toast.show.mockClear();
    resetPaymentRecoveryState();
    useAuthStore.setState({ user: { _id: 'u1', role: 'user' } });
  });
  afterEach(() => { jest.useRealTimers(); useAuthStore.setState({ user: null }); });

  it('English is unchanged for the pending, success and failed states', async () => {
    api.get.mockResolvedValueOnce({ data: { success: false, state: 'PENDING' } }).mockResolvedValue({ data: { success: true } });
    await mount({ merchantTransactionId: CART_TXN, ...order });
    expect(screen.getByText('Verifying Payment')).toBeTruthy();
    expect(screen.getByText('Please wait while we confirm your payment…')).toBeTruthy();
    expect(screen.getByText('(1/20 checks)')).toBeTruthy();       // the first PENDING answer counts as one check
    await tick(3000);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
    expect(screen.getByText('Payment successful!')).toBeTruthy();
    expect(screen.getByText('View Order')).toBeTruthy();
  });

  it('Hindi pending: translated and never presented as success or failure', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    await mount({ merchantTransactionId: CART_TXN, ...order });
    expect(screen.getByText(hi('payment.verifyingTitle'))).toBeTruthy();
    expect(screen.getByText(hi('payment.verifyingSub'))).toBeTruthy();
    expect(screen.getByText(hi('payment.checks', { polls: 1, max: 20 }))).toBeTruthy();
    expect(screen.queryByText(hi('payment.successTitle'))).toBeNull();
    expect(screen.queryByText(hi('orders.statusPaymentFailed'))).toBeNull();
  });

  it('Hindi success is shown only when the server says paid; the continue action keeps its route', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1', status: 'paid' } } });
    const navigation = await mount({ merchantTransactionId: CART_TXN, ...order });
    expect(screen.getAllByText(hi('payment.successTitle')).length).toBeGreaterThan(0);   // title and message read the same in Hindi
    fireEvent.press(screen.getByText(hi('payment.viewOrder')));
    expect(navigation.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
  });

  it('Hindi booking success continues to the booking, not an order', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: true } });
    const navigation = await mount({ merchantTransactionId: 'ZUT_B_1', bookingId: 'b1', type: 'booking' });
    fireEvent.press(screen.getByText(hi('payment.viewBooking')));
    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'b1' });
  });

  it('a terminal gateway failure: translated title and hint, the server code is shown as received, no booking-style retry for orders', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_DECLINED', state: 'FAILED' } });
    const navigation = await mount({ merchantTransactionId: CART_TXN, ...order });
    expect(screen.getByText(hi('orders.statusPaymentFailed'))).toBeTruthy();
    expect(screen.getByText('PAYMENT_DECLINED')).toBeTruthy();
    expect(screen.getByText(hi('payment.orderSavedRetry'))).toBeTruthy();
    expect(screen.queryByText(hi('orders.retryPayment'))).toBeNull();
    fireEvent.press(screen.getByText(hi('payment.viewOrder')));
    expect(navigation.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
  });

  it('a failure without a code uses the translated generic wording', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: false, state: 'FAILED' } });
    await mount({ merchantTransactionId: LEGACY_TXN, ...order });
    expect(screen.getByText('FAILED')).toBeTruthy();                       // state string from the server is the code, as before
  });

  it('a payment the order could not accept: translated, never shown as success, tells the customer not to pay again', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_NEEDS_REVIEW' } });
    await mount({ merchantTransactionId: CART_TXN, ...order });
    expect(screen.getByText(hi('payment.needsReview'))).toBeTruthy();
    expect(screen.queryByText(hi('payment.successTitle'))).toBeNull();
    expect(screen.queryByText(hi('payment.orderSavedRetry'))).toBeNull();  // not the "retry payment" hint (it would invite a second charge)
  });

  it('the 60-second window ends as translated "Still Confirming" — not a failure — and Check Again verifies again', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    await mount({ merchantTransactionId: CART_TXN, ...order });
    await tick(3000 * 20);
    expect(screen.getByText(hi('payment.stillConfirming'))).toBeTruthy();
    expect(screen.getByText(hi('payment.timeoutMsg'))).toBeTruthy();
    expect(screen.queryByText(hi('orders.statusPaymentFailed'))).toBeNull();
    expect(screen.queryByText(hi('payment.successTitle'))).toBeNull();
    const before = api.get.mock.calls.length;
    api.get.mockResolvedValue({ data: { success: true } });
    fireEvent.press(screen.getByText(hi('payment.checkAgain')));
    await flush();
    expect(api.get.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getAllByText(hi('payment.successTitle')).length).toBeGreaterThan(0);
  });

  it('a missing transaction id fails immediately with the translated reason and calls no endpoint', async () => {
    await setLang('hi');
    await mount({ orderId: 'ord1', type: 'marketplace' });
    expect(screen.getByText(hi('orders.statusPaymentFailed'))).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('transaction families keep their endpoints in any language', async () => {
    await setLang('hi');
    const cases = [
      [{ merchantTransactionId: CART_TXN, ...order }, `/checkout/verify/${CART_TXN}`],
      [{ merchantTransactionId: RETRY_TXN, ...order }, `/checkout/verify/${RETRY_TXN}`],
      [{ merchantTransactionId: LEGACY_TXN, ...order }, `/marketplace/orders/verify-phonepe/${LEGACY_TXN}`],
      [{ merchantTransactionId: 'ZUT_B_1', bookingId: 'b1', type: 'booking' }, '/bookings/verify-phonepe/ZUT_B_1'],
      [{ merchantTransactionId: 'ZUT_R_1', bookingId: 'b1', type: 'booking-remaining' }, '/bookings/verify-remaining/ZUT_R_1'],
    ];
    for (const [params, url] of cases) {
      api.get.mockReset();
      api.get.mockResolvedValue({ data: { success: true } });
      const { unmount } = render(<PaymentVerifyScreen navigation={nav()} route={{ params }} />);
      await flush();
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith(url);
      unmount();
      resetPaymentRecoveryState();
    }
  });

  it('a failed booking payment keeps Retry on the SAME booking; "still in flight" reuses the pending transaction', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { success: false, state: 'FAILED', code: 'DECLINED' } });
    await mount({ merchantTransactionId: 'ZUT_B_1', bookingId: 'b1', type: 'booking' });
    expect(screen.getByText(hi('payment.bookingSavedRetry'))).toBeTruthy();
    api.post.mockResolvedValue({ data: { alreadyInFlight: true, merchantTransactionId: 'ZUT_B_1' } });
    fireEvent.press(screen.getByText(hi('orders.retryPayment')));
    await flush();
    expect(api.post).toHaveBeenCalledWith('/bookings/b1/retry-payment');
    expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: hi('payment.stillBeingConfirmed') });
  });

  it('switching language while verifying does NOT restart verification, polls again or drop the pending payment record', async () => {
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    await mount({ merchantTransactionId: CART_TXN, ...order });
    const calls = api.get.mock.calls.length;
    expect((await loadPendingPayments('u1')).map((p) => p.merchantTransactionId)).toEqual([CART_TXN]);

    await setLang('hi');
    await flush();
    expect(screen.getByText(hi('payment.verifyingTitle'))).toBeTruthy();       // text follows the language …
    expect(api.get.mock.calls.length).toBe(calls);                              // … without a new request or a restarted effect
    expect(screen.getByText(hi('payment.checks', { polls: 1, max: 20 }))).toBeTruthy();
    expect((await loadPendingPayments('u1')).map((p) => p.merchantTransactionId)).toEqual([CART_TXN]);

    await tick(3000);
    expect(api.get.mock.calls.length).toBe(calls + 1);                          // normal polling continues on its own schedule
  });

  it('already-rendered messages follow a language change (timeout message, success text)', async () => {
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    await mount({ merchantTransactionId: CART_TXN, ...order });
    await tick(3000 * 20);
    expect(screen.getByText(getTranslator('en')('payment.timeoutMsg'))).toBeTruthy();
    await setLang('ta');
    expect(screen.getByText(ta('payment.timeoutMsg'))).toBeTruthy();
    expect(screen.getByText(ta('payment.stillConfirming'))).toBeTruthy();
  });
});

// ── Invoice screen ───────────────────────────────────────────────────────────
const route = (over = {}) => ({ params: { type: 'booking', id: 'bk1', ...over } });
const mockInvoices = (body) => api.get.mockImplementation(async (url) => {
  if (url === '/invoices/booking/bk1') return { data: body };
  throw new Error(`unexpected GET ${url}`);
});
const meta = (label) => screen.getByTestId(`invoice-meta-${label}`).props.children;
const sharedHtml = () => Print.printToFileAsync.mock.calls[Print.printToFileAsync.mock.calls.length - 1][0].html;
const two = () => responseBody([invoice(), finalInvoice()], booking({ paymentStatus: 'FULLY_PAID' }));

describe('InvoiceScreen localization (controls only)', () => {
  beforeEach(() => {
    api.get.mockReset(); Toast.show.mockClear();
    Print.printToFileAsync.mockClear(); Sharing.shareAsync.mockClear(); Sharing.isAvailableAsync.mockResolvedValue(true);
  });

  it('English controls are unchanged', async () => {
    mockInvoices(two());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    expect(screen.getByText('HEADER:Invoice')).toBeTruthy();
    expect(screen.getByText('Share / Download PDF')).toBeTruthy();
    expect(screen.getByLabelText('Invoice INV-2026-000101')).toBeTruthy();
  });

  it('Hindi: title, selector, share control and accessibility labels are translated; selection and sharing still work on the selected invoice', async () => {
    await setLang('hi');
    mockInvoices(two());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText(hi('invoice.count', { n: 2 }));
    expect(screen.getByText(`HEADER:${hi('invoice.title')}`)).toBeTruthy();
    // Day 30: the screen opens the CURRENT (latest payment's) invoice; the older one is picked explicitly.
    expect(screen.getByLabelText(hi('invoice.a11yInvoice', { number: 'INV-2026-000102' })).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText(hi('invoice.a11yInvoice', { number: 'INV-2026-000101' })));
    await waitFor(() => expect(screen.getByLabelText(hi('invoice.a11yInvoice', { number: 'INV-2026-000101' })).props.accessibilityState.selected).toBe(true));
    expect(meta('Invoice No')).toBe('INV-2026-000101');
    fireEvent.press(screen.getByText(hi('invoice.share')));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(sharedHtml()).toContain('INV-2026-000101');
    expect(sharedHtml()).not.toContain('INV-2026-000102');
    expect(Sharing.shareAsync).toHaveBeenLastCalledWith('file:///tmp/invoice.pdf', { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  it('the official invoice on screen is NOT translated: numbers, dates, tax labels, seller and amounts are the same in Hindi', async () => {
    mockInvoices(responseBody());
    const english = render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    const enMeta = ['Invoice No', 'Order No', 'Issue Date', 'Place of Supply'].map(meta);
    english.unmount();

    await setLang('hi');
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    expect(['Invoice No', 'Order No', 'Issue Date', 'Place of Supply'].map(meta)).toEqual(enMeta);
    expect(meta('Issue Date')).toBe(fmtInvoiceDate('2026-03-02T09:15:00.000Z'));
    expect(screen.getByText('TAX INVOICE')).toBeTruthy();
    expect(screen.getByText('Total Tax Collected')).toBeTruthy();
    expect(screen.getByText(`GSTIN: ${company.gstin}`)).toBeTruthy();
    expect(screen.getAllByText(formatCurrency(2492)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatCurrency(1492)).length).toBeGreaterThan(0);
    expect(screen.getByText('Urgent Booking Surcharge')).toBeTruthy();
  });

  it('empty, error and retry states are translated; Retry/Refresh still reload', async () => {
    await setLang('hi');
    mockInvoices(responseBody([]));
    const first = render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText(hi('invoice.none'))).toBeTruthy();
    expect(screen.getByText(hi('invoice.noneBody'))).toBeTruthy();
    mockInvoices(responseBody());
    fireEvent.press(screen.getByText(hi('invoice.refresh')));
    expect(await screen.findByText('INV-2026-000101')).toBeTruthy();
    first.unmount();

    api.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText(hi('invoice.loadFailed'))).toBeTruthy();
    mockInvoices(responseBody());
    fireEvent.press(screen.getByText(hi('common.retry')));
    expect(await screen.findByText('INV-2026-000101')).toBeTruthy();
  });

  it.each([403, 404])('HTTP %i is reported in the translated "not found / no access" wording and exposes nothing', async (status) => {
    await setLang('hi');
    api.get.mockRejectedValue({ response: { status, data: { message: 'Access denied' } } });
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText(hi('invoice.notFoundAccess'))).toBeTruthy();
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
  });

  it('sharing problems are reported in Hindi', async () => {
    await setLang('hi');
    mockInvoices(responseBody());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    Sharing.isAvailableAsync.mockResolvedValueOnce(false);
    fireEvent.press(screen.getByText(hi('invoice.share')));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('invoice.noSharing') }));
    Print.printToFileAsync.mockRejectedValueOnce(new Error('print failed'));
    fireEvent.press(screen.getByText(hi('invoice.share')));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('invoice.pdfFailed') }));
  });

  it('switching language does not reload the invoice (no new request), keeps the selected invoice and updates the chrome', async () => {
    mockInvoices(two());
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000102'));
    await waitFor(() => expect(meta('Invoice No')).toBe('INV-2026-000102'));
    expect(api.get).toHaveBeenCalledTimes(1);
    await setLang('hi');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByText(hi('invoice.count', { n: 2 }))).toBeTruthy();
    expect(meta('Invoice No')).toBe('INV-2026-000102');
  });

  it('a load error stays correct after a language change (the text is re-derived, not stored)', async () => {
    api.get.mockRejectedValue({ response: { status: 404, data: {} } });
    render(<InvoiceScreen route={route()} />);
    expect(await screen.findByText(getTranslator('en')('invoice.notFoundAccess'))).toBeTruthy();
    await setLang('hi');
    expect(screen.getByText(hi('invoice.notFoundAccess'))).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe('the official invoice artefact is unaffected by this batch', () => {
  const html = () => buildBookingInvoiceHtml(buildInvoiceView(invoice(), booking(), company));

  it('the generated invoice HTML is byte-identical whatever the UI language', async () => {
    const english = html();
    await setLang('hi');
    const hindi = html();
    await setLang('ta');
    const tamil = html();
    expect(hindi).toBe(english);
    expect(tamil).toBe(english);
    expect(english).toContain('INV-2026-000101');
    expect(english).toContain(`${company.gstin}`);
    expect(/[ऀ-෿]/.test(english)).toBe(false);                    // no Indic-script UI text leaked into the document
  });

  it('the invoice builders and the document HTML do not depend on the localization layer or on any new dictionary key', () => {
    ['bookingInvoiceHtml.js', 'bookingInvoice.js'].forEach((f) => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'utils', f), 'utf8');
      expect(/i18n|useTranslation|getTranslator/.test(src)).toBe(false);
    });
  });

  it('the invoice screen translates only the chrome keys: the document sections are still hard-coded invoice text', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'InvoiceScreen.jsx'), 'utf8');
    const used = [...src.matchAll(/t\('(invoice\.[A-Za-z0-9]+|common\.retry)'/g)].map((m) => m[1]).sort();
    expect([...new Set(used)]).toEqual(['common.retry', 'invoice.a11yInvoice', 'invoice.count', 'invoice.loadFailed', 'invoice.noSharing', 'invoice.none', 'invoice.noneBody', 'invoice.notFoundAccess', 'invoice.pdfFailed', 'invoice.preparing', 'invoice.refresh', 'invoice.share', 'invoice.title', 'invoice.unavailable']);
    ['TAX INVOICE', 'Tax Summary', 'Amount in Words', 'Place of Supply', 'GRAND TOTAL'].forEach((s) => expect(src).toContain(s));
  });
});
