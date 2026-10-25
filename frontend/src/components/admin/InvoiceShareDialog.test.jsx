import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import API from '../../api/axios';
import InvoiceShareDialog from './InvoiceShareDialog';

jest.mock('react-hot-toast', () => {
  const t = jest.fn();
  t.success = jest.fn();
  t.error = jest.fn();
  return { __esModule: true, default: t };
});
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const INVOICE = { _id: 'inv1', invoiceNumber: 'MAN-2026-000001', customerName: 'Priya', status: 'active' };
const PATH = '/share/invoice/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const active = (path = PATH) => ({ status: 'active', linkAvailable: true, path });

let container; let root; const onClose = jest.fn();

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const buttonByText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };

async function open(invoice = INVOICE) {
  await act(async () => { root.render(<InvoiceShareDialog invoice={invoice} onClose={onClose} />); });
  await flush();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('InvoiceShareDialog', () => {
  it('first open issues a link through the admin API and shows it with Copy and Share', async () => {
    API.get.mockResolvedValue({ data: { eligible: true, share: null } });
    API.post.mockResolvedValue({ data: { share: active() } });
    await open();

    expect(API.get).toHaveBeenCalledWith('/admin/invoices/inv1/share');
    expect(API.post).toHaveBeenCalledWith('/admin/invoices/inv1/share');
    const input = container.querySelector('input[aria-label="Shareable invoice link"]');
    expect(input.value).toBe(`${window.location.origin}${PATH}`);
    expect(input.readOnly).toBe(true);
    expect(buttonByText('Copy link')).toBeTruthy();
    expect(buttonByText('Share')).toBeTruthy();
    expect(container.textContent).toContain('no login required');
  });

  it('reopening reuses the existing link without creating a new one', async () => {
    API.get.mockResolvedValue({ data: { eligible: true, share: active() } });
    await open();
    expect(API.post).not.toHaveBeenCalled();
    expect(container.querySelector('input[aria-label="Shareable invoice link"]').value).toContain(PATH);
  });

  it('copies the link to the clipboard and reports success', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    API.get.mockResolvedValue({ data: { eligible: true, share: active() } });
    await open();
    await click(buttonByText('Copy link'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${PATH}`);
    const toast = require('react-hot-toast').default;
    expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard');
    // The link itself is never put in a toast.
    expect(JSON.stringify(toast.success.mock.calls)).not.toContain('ABCDEFGHIJKL');
  });

  it('explains why an ineligible invoice cannot be shared and offers no link', async () => {
    API.get.mockResolvedValue({ data: { eligible: false, reason: 'Archived invoices cannot be shared.', share: null } });
    await open({ ...INVOICE, status: 'archived' });
    expect(container.textContent).toContain('Archived invoices cannot be shared.');
    expect(container.querySelector('input[aria-label="Shareable invoice link"]')).toBeNull();
    expect(API.post).not.toHaveBeenCalled();
  });

  it('shows an error with a retry when the API fails', async () => {
    API.get.mockRejectedValueOnce({ response: { data: { message: 'Invoice not found' } } });
    await open();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Invoice not found');

    API.get.mockResolvedValue({ data: { eligible: true, share: active() } });
    await click(buttonByText('Try again'));
    expect(container.querySelector('input[aria-label="Shareable invoice link"]')).not.toBeNull();
  });

  it('revoke asks for confirmation, then hides the link and offers a new one', async () => {
    API.get.mockResolvedValue({ data: { eligible: true, share: active() } });
    API.post.mockImplementation((url) => Promise.resolve({
      data: { share: url.endsWith('/revoke') ? { status: 'revoked' } : active('/share/invoice/NEWTOKENNEWTOKENNEWTOKENNEWTOKENNEWTOKEN123') },
    }));
    await open();

    await click(buttonByText('Revoke'));
    expect(container.textContent).toContain('immediately lose access');
    expect(API.post).not.toHaveBeenCalled(); // nothing happens until confirmed
    await click(buttonByText('Revoke link'));
    expect(API.post).toHaveBeenCalledWith('/admin/invoices/inv1/share/revoke');
    expect(container.querySelector('input[aria-label="Shareable invoice link"]')).toBeNull();
    expect(container.textContent).toContain('revoked');

    await click(buttonByText('Generate new link'));
    expect(API.post).toHaveBeenLastCalledWith('/admin/invoices/inv1/share');
    expect(container.querySelector('input[aria-label="Shareable invoice link"]').value).toContain('NEWTOKEN');
  });

  it('regenerate is confirmed and swaps in the new link', async () => {
    API.get.mockResolvedValue({ data: { eligible: true, share: active() } });
    API.post.mockResolvedValue({ data: { share: active('/share/invoice/REGENREGENREGENREGENREGENREGENREGENREGEN1234') } });
    await open();
    await click(buttonByText('Regenerate'));
    expect(container.textContent).toContain('stops working immediately');
    await click(buttonByText('Regenerate link'));
    expect(API.post).toHaveBeenCalledWith('/admin/invoices/inv1/share/regenerate');
    expect(container.querySelector('input[aria-label="Shareable invoice link"]').value).toContain('REGEN');
  });

  it('tells the admin when a cancelled invoice is shared, and when a link cannot be redisplayed', async () => {
    API.get.mockResolvedValue({ data: { eligible: true, share: active() } });
    await open({ ...INVOICE, status: 'cancelled' });
    expect(container.textContent).toContain('clearly marked as cancelled');

    act(() => root.unmount());
    root = createRoot(container);
    API.get.mockResolvedValue({ data: { eligible: true, share: { status: 'active', linkAvailable: false } } });
    await open();
    expect(container.textContent).toContain('can’t be displayed again');
    expect(container.querySelector('input[aria-label="Shareable invoice link"]')).toBeNull();
    expect(buttonByText('Regenerate')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    API.get.mockResolvedValue({ data: { eligible: true, share: active() } });
    await open();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalled();
  });
});
