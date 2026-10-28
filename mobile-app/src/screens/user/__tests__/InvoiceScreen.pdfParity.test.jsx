import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../../api/axios';
import InvoiceScreen from '../InvoiceScreen';
import { INVOICE_PAGE } from '../../../utils/bookingInvoiceHtml';
import { booking, invoice, finalInvoice, responseBody } from '../../../utils/__tests__/invoiceFixtures';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/invoice.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

const route = (over = {}) => ({ params: { type: 'booking', id: 'bk1', ...over } });
const lastPrint = () => Print.printToFileAsync.mock.calls[Print.printToFileAsync.mock.calls.length - 1][0];

beforeEach(() => {
  api.get.mockReset();
  Print.printToFileAsync.mockClear();
  Sharing.shareAsync.mockClear();
});

const sharePdf = async (n = 1) => {
  fireEvent.press(await screen.findByText('Share / Download PDF'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(n));
};

describe('shared booking invoice PDF — page, fields and identity', () => {
  it('is generated as A4 portrait, from the HTML of the invoice on screen', async () => {
    api.get.mockResolvedValue({ data: responseBody([invoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    await sharePdf();
    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(lastPrint()).toEqual({ html: expect.any(String), width: INVOICE_PAGE.width, height: INVOICE_PAGE.height });
    expect(INVOICE_PAGE).toEqual({ width: 595, height: 842 });
  });

  it('carries the new payment and booking fields of THAT invoice (gateway, both transaction ids, language, kit, Pandit)', async () => {
    api.get.mockResolvedValue({ data: responseBody([invoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('INV-2026-000101');
    await sharePdf();
    const { html } = lastPrint();
    ['PHONEPE', 'MT-TEST-1', 'GT-TEST-1', 'Hindi', 'Griha Kit', 'Pandit Test', 'Booking Details', 'Tax Summary'].forEach((s) => expect(html).toContain(s));
  });

  it('switching the selected invoice switches the PDF content, including its payment identifiers and amounts', async () => {
    api.get.mockResolvedValue({ data: responseBody([invoice(), finalInvoice()], booking()) });
    render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');

    await sharePdf(1);                                                   // default: the current (final) invoice
    expect(lastPrint().html).toContain('INV-2026-000102');
    expect(lastPrint().html).toContain('MT-TEST-2');
    expect(lastPrint().html).toContain('Previously Paid');
    expect(lastPrint().html).not.toContain('MT-TEST-1');

    fireEvent.press(screen.getByLabelText('Invoice INV-2026-000101'));   // pick the advance invoice
    await sharePdf(2);
    expect(lastPrint().html).toContain('INV-2026-000101');
    expect(lastPrint().html).toContain('MT-TEST-1');
    expect(lastPrint().html).toContain('Balance Due');
    expect(lastPrint().html).not.toContain('MT-TEST-2');
    expect(lastPrint().html).not.toContain('INV-2026-000102');
  });

  it('after switching bookings no identifier of the previous booking can reach the PDF', async () => {
    const other = invoice({ _id: 'inv-z', invoiceNumber: 'INV-2026-000777', bookingNumber: 'ZB-OTHER', merchantTransactionId: 'MT-OTHER', gatewayTransactionId: 'GT-OTHER' });
    api.get.mockImplementation(async (url) => ({
      data: url === '/invoices/booking/bk1' ? responseBody([invoice(), finalInvoice()], booking()) : responseBody([other], booking({ _id: 'bk2', bookingNumber: 'ZB-OTHER' })),
    }));
    const { rerender } = render(<InvoiceScreen route={route()} />);
    await screen.findByText('2 invoices for this booking');
    rerender(<InvoiceScreen route={route({ id: 'bk2' })} />);
    await screen.findByText('INV-2026-000777');
    await sharePdf();
    const { html } = lastPrint();
    expect(html).toContain('INV-2026-000777');
    expect(html).toContain('GT-OTHER');
    expect(/MT-TEST|GT-TEST|INV-2026-00010/.test(html)).toBe(false);
  });
});

describe('marketplace order invoice is unchanged by the booking-invoice work', () => {
  it('keeps its own HTML and the default page (no A4 options)', async () => {
    api.get.mockResolvedValue({ data: { order: { orderNumber: 'ORD-1', items: [{ name: 'Diya', quantity: 2, price: 10 }], totalAmount: 20 } } });
    render(<InvoiceScreen route={route({ type: 'order', id: 'o1' })} />);
    await screen.findByText('Order #ORD-1');
    await sharePdf();
    expect(Object.keys(lastPrint())).toEqual(['html']);
    expect(lastPrint().html).toContain('Order #ORD-1');
    expect(lastPrint().html).not.toContain('Booking Details');
  });
});
