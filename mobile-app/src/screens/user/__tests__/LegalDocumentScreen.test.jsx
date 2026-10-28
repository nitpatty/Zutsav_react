import React from 'react';
import { Linking } from 'react-native';
import Toast from 'react-native-toast-message';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import LegalDocumentScreen from '../LegalDocumentScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const ORIGIN = 'https://api.test.invalid';
const A = 'a1b2c3d4e5f60718';

const fixedMeta = (type, over = {}) => ({
  documentType: type, label: 'Privacy Policy', exists: true, originalName: 'privacy.pdf', mimeType: 'application/pdf',
  size: 120000, updatedAt: '2026-03-01T10:00:00.000Z', viewUrl: `/api/documents/${type}/view`, ...over,
});
const fileMeta = (id, over = {}) => ({
  exists: true, label: 'Brochure', mimeType: 'application/pdf', kind: 'pdf', fileName: 'brochure.pdf', size: 250000,
  updatedAt: '2026-03-01T10:00:00.000Z', viewUrl: `/api/footer-links/${id}/view`, downloadUrl: `/api/footer-links/${id}/download`, ...over,
});
const fixedRoute = (over = {}) => ({ params: { source: 'fixed', type: 'privacy', title: 'Privacy Policy', ...over } });
const linkRoute = (over = {}) => ({ params: { source: 'link', id: A, title: 'Brochure', ...over } });
const respondWith = (body) => api.get.mockImplementation(async () => ({ data: body }));
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockReset();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('LegalDocumentScreen — fixed documents', () => {
  it('reads GET /documents/:type and opens a PDF through the documented public view route', async () => {
    respondWith({ success: true, document: fixedMeta('privacy') });
    render(<LegalDocumentScreen route={fixedRoute()} />);
    fireEvent.press(await screen.findByText('Open document'));
    expect(api.get).toHaveBeenCalledWith('/documents/privacy');
    expect(Linking.openURL).toHaveBeenCalledWith(`${ORIGIN}/api/documents/privacy/view`);
    expect(screen.getByText('privacy.pdf')).toBeTruthy();
  });

  it('offers Word documents as a download', async () => {
    respondWith({ document: fixedMeta('terms', { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalName: 'terms.docx' }) });
    render(<LegalDocumentScreen route={fixedRoute({ type: 'terms' })} />);
    fireEvent.press(await screen.findByText('Download document'));
    expect(Linking.openURL).toHaveBeenCalledWith(`${ORIGIN}/api/documents/terms/view`);
  });

  it('shows "unavailable" for a document that is not published', async () => {
    respondWith({ document: { ...fixedMeta('vision'), exists: false, viewUrl: '' } });
    render(<LegalDocumentScreen route={fixedRoute({ type: 'vision' })} />);
    expect(await screen.findByTestId('doc-unavailable')).toBeTruthy();
    expect(screen.queryByText('Open document')).toBeNull();
  });

  it('treats 400/404 as unavailable, and other failures as retryable', async () => {
    api.get.mockRejectedValueOnce(httpError(404));
    const first = render(<LegalDocumentScreen route={fixedRoute()} />);
    expect(await screen.findByTestId('doc-unavailable')).toBeTruthy();
    first.unmount();

    api.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<LegalDocumentScreen route={fixedRoute()} />);
    expect(await screen.findByTestId('doc-error')).toBeTruthy();

    respondWith({ document: fixedMeta('privacy') });
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Open document')).toBeTruthy();
  });

  it('a Linking failure gives a message, not a crash', async () => {
    respondWith({ document: fixedMeta('privacy') });
    Linking.openURL.mockRejectedValueOnce(new Error('no app'));
    render(<LegalDocumentScreen route={fixedRoute()} />);
    fireEvent.press(await screen.findByText('Open document'));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
  });

  it('refuses a view URL that is not the documented route (no private storage path is ever opened)', async () => {
    respondWith({ document: fixedMeta('privacy', { viewUrl: '/uploads/legaldocs/secret.pdf' }) });
    render(<LegalDocumentScreen route={fixedRoute()} />);
    expect(await screen.findByTestId('doc-unavailable')).toBeTruthy();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

describe('LegalDocumentScreen — admin-uploaded files', () => {
  it('PDF: Open PDF uses the view route, Download uses the download route', async () => {
    respondWith({ document: fileMeta(A) });
    render(<LegalDocumentScreen route={linkRoute()} />);
    fireEvent.press(await screen.findByText('Open PDF'));
    expect(api.get).toHaveBeenCalledWith(`/footer-links/${A}`);
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${ORIGIN}/api/footer-links/${A}/view`);
    fireEvent.press(screen.getByText('Download'));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${ORIGIN}/api/footer-links/${A}/download`);
    expect(screen.getByText('brochure.pdf')).toBeTruthy(); // original file name preserved
  });

  it('safe raster image is shown in the app, from the documented view route', async () => {
    respondWith({ document: fileMeta(A, { kind: 'image', mimeType: 'image/png', fileName: 'poster.png' }) });
    render(<LegalDocumentScreen route={linkRoute()} />);
    const img = await screen.findByLabelText('Brochure');
    expect(img.props.source).toEqual({ uri: `${ORIGIN}/api/footer-links/${A}/view` });
    fireEvent.press(screen.getByText('Download'));
    expect(Linking.openURL).toHaveBeenCalledWith(`${ORIGIN}/api/footer-links/${A}/download`);
  });

  it('falls back to a message when the image cannot be displayed', async () => {
    respondWith({ document: fileMeta(A, { kind: 'image', mimeType: 'image/png', fileName: 'poster.png' }) });
    render(<LegalDocumentScreen route={linkRoute()} />);
    fireEvent(await screen.findByLabelText('Brochure'), 'error');
    expect(await screen.findByTestId('image-failed')).toBeTruthy();
    expect(screen.getByText('Download')).toBeTruthy();
  });

  it('an SVG (or any non-raster) "image" is never rendered — download only', async () => {
    respondWith({ document: fileMeta(A, { kind: 'image', mimeType: 'image/svg+xml', fileName: 'x.svg' }) });
    render(<LegalDocumentScreen route={linkRoute()} />);
    fireEvent.press(await screen.findByText('Download file'));
    expect(screen.queryByLabelText('Brochure')).toBeNull();
    expect(Linking.openURL).toHaveBeenCalledWith(`${ORIGIN}/api/footer-links/${A}/download`);
  });

  it('Office files cannot be previewed: clear message and a download', async () => {
    respondWith({ document: fileMeta(A, { kind: 'download', mimeType: 'application/vnd.ms-excel', fileName: 'rates.xls' }) });
    render(<LegalDocumentScreen route={linkRoute()} />);
    expect(await screen.findByText(/cannot be previewed in the app/)).toBeTruthy();
    fireEvent.press(screen.getByText('Download file'));
    expect(Linking.openURL).toHaveBeenCalledWith(`${ORIGIN}/api/footer-links/${A}/download`);
  });

  it('a deleted or disabled file is "unavailable", never a broken viewer', async () => {
    respondWith({ document: { exists: false } });
    render(<LegalDocumentScreen route={linkRoute()} />);
    expect(await screen.findByTestId('doc-unavailable')).toBeTruthy();
  });

  it('an oversized file is not offered', async () => {
    respondWith({ document: fileMeta(A, { size: 50 * 1024 * 1024 }) });
    render(<LegalDocumentScreen route={linkRoute()} />);
    expect(await screen.findByTestId('doc-unavailable')).toBeTruthy();
  });

  it('a malformed response is unavailable, not a crash', async () => {
    respondWith('<html>gateway</html>');
    render(<LegalDocumentScreen route={linkRoute()} />);
    expect(await screen.findByTestId('doc-unavailable')).toBeTruthy();
  });

  it('a retryable failure shows Retry', async () => {
    api.get.mockRejectedValueOnce(httpError(503));
    render(<LegalDocumentScreen route={linkRoute()} />);
    expect(await screen.findByTestId('doc-error')).toBeTruthy();
  });
});

describe('LegalDocumentScreen — untrusted route params', () => {
  it.each([
    ['unknown fixed type', { source: 'fixed', type: 'kyc' }],
    ['path traversal type', { source: 'fixed', type: '../pandits/me/kyc' }],
    ['malformed link id', { source: 'link', id: '../../admin' }],
    ['uppercase link id', { source: 'link', id: A.toUpperCase() }],
    ['unknown source', { source: 'other', id: A }],
    ['no params', {}],
  ])('%s never reaches the API', async (_n, params) => {
    render(<LegalDocumentScreen route={{ params }} />);
    expect(await screen.findByTestId('doc-unavailable')).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
