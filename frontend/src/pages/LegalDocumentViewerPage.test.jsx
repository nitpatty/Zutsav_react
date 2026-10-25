import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import API from '../api/axios';
import LegalDocumentViewerPage from './LegalDocumentViewerPage';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d) => d || k }) }));
jest.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {}, version: 'test' },
  Document: ({ file, children }) => <div data-testid="pdf-document" data-file={file}>{children}</div>,
  Page: () => null,
}));
jest.mock('../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../config/urls.config', () => ({ serverOrigin: 'https://api.example.com' }));

global.IS_REACT_ACT_ENVIRONMENT = true;
global.ResizeObserver = global.ResizeObserver || class { observe() {} disconnect() {} };

const ID = 'a1b2c3d4e5f60718';
const meta = (extra) => ({
  data: { success: true, document: { exists: true, label: 'Price List', size: 2048, updatedAt: '2026-03-01T00:00:00.000Z',
    viewUrl: `/api/footer-links/${ID}/view`, downloadUrl: `/api/footer-links/${ID}/download`, fileName: 'prices.xlsx', ...extra } },
});

let container; let root;
async function renderAt(path) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/legal/link/:linkId" element={<LegalDocumentViewerPage />} />
          <Route path="/legal/:type" element={<LegalDocumentViewerPage />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('LegalDocumentViewerPage — custom footer files', () => {
  it('asks the footer-links API for the file, never the fixed-document API', async () => {
    API.get.mockResolvedValue(meta({ kind: 'download', mimeType: 'application/zip' }));
    await renderAt(`/legal/link/${ID}`);
    expect(API.get).toHaveBeenCalledWith(`/footer-links/${ID}`);
  });

  it('offers a Download card for non-previewable files and never embeds or renders them', async () => {
    API.get.mockResolvedValue(meta({ kind: 'download', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    await renderAt(`/legal/link/${ID}`);
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Download'));
    expect(link.getAttribute('href')).toBe(`https://api.example.com/api/footer-links/${ID}/download`);
    expect(link.hasAttribute('download')).toBe(true);
    expect(container.textContent).toContain('prices.xlsx');
    expect(container.textContent).toContain('2 KB');
    expect(container.querySelector('iframe, object, embed')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('wraps very long file names in the download card', async () => {
    const longName = `${'budget-review-'.repeat(20)}2026.xlsx`;
    API.get.mockResolvedValue(meta({ kind: 'download', mimeType: 'application/zip', fileName: longName }));
    await renderAt(`/legal/link/${ID}`);
    const nameEl = [...container.querySelectorAll('p')].find((p) => p.textContent === longName);
    expect(nameEl.className).toContain('break-all');
  });

  it('shows images inline from the view URL', async () => {
    API.get.mockResolvedValue(meta({ kind: 'image', mimeType: 'image/png', fileName: 'banner.png' }));
    await renderAt(`/legal/link/${ID}`);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe(`https://api.example.com/api/footer-links/${ID}/view`);
    expect(img.getAttribute('alt')).toBe('Price List');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders PDFs with the in-app PDF viewer', async () => {
    API.get.mockResolvedValue(meta({ kind: 'pdf', mimeType: 'application/pdf', fileName: 'a.pdf' }));
    await renderAt(`/legal/link/${ID}`);
    expect(container.querySelector('[data-testid="pdf-document"]').getAttribute('data-file')).toBe(`https://api.example.com/api/footer-links/${ID}/view`);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('shows a clear message for missing/disabled files and for malformed ids', async () => {
    API.get.mockResolvedValue({ data: { success: true, document: { exists: false } } });
    await renderAt(`/legal/link/${ID}`);
    expect(container.textContent).toContain('This document is not available.');

    API.get.mockClear();
    act(() => root.unmount()); root = createRoot(container);
    await renderAt('/legal/link/not-a-valid-id');
    expect(API.get).not.toHaveBeenCalled();
    expect(container.textContent).toContain('could not be found');
  });
});

describe('LegalDocumentViewerPage — fixed legal documents (unchanged behaviour)', () => {
  it('still loads fixed documents from /documents/:type and opens DOC/DOCX in the online viewer', async () => {
    API.get.mockResolvedValue({ data: { success: true, document: { exists: true, label: 'Privacy Policy', mimeType: 'application/msword', viewUrl: '/api/documents/privacy/view', updatedAt: null } } });
    await renderAt('/legal/privacy');
    expect(API.get).toHaveBeenCalledWith('/documents/privacy');
    expect(container.querySelector('iframe').getAttribute('src')).toContain('docs.google.com/viewer');
    expect(container.textContent).not.toContain('Download');
  });

  it('still renders fixed PDFs in the PDF viewer and rejects unknown types', async () => {
    API.get.mockResolvedValue({ data: { success: true, document: { exists: true, label: 'Terms', mimeType: 'application/pdf', viewUrl: '/api/documents/terms/view' } } });
    await renderAt('/legal/terms');
    expect(container.querySelector('[data-testid="pdf-document"]')).not.toBeNull();

    API.get.mockClear();
    act(() => root.unmount()); root = createRoot(container);
    await renderAt('/legal/not-a-type');
    expect(API.get).not.toHaveBeenCalled();
  });
});
