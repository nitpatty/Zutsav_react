import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { company } from '../../../config/company.config';
import { buildInvoiceView } from '../../../utils/bookingInvoice';
import { buildBookingInvoiceHtml, INVOICE_PAGE } from '../../../utils/bookingInvoiceHtml';
import { loadInvoiceLogo } from '../../../utils/invoiceLogo';
import InvoiceScreen from '../InvoiceScreen';
import { booking, invoice, finalInvoice, responseBody } from '../../../utils/__tests__/invoiceFixtures';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/invoice.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
// Only the network-facing loader is replaced (deterministic, no network); the validators stay real.
jest.mock('../../../utils/invoiceLogo', () => ({ ...jest.requireActual('../../../utils/invoiceLogo'), loadInvoiceLogo: jest.fn() }));

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const route = (over = {}) => ({ params: { type: 'booking', id: 'bk1', ...over } });
const lastPrint = () => Print.printToFileAsync.mock.calls[Print.printToFileAsync.mock.calls.length - 1][0];
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const share = async (n = 1) => {
  fireEvent.press(await screen.findByText('Share / Download PDF'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(n));
};

beforeEach(() => {
  api.get.mockReset();
  loadInvoiceLogo.mockReset();
  loadInvoiceLogo.mockResolvedValue(LOGO);
  Print.printToFileAsync.mockClear();
  Sharing.shareAsync.mockClear();
  Toast.show.mockClear();
});

describe('the shared booking invoice PDF carries the platform logo', () => {
  it('the logo is embedded in the PDF HTML, byte-identical to the official builder given the same logo', async () => {
    const body = responseBody([invoice()], booking());
    api.get.mockResolvedValue({ data: body });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    await share();
    expect(lastPrint().html).toContain(`<img src="${LOGO}"`);
    expect(lastPrint().html).toBe(buildBookingInvoiceHtml(buildInvoiceView(invoice(), body.booking, company), { logoDataUri: LOGO }));
    expect(lastPrint().width).toBe(INVOICE_PAGE.width);
    expect(lastPrint().height).toBe(INVOICE_PAGE.height);
  });

  it('is requested once when the invoice screen opens, not from the invoice API, and never for a marketplace order', async () => {
    api.get.mockResolvedValue({ data: responseBody([invoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    expect(loadInvoiceLogo).toHaveBeenCalledTimes(1);
    await share();
    expect(loadInvoiceLogo).toHaveBeenCalledTimes(1);                                  // sharing reuses the request, it does not start another
    expect(api.get.mock.calls.map(([u]) => u)).toEqual(['/invoices/booking/bk1']);     // the logo is not fetched through the authenticated client

    loadInvoiceLogo.mockClear();
    api.get.mockResolvedValue({ data: { order: { orderNumber: 'ORD-1', items: [{ name: 'Diya', quantity: 2, price: 10 }], totalAmount: 20 } } });
    render(<InvoiceScreen route={route({ type: 'order', id: 'o1' })} />);
    await screen.findByText('Order #ORD-1');
    expect(loadInvoiceLogo).not.toHaveBeenCalled();
    await share(2);
    expect(lastPrint().html).not.toContain('<img');
    expect(Object.keys(lastPrint())).toEqual(['html']);
  });

  it('sharing waits for a slow logo and then includes it', async () => {
    let resolveLogo;
    loadInvoiceLogo.mockReturnValue(new Promise((r) => { resolveLogo = r; }));
    api.get.mockResolvedValue({ data: responseBody([invoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    fireEvent.press(screen.getByText('Share / Download PDF'));
    await act(async () => { await Promise.resolve(); });
    expect(Print.printToFileAsync).not.toHaveBeenCalled();                              // still waiting for the image
    await act(async () => { resolveLogo(LOGO); });
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(lastPrint().html).toContain('<img');
  });

  it('switching the selected invoice keeps the logo and changes only the invoice content', async () => {
    api.get.mockResolvedValue({ data: responseBody([invoice(), finalInvoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    await share(1);
    const first = lastPrint().html;
    expect(first).toContain('INV-2026-000102');
    expect(first).toContain('<img');
    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));
    await share(2);
    const second = lastPrint().html;
    expect(second).toContain('INV-2026-000101');
    expect(second).not.toContain('INV-2026-000102');
    expect(second).toContain('<img');
    expect(loadInvoiceLogo).toHaveBeenCalledTimes(1);
  });

  it('a different booking never receives the previous booking\'s invoice, with or without the logo', async () => {
    const other = invoice({ _id: 'inv-z', invoiceNumber: 'INV-2026-000777', bookingNumber: 'ZB-OTHER', merchantTransactionId: 'MT-OTHER', gatewayTransactionId: 'GT-OTHER' });
    api.get.mockImplementation(async (url) => ({
      data: url === '/invoices/booking/bk1' ? responseBody([invoice(), finalInvoice()], booking()) : responseBody([other], booking({ _id: 'bk2', bookingNumber: 'ZB-OTHER' })),
    }));
    const { rerender } = render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    rerender(<InvoiceScreen route={route({ id: 'bk2' })} />);
    await screen.findByText('INV-2026-000777');
    await share();
    expect(lastPrint().html).toContain('INV-2026-000777');
    expect(/MT-TEST|GT-TEST|INV-2026-00010/.test(lastPrint().html)).toBe(false);
  });
});

describe('when the logo is unavailable the invoice is still generated and shared', () => {
  it('a null result gives the existing text-only header, with the same invoice content and an unchanged share', async () => {
    loadInvoiceLogo.mockResolvedValue(null);
    const body = responseBody([invoice()], booking());
    api.get.mockResolvedValue({ data: body });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    await share();
    expect(lastPrint().html).not.toContain('<img');
    expect(lastPrint().html).toContain('ZUTSAV PVT. LTD.');
    expect(lastPrint().html).toBe(buildBookingInvoiceHtml(buildInvoiceView(invoice(), body.booking, company)));
    expect(Sharing.shareAsync).toHaveBeenLastCalledWith('file:///tmp/invoice.pdf', { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    expect(Toast.show).not.toHaveBeenCalled();                                          // no error shown to the customer
  });

  it('an untrusted/invalid logo value that somehow reaches the screen is not embedded', async () => {
    loadInvoiceLogo.mockResolvedValue('https://evil.example/logo.png');
    api.get.mockResolvedValue({ data: responseBody([invoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    await share();
    expect(lastPrint().html).not.toContain('<img');
    expect(lastPrint().html).not.toContain('evil.example');
  });

  it('sharing works when the real loader ran offline (the test environment blocks the network)', async () => {
    const { loadInvoiceLogo: real } = jest.requireActual('../../../utils/invoiceLogo');
    loadInvoiceLogo.mockImplementation(real);
    api.get.mockResolvedValue({ data: responseBody([invoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    await share();
    expect(lastPrint().html).not.toContain('<img');
    expect(Toast.show).not.toHaveBeenCalled();
  });
});

describe('the logo does not depend on the UI language', () => {
  it('the shared PDF HTML is byte-identical in English, Hindi and Tamil for the same invoice and logo', async () => {
    api.get.mockResolvedValue({ data: responseBody([invoice()], booking()) });
    const { unmount } = render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    await share(1);
    const english = lastPrint().html;
    unmount();

    for (const code of ['hi', 'ta']) {
      await setLang(code);
      const view = render(<InvoiceScreen route={route()} />);
      await screen.findByText('INV-2026-000101');
      fireEvent.press(screen.getByText(getTranslator(code)('invoice.share')));          // the control is translated; the document must not be
      await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(code === 'hi' ? 2 : 3));
      expect(lastPrint().html).toBe(english);
      expect(/[ऀ-෿]/.test(lastPrint().html)).toBe(false);
      view.unmount();
    }
    expect(english).toContain('<img');
  });
});
