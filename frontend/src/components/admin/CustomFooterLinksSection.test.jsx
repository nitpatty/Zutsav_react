import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import CustomFooterLinksSection from './CustomFooterLinksSection';

const mockReload = jest.fn();
jest.mock('react-hot-toast', () => { const t = jest.fn(); t.success = jest.fn(); t.error = jest.fn(); return { __esModule: true, default: t }; });
jest.mock('../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ reload: mockReload }) }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const id = (c) => c.repeat(16);
const URL_LINK = { id: id('a'), label: 'Help Centre', linkType: 'url', url: 'https://help.example.com/', enabled: true, order: 0, document: null, publicPath: '' };
const DOC_LINK = {
  id: id('b'), label: 'Cookie Policy', linkType: 'document', url: '', enabled: false, order: 1,
  document: { originalName: 'cookies.pdf', mimeType: 'application/pdf', size: 2048 }, publicPath: `/legal/link/${id('b')}`,
};

let container; let root;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const q = (sel) => container.querySelector(sel);
const btn = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const type = async (el, value) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const pickFile = async (input, file) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
};
const submit = async () => { await act(async () => { q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };

async function open(links = [URL_LINK, DOC_LINK]) {
  API.get.mockResolvedValue({ data: { links, max: 20 } });
  await act(async () => { root.render(<CustomFooterLinksSection />); });
  await flush();
}

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

describe('CustomFooterLinksSection', () => {
  it('lists links with name, type, destination and shown/hidden state', async () => {
    await open();
    const text = container.textContent;
    expect(text).toContain('Custom Footer Links');
    expect(text).toContain('Help Centre');
    expect(text).toContain('https://help.example.com/');
    expect(text).toContain('Cookie Policy');
    expect(text).toContain('cookies.pdf');
    expect(text).toContain('2 KB');
    expect(text).toContain('Shown');
    expect(text).toContain('Hidden');
    expect(q('a[aria-label="Open Cookie Policy"]').getAttribute('href')).toBe(`/legal/link/${id('b')}`);
    expect(q('a[aria-label="Open Help Centre"]').getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows an empty state, and an error state with retry', async () => {
    await open([]);
    expect(container.textContent).toContain('No custom footer links yet');

    act(() => root.unmount()); root = createRoot(container);
    API.get.mockRejectedValueOnce(new Error('boom'));
    await act(async () => { root.render(<CustomFooterLinksSection />); }); await flush();
    expect(q('[role="alert"]').textContent).toContain('Could not load footer links');
    API.get.mockResolvedValue({ data: { links: [URL_LINK], max: 20 } });
    await click(btn('Try again'));
    expect(container.textContent).toContain('Help Centre');
  });

  it('shows only the relevant input for the chosen link type', async () => {
    await open([]);
    await click(btn('Add Footer Link'));
    expect(q('input[placeholder="https://example.com/page"]')).toBeTruthy();
    expect(q('input[type="file"]')).toBeNull();

    await click(container.querySelector('input[value="document"]'));
    expect(q('input[placeholder="https://example.com/page"]')).toBeNull();
    expect(q('input[type="file"]').hasAttribute('accept')).toBe(false); // any ordinary file type may be chosen
    expect(container.textContent).toContain('up to 10 MB');
    expect(container.textContent).toContain('Programs, scripts');
    expect(container.textContent).toContain('Attach URL');
    expect(container.textContent).toContain('Upload Document');
  });

  it('adds a URL link: validates first, then POSTs and refreshes the footer settings', async () => {
    await open([]);
    await click(btn('Add Footer Link'));
    await type(q('input[placeholder="e.g. Cookie Policy"]'), 'Blog');
    await type(q('input[placeholder="https://example.com/page"]'), 'javascript:alert(1)');
    await submit();
    expect(API.post).not.toHaveBeenCalled();
    expect(container.textContent).toContain('valid http:// or https:// URL');

    await type(q('input[placeholder="https://example.com/page"]'), 'https://blog.example.com');
    API.post.mockResolvedValue({ data: { link: { ...URL_LINK, label: 'Blog' } } });
    API.get.mockResolvedValue({ data: { links: [{ ...URL_LINK, label: 'Blog' }], max: 20 } });
    await submit();
    expect(API.post).toHaveBeenCalledWith('/admin/footer-links',
      { label: 'Blog', linkType: 'url', enabled: 'true', url: 'https://blog.example.com' }, undefined);
    expect(toast.success).toHaveBeenCalledWith('Footer link added');
    expect(mockReload).toHaveBeenCalled();
    expect(q('form')).toBeNull(); // form closed
  });

  it('uploads a document with FormData; rejects missing/invalid files before sending', async () => {
    await open([]);
    await click(btn('Add Footer Link'));
    await type(q('input[placeholder="e.g. Cookie Policy"]'), 'Terms Addendum');
    await click(container.querySelector('input[value="document"]'));

    await submit();
    expect(container.textContent).toContain('Choose a file to upload');
    await pickFile(q('input[type="file"]'), new File(['x'], 'virus.exe'));
    await submit();
    expect(container.textContent).toContain('Executable, script and macro-enabled files (.exe) cannot be uploaded');
    expect(API.post).not.toHaveBeenCalled();

    await pickFile(q('input[type="file"]'), new File(['%PDF-1.4'], 'addendum.pdf', { type: 'application/pdf' }));
    API.post.mockResolvedValue({ data: { link: DOC_LINK } });
    await submit();
    expect(API.post).toHaveBeenCalledTimes(1);
    const [path, body, cfg] = API.post.mock.calls[0];
    expect(path).toBe('/admin/footer-links');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('label')).toBe('Terms Addendum');
    expect(body.get('linkType')).toBe('document');
    expect(body.get('file').name).toBe('addendum.pdf');
    expect(body.get('url')).toBeNull();
    expect(typeof cfg.onUploadProgress).toBe('function');
  });

  it('prevents duplicate submissions while a save is in flight', async () => {
    await open([]);
    await click(btn('Add Footer Link'));
    await type(q('input[placeholder="e.g. Cookie Policy"]'), 'Slow');
    await type(q('input[placeholder="https://example.com/page"]'), 'https://slow.example.com');
    let resolve;
    API.post.mockReturnValue(new Promise((r) => { resolve = r; }));
    await submit();
    await submit();
    await submit();
    expect(API.post).toHaveBeenCalledTimes(1);
    expect(btn('Saving')).toBeTruthy();
    expect(btn('Saving').disabled).toBe(true);
    await act(async () => { resolve({ data: { link: URL_LINK } }); });
  });

  it('surfaces server validation errors without closing the form', async () => {
    await open([]);
    await click(btn('Add Footer Link'));
    await type(q('input[placeholder="e.g. Cookie Policy"]'), 'Careers');
    await type(q('input[placeholder="https://example.com/page"]'), 'https://example.com');
    API.post.mockRejectedValue({ response: { data: { message: 'A custom footer link named "Careers" already exists' } } });
    await submit();
    expect(toast.error).toHaveBeenCalledWith('A custom footer link named "Careers" already exists');
    expect(q('form')).toBeTruthy();
  });

  it('edits a URL link, and warns before switching the destination type', async () => {
    await open([URL_LINK]);
    await click(q('button[aria-label="Edit Help Centre"]'));
    expect(q('input[placeholder="e.g. Cookie Policy"]').value).toBe('Help Centre');
    expect(q('input[placeholder="https://example.com/page"]').value).toBe('https://help.example.com/');

    await type(q('input[placeholder="e.g. Cookie Policy"]'), 'Support');
    API.patch.mockResolvedValue({ data: { link: { ...URL_LINK, label: 'Support' } } });
    await submit();
    expect(API.patch).toHaveBeenCalledWith(`/admin/footer-links/${URL_LINK.id}`,
      { label: 'Support', linkType: 'url', enabled: 'true', url: 'https://help.example.com/' }, undefined);

    await click(q('button[aria-label="Edit Help Centre"]'));
    await click(container.querySelector('input[value="document"]'));
    expect(container.textContent).toContain('saved URL will be replaced');
  });

  it('replaces a document without requiring a new file, and requires one when switching from URL', async () => {
    await open([DOC_LINK, URL_LINK]);
    await click(q('button[aria-label="Edit Cookie Policy"]'));
    expect(container.textContent).toContain('Current: cookies.pdf');
    API.patch.mockResolvedValue({ data: { link: DOC_LINK } });
    await submit();
    expect(API.patch).toHaveBeenCalledTimes(1); // a rename-only save needs no file
    expect(API.patch.mock.calls[0][1].get('file')).toBeNull();

    await click(q('button[aria-label="Edit Help Centre"]'));
    await click(container.querySelector('input[value="document"]'));
    await submit();
    expect(container.textContent).toContain('Choose a file to upload');
    expect(API.patch).toHaveBeenCalledTimes(1);
  });

  it('enables/disables a link in place', async () => {
    await open();
    API.patch.mockResolvedValue({ data: { link: URL_LINK } });
    await click(q('button[aria-label="Hide Help Centre"]'));
    expect(API.patch).toHaveBeenCalledWith(`/admin/footer-links/${URL_LINK.id}`, { enabled: false });
    await click(q('button[aria-label="Show Cookie Policy"]'));
    expect(API.patch).toHaveBeenLastCalledWith(`/admin/footer-links/${DOC_LINK.id}`, { enabled: true });
    expect(mockReload).toHaveBeenCalled();
  });

  it('deletes only after confirmation, and warns that an uploaded file is removed', async () => {
    await open();
    window.confirm.mockReturnValueOnce(false);
    await click(q('button[aria-label="Delete Cookie Policy"]'));
    expect(API.delete).not.toHaveBeenCalled();
    expect(window.confirm.mock.calls[0][0]).toContain('uploaded file will also be removed');

    API.delete.mockResolvedValue({ data: { success: true } });
    await click(q('button[aria-label="Delete Cookie Policy"]'));
    expect(API.delete).toHaveBeenCalledWith(`/admin/footer-links/${DOC_LINK.id}`);
    expect(toast.success).toHaveBeenCalledWith('Footer link deleted');
  });

  it('reorders with the arrow buttons by sending the full id order', async () => {
    await open();
    expect(q('button[aria-label="Move Help Centre up"]').disabled).toBe(true);
    expect(q('button[aria-label="Move Cookie Policy down"]').disabled).toBe(true);
    API.put.mockResolvedValue({ data: { links: [DOC_LINK, URL_LINK] } });
    await click(q('button[aria-label="Move Help Centre down"]'));
    expect(API.put).toHaveBeenCalledWith('/admin/footer-links/order', { ids: [DOC_LINK.id, URL_LINK.id] });
  });

  it('stops offering Add when the limit is reached', async () => {
    API.get.mockResolvedValue({ data: { links: Array.from({ length: 20 }, (_, i) => ({ ...URL_LINK, id: String(i).padStart(16, '0'), label: `L${i}` })), max: 20 } });
    await act(async () => { root.render(<CustomFooterLinksSection />); }); await flush();
    expect(btn('Add Footer Link').disabled).toBe(true);
  });

  it('uploads other file types (image, spreadsheet, archive, unknown extension) without a type restriction', async () => {
    for (const [name, mime] of [['banner.png', 'image/png'], ['prices.xlsx', ''], ['bundle.zip', 'application/zip'], ['drawing.dwg', '']]) {
      API.post.mockClear();
      act(() => root.unmount()); root = createRoot(container);
      await open([]);
      await click(btn('Add Footer Link'));
      await type(q('input[placeholder="e.g. Cookie Policy"]'), `Doc ${name}`);
      await click(container.querySelector('input[value="document"]'));
      await pickFile(q('input[type="file"]'), new File(['content'], name, { type: mime }));
      API.post.mockResolvedValue({ data: { link: DOC_LINK } });
      await submit();
      expect(API.post).toHaveBeenCalledTimes(1);
      expect(API.post.mock.calls[0][1].get('file').name).toBe(name);
    }
  });

  it('rejects oversized files before uploading and says why', async () => {
    await open([]);
    await click(btn('Add Footer Link'));
    await type(q('input[placeholder="e.g. Cookie Policy"]'), 'Huge');
    await click(container.querySelector('input[value="document"]'));
    const big = new File(['x'], 'huge.pdf');
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    await pickFile(q('input[type="file"]'), big);
    await submit();
    expect(container.textContent).toContain('File must be 10 MB or smaller');
    expect(API.post).not.toHaveBeenCalled();
  });

  it('shows very long file names without breaking the layout (wrapping in the form, truncating in the list)', async () => {
    const longName = `${'quarterly-financial-statement-'.repeat(8)}final.pdf`;
    const longDoc = { ...DOC_LINK, enabled: true, document: { ...DOC_LINK.document, originalName: longName } };
    await open([longDoc]);
    const listLine = [...container.querySelectorAll('p')].find((p) => p.textContent.includes(longName));
    expect(listLine.className).toContain('truncate');
    expect(listLine.getAttribute('title')).toBe(longName);

    await click(q('button[aria-label="Edit Cookie Policy"]'));
    const current = [...container.querySelectorAll('span')].find((n) => n.textContent.includes(`Current: ${longName}`));
    expect(current.className).toContain('break-all');
    expect(current.className).toContain('min-w-0');
  });

  it('layout regression: every visually-hidden (sr-only, absolutely positioned) input sits inside a positioned ancestor', async () => {
    // An sr-only input with no positioned ancestor anchors to the page, escapes the scrolling admin
    // panel's overflow and stretches the whole document — a huge blank area below the layout.
    await open([URL_LINK]);
    await click(btn('Add Footer Link'));
    const hidden = [...container.querySelectorAll('.sr-only')];
    expect(hidden.length).toBeGreaterThanOrEqual(2); // the Attach URL / Upload Document radios
    hidden.forEach((el) => {
      const positioned = el.closest('.relative');
      expect(positioned).not.toBeNull();
      expect(container.contains(positioned)).toBe(true);
    });
    // And nothing in the section pins a height or uses viewport units.
    const html = container.innerHTML;
    expect(html).not.toMatch(/min-h-screen|h-screen|100vh|min-height/);
  });
});
