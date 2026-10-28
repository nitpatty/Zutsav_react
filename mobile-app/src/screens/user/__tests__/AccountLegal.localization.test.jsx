import fs from 'fs';
import path from 'path';
import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { formatDate } from '../../../utils/helpers';
import { formatDateWithOptions } from '../../../i18n/formatters';
import { describeFixedDocument, describeFooterFile, mapLegalDocuments } from '../../../utils/legalResources';
import { resetLegalCache } from '../../../services/legalResourcesService';
import DeleteAccountScreen from '../DeleteAccountScreen';
import LegalResourcesScreen from '../LegalResourcesScreen';
import LegalDocumentScreen from '../LegalDocumentScreen';

// F-08 Phase 6: account deletion and the legal/privacy screens' CONTROLS. Document titles, labels, file names and the
// documents themselves come from the server / the device and are never translated; consent wording is not touched.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ title }) => <Text>{`HEADER:${title}`}</Text> };
});
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const hi = getTranslator('hi');
const ta = getTranslator('ta');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const httpError = (message) => ({ response: { status: 400, data: message ? { message } : {} } });

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear(); Object.values(mockNav).forEach((f) => f.mockClear && f.mockClear());
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => { jest.restoreAllMocks(); });

// ── Delete account ───────────────────────────────────────────────────────────
describe('DeleteAccountScreen localization', () => {
  const logout = jest.fn();
  const nav = { navigate: jest.fn(), goBack: jest.fn() };
  beforeEach(() => {
    logout.mockClear(); nav.goBack.mockClear();
    useAuthStore.setState({ user: { _id: 'u1', name: 'Asha', email: 'asha@example.invalid', phone: '9111111111' }, logout });
  });
  afterEach(() => { useAuthStore.setState({ user: null }); });

  const render_ = () => render(<DeleteAccountScreen navigation={nav} />);
  const toPassword = (L) => { fireEvent.press(screen.getByText(L('auth.continueWithDeletion'))); };
  const toChannel = async (L) => {
    api.post.mockResolvedValueOnce({ data: { success: true } });
    toPassword(L);
    fireEvent.changeText(screen.getByPlaceholderText(L('account.passwordPlaceholder')), 'S3cret!pw');
    fireEvent.press(screen.getByText(L('account.verifyPassword')));
    await screen.findByText(L('account.sendVia'));
  };

  it('English is unchanged', () => {
    render_();
    expect(screen.getByText('HEADER:Delete Account')).toBeTruthy();
    expect(screen.getByText('Delete Your Account?')).toBeTruthy();
    expect(screen.getByText('Continue with Deletion')).toBeTruthy();
    expect(screen.getByText('Keep My Account')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue with Deletion'));
    expect(screen.getByText('Verify Your Identity')).toBeTruthy();
    expect(screen.getByPlaceholderText('Current password')).toBeTruthy();
  });

  it('Hindi: warning step is translated and "Keep My Account" still just goes back', async () => {
    await setLang('hi');
    render_();
    expect(screen.getByText(`HEADER:${hi('settings.deleteAccount')}`)).toBeTruthy();
    expect(screen.getByText(hi('account.warnTitle'))).toBeTruthy();
    expect(screen.getByText(hi('account.warnBody'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('account.keepAccount')));
    expect(nav.goBack).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('password step: translated prompts; the check still posts the typed password to the same endpoint', async () => {
    await setLang('hi');
    render_();
    toPassword(hi);
    fireEvent.press(screen.getByText(hi('account.verifyPassword')));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('profile.enterCurrentPassword') });
    expect(api.post).not.toHaveBeenCalled();

    api.post.mockRejectedValueOnce(httpError());
    fireEvent.changeText(screen.getByPlaceholderText(hi('account.passwordPlaceholder')), 'wrong');
    fireEvent.press(screen.getByText(hi('account.verifyPassword')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('account.wrongPassword') }));
    expect(api.post).toHaveBeenCalledWith('/auth/delete-account/check-password', { password: 'wrong' });

    api.post.mockRejectedValueOnce(httpError('Too many attempts'));
    fireEvent.press(screen.getByText(hi('account.verifyPassword')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'Too many attempts' }));   // server text as received
  });

  it('channel step: translated options show the account\'s own email/phone; the channel VALUES sent are unchanged', async () => {
    await setLang('hi');
    render_();
    await toChannel(hi);
    expect(screen.getByText(hi('account.emailOption', { email: 'asha@example.invalid' }))).toBeTruthy();
    expect(screen.getByText(hi('account.whatsappOption', { phone: '9111111111' }))).toBeTruthy();

    api.post.mockResolvedValueOnce({ data: { success: true } });
    fireEvent.press(screen.getByText(hi('auth.sendOtp')));
    await screen.findByText(hi('account.enterOtp'));
    expect(api.post).toHaveBeenLastCalledWith('/auth/delete-account/send-otp', { channel: 'email' });
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'success', text1: hi('account.otpSentEmail') });
    expect(screen.getByText(hi('account.otpSubEmail'))).toBeTruthy();
  });

  it('WhatsApp channel: sends channel "whatsapp" and verifies against the phone number', async () => {
    await setLang('hi');
    render_();
    await toChannel(hi);
    fireEvent.press(screen.getByText(hi('account.whatsappOption', { phone: '9111111111' })));
    api.post.mockResolvedValueOnce({ data: { success: true } });
    fireEvent.press(screen.getByText(hi('auth.sendOtp')));
    await screen.findByText(hi('account.otpSubWhatsapp'));
    expect(api.post).toHaveBeenLastCalledWith('/auth/delete-account/send-otp', { channel: 'whatsapp' });
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'success', text1: hi('account.otpSentWhatsapp') });

    api.post.mockResolvedValueOnce({ data: { success: true } });
    fireEvent.changeText(screen.getByPlaceholderText('000000'), '123456');
    fireEvent.press(screen.getByText(hi('auth.verifyOtp')));
    await screen.findByText(hi('account.confirmTitle'));
    expect(api.post).toHaveBeenLastCalledWith('/auth/verify-otp', { identifier: '9111111111', otp: '123456', purpose: 'account_deletion' });
  });

  it('no email on file is reported in the user\'s language and nothing is sent; OTP validation messages are translated', async () => {
    await setLang('hi');
    useAuthStore.setState({ user: { _id: 'u1', phone: '9111111111' } });
    render_();
    await toChannel(hi);
    expect(screen.getByText(hi('account.emailOption', { email: hi('account.notSet') }))).toBeTruthy();
    const posts = api.post.mock.calls.length;
    fireEvent.press(screen.getByText(hi('auth.sendOtp')));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('account.noEmail') });
    expect(api.post.mock.calls.length).toBe(posts);
  });

  it('OTP step: short code, wrong code and server message', async () => {
    await setLang('hi');
    render_();
    await toChannel(hi);
    api.post.mockResolvedValueOnce({ data: { success: true } });
    fireEvent.press(screen.getByText(hi('auth.sendOtp')));
    await screen.findByText(hi('account.enterOtp'));
    fireEvent.changeText(screen.getByPlaceholderText('000000'), '123');
    fireEvent.press(screen.getByText(hi('auth.verifyOtp')));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('account.otpRequired') });
    fireEvent.changeText(screen.getByPlaceholderText('000000'), '123456');
    api.post.mockRejectedValueOnce(httpError());
    fireEvent.press(screen.getByText(hi('auth.verifyOtp')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('auth.invalidOtp') }));
    api.post.mockRejectedValueOnce(httpError('OTP expired'));
    fireEvent.press(screen.getByText(hi('auth.verifyOtp')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'OTP expired' }));
  });

  it('final confirmation and completion: translated; the confirm request and the delayed sign-out are unchanged', async () => {
    jest.useFakeTimers();
    try {
      await setLang('hi');
      render_();
      api.post.mockResolvedValueOnce({ data: { success: true } });
      toPassword(hi);
      fireEvent.changeText(screen.getByPlaceholderText(hi('account.passwordPlaceholder')), 'pw');
      fireEvent.press(screen.getByText(hi('account.verifyPassword')));
      await act(async () => { await Promise.resolve(); });
      api.post.mockResolvedValueOnce({ data: {} });
      fireEvent.press(screen.getByText(hi('auth.sendOtp')));
      await act(async () => { await Promise.resolve(); });
      api.post.mockResolvedValueOnce({ data: {} });
      fireEvent.changeText(screen.getByPlaceholderText('000000'), '654321');
      fireEvent.press(screen.getByText(hi('auth.verifyOtp')));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText(hi('account.confirmTitle'))).toBeTruthy();
      expect(screen.getByText(hi('account.confirmBody'))).toBeTruthy();

      api.post.mockResolvedValueOnce({ data: { scheduledDeletionDate: '2026-06-15T00:00:00.000Z' } });
      fireEvent.press(screen.getByText(hi('account.confirmBtn')));
      await act(async () => { await Promise.resolve(); });
      expect(api.post).toHaveBeenLastCalledWith('/auth/delete-account/confirm', { channel: 'email' });
      expect(Toast.show).toHaveBeenLastCalledWith({ type: 'info', text1: hi('account.scheduledToast') });
      expect(screen.getByText(`HEADER:${hi('account.screenTitle')}`)).toBeTruthy();
      expect(screen.getByText(hi('account.doneTitle'))).toBeTruthy();
      // Day 27: the scheduled date is now shown in the selected language (Hindi month name, Latin digits), not in English.
      const when = new Date('2026-06-15T00:00:00.000Z');
      const date = formatDateWithOptions(when, { day: '2-digit', month: 'long', year: 'numeric' }, 'hi');
      expect(date).not.toBe(when.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }));
      expect(date).toMatch(/[ऀ-ॿ]/);
      expect(screen.getByText(hi('account.doneBody', { date }))).toBeTruthy();
      expect(logout).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(logout).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  it('a language change mid-flow keeps the step and the typed password, makes no request, and the wording follows', async () => {
    render_();
    fireEvent.press(screen.getByText('Continue with Deletion'));
    fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'keep-me');
    await setLang('ta');
    expect(screen.getByText(ta('account.verifyIdentity'))).toBeTruthy();
    expect(screen.getByDisplayValue('keep-me')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });
});

// ── Legal & Resources (list) ─────────────────────────────────────────────────
const A = 'a1b2c3d4e5f60718';
const ALL = [['privacy', 'Privacy Policy'], ['terms', 'Terms & Conditions'], ['refund-policy', 'Refund & Cancellation Policy'], ['about-us', 'About Us'], ['vision', 'Vision, Mission & Core Values']];
const docsBody = (published = ALL.map(([t]) => t)) => ({
  success: true,
  documents: ALL.map(([t, label]) => {
    const exists = published.includes(t);
    return { documentType: t, label, exists, originalName: `${t}.pdf`, mimeType: 'application/pdf', size: 1000, viewUrl: exists ? `/api/documents/${t}/view` : '' };
  }),
});
const settingsBody = (footerLinks) => ({ success: true, settings: { platformName: 'Zutsav', footerLinks } });
let docsResponse; let settingsResponse;
const serveResources = () => api.get.mockImplementation(async (url) => {
  const r = url === '/documents' ? docsResponse : url === '/settings/public' ? settingsResponse : null;
  if (!r) throw new Error(`unexpected GET ${url}`);
  if (r instanceof Error) throw r;
  return r;
});

describe('LegalResourcesScreen localization (controls only)', () => {
  beforeEach(() => {
    resetLegalCache();
    docsResponse = { data: docsBody() };
    settingsResponse = { data: settingsBody([{ id: A, label: 'Brochure', linkType: 'url', url: 'https://example.com/x' }]) };
    serveResources();
  });

  it('English is unchanged', async () => {
    render(<LegalResourcesScreen />);
    expect(await screen.findByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText('HEADER:Legal & Resources')).toBeTruthy();
    expect(screen.getByText('Legal documents')).toBeTruthy();
    expect(screen.getByText('More links')).toBeTruthy();
  });

  it('Hindi: headings and hints are translated; every document title is shown exactly as the server supplied it', async () => {
    await setLang('hi');
    render(<LegalResourcesScreen />);
    expect(await screen.findByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('settings.legalResources')}`)).toBeTruthy();
    expect(screen.getByText(hi('legal.sectionDocs'))).toBeTruthy();
    expect(screen.getByText(hi('legal.moreLinks'))).toBeTruthy();
    ALL.forEach(([, label]) => expect(screen.getByText(label)).toBeTruthy());      // official titles: not translated
    expect(screen.getByText('Brochure')).toBeTruthy();                               // admin-configured link label: as received
    expect(screen.getAllByHintText(hi('legal.hintOpenDoc')).length).toBe(5);
    expect(screen.getByHintText(hi('legal.hintBrowser'))).toBeTruthy();
  });

  it('document selection and link opening keep their navigation contracts', async () => {
    await setLang('hi');
    settingsResponse = { data: settingsBody([
      { id: A, label: 'Brochure', linkType: 'url', url: 'https://example.com/x' },
      { id: '0123456789abcdef', label: 'Price list', linkType: 'document', path: '/legal/link/0123456789abcdef' },
    ]) };
    render(<LegalResourcesScreen />);
    fireEvent.press(await screen.findByText('Terms & Conditions'));
    expect(mockNav.navigate).toHaveBeenCalledWith('LegalDocument', { source: 'fixed', type: 'terms', title: 'Terms & Conditions' });
    fireEvent.press(screen.getByText('Price list'));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('LegalDocument', { source: 'link', id: '0123456789abcdef', title: 'Price list' });
    fireEvent.press(screen.getByText('Brochure'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/x'));
    Linking.openURL.mockRejectedValueOnce(new Error('no browser'));
    fireEvent.press(screen.getByText('Brochure'));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('legal.openFailedLink') }));
  });

  it('an unsafe link is still refused, with the translated message and nothing opened', async () => {
    await setLang('hi');
    settingsResponse = { data: settingsBody([{ id: A, label: 'Bad', linkType: 'url', url: 'javascript:alert(1)' }]) };
    render(<LegalResourcesScreen />);
    await screen.findByText('Privacy Policy');
    expect(screen.queryByText('Bad')).toBeNull();                                    // filtered before it can be shown (existing F-04 behaviour)
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('empty, error and stale states are translated; Retry still reloads', async () => {
    await setLang('hi');
    docsResponse = { data: docsBody([]) };
    settingsResponse = { data: settingsBody([]) };
    const empty = render(<LegalResourcesScreen />);
    expect(await screen.findByText(hi('legal.docsEmpty'))).toBeTruthy();
    empty.unmount();

    resetLegalCache();
    docsResponse = new Error('offline');
    settingsResponse = new Error('offline');
    render(<LegalResourcesScreen />);
    expect(await screen.findByText(hi('legal.docsError'))).toBeTruthy();
    expect(screen.getByText(hi('legal.linksError'))).toBeTruthy();
    docsResponse = { data: docsBody() };
    settingsResponse = { data: settingsBody([]) };
    fireEvent.press(screen.getAllByText(hi('common.retry'))[0]);
    expect(await screen.findByText('Privacy Policy')).toBeTruthy();
  });

  it('switching language neither reloads the documents nor changes what is listed', async () => {
    render(<LegalResourcesScreen />);
    await screen.findByText('Privacy Policy');
    const calls = api.get.mock.calls.length;
    await setLang('hi');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.get.mock.calls.length).toBe(calls);
    expect(screen.getByText(hi('legal.sectionDocs'))).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
  });
});

// ── Legal document viewer ────────────────────────────────────────────────────
const ORIGIN = 'https://api.test.invalid';
const fixedMeta = (type, over = {}) => ({
  documentType: type, label: 'Privacy Policy', exists: true, originalName: 'privacy.pdf', mimeType: 'application/pdf', size: 120000,
  updatedAt: '2026-03-01T10:00:00.000Z', viewUrl: `/api/documents/${type}/view`, ...over,
});
const fileMeta = (id, over = {}) => ({
  exists: true, label: 'Brochure', mimeType: 'application/pdf', kind: 'pdf', fileName: 'brochure.pdf', size: 250000,
  updatedAt: '2026-03-01T10:00:00.000Z', viewUrl: `/api/footer-links/${id}/view`, downloadUrl: `/api/footer-links/${id}/download`, ...over,
});
const fixedRoute = (over = {}) => ({ params: { source: 'fixed', type: 'privacy', title: 'Privacy Policy', ...over } });
const linkRoute = (over = {}) => ({ params: { source: 'link', id: A, title: 'Brochure', ...over } });
const respondWith = (body) => api.get.mockImplementation(async () => ({ data: body }));

describe('LegalDocumentScreen localization (controls only)', () => {
  it('Hindi: the document\'s own title, file name and the open action are intact; only the controls and the "Updated" line are translated', async () => {
    await setLang('hi');
    respondWith({ document: fixedMeta('privacy') });
    render(<LegalDocumentScreen route={fixedRoute()} />);
    fireEvent.press(await screen.findByText(hi('legal.openDocument')));
    expect(Linking.openURL).toHaveBeenCalledWith(`${ORIGIN}/api/documents/privacy/view`);
    expect(screen.getByText('HEADER:Privacy Policy')).toBeTruthy();
    expect(screen.getByText('privacy.pdf')).toBeTruthy();
    // Day 27: the "Updated" date uses Hindi month names (10:00 UTC falls on 1 March in every UTC offset from -10 to +13).
    expect(screen.getByText(hi('legal.updatedOn', { date: '01 मार्च 2026' }))).toBeTruthy();
  });

  it('English wording is unchanged for the same document', async () => {
    respondWith({ document: fixedMeta('privacy') });
    render(<LegalDocumentScreen route={fixedRoute()} />);
    expect(await screen.findByText('Open document')).toBeTruthy();
    expect(screen.getByText(`Updated ${formatDate('2026-03-01T10:00:00.000Z')}`)).toBeTruthy();
  });

  it('PDF, image and download-only files: translated buttons, same documented routes', async () => {
    await setLang('hi');
    respondWith({ document: fileMeta(A) });
    const pdf = render(<LegalDocumentScreen route={linkRoute()} />);
    fireEvent.press(await screen.findByText(hi('legal.openPdf')));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${ORIGIN}/api/footer-links/${A}/view`);
    fireEvent.press(screen.getByText(hi('legal.download')));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${ORIGIN}/api/footer-links/${A}/download`);
    pdf.unmount();

    respondWith({ document: fileMeta(A, { mimeType: 'application/vnd.ms-excel', kind: 'download', fileName: 'prices.xls' }) });
    render(<LegalDocumentScreen route={linkRoute()} />);
    fireEvent.press(await screen.findByText(hi('legal.downloadFile')));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${ORIGIN}/api/footer-links/${A}/download`);
    expect(screen.getByText(hi('legal.noPreview'))).toBeTruthy();
    expect(screen.getByText('prices.xls')).toBeTruthy();
  });

  it('an image that cannot be displayed gets the translated fallback', async () => {
    await setLang('hi');
    respondWith({ document: fileMeta(A, { mimeType: 'image/png', kind: 'image', fileName: 'seal.png' }) });
    const { UNSAFE_getByType } = render(<LegalDocumentScreen route={linkRoute()} />);
    await screen.findByText(hi('legal.download'));
    const { Image } = require('react-native');
    fireEvent(UNSAFE_getByType(Image), 'error');
    expect(await screen.findByTestId('image-failed')).toBeTruthy();
    expect(screen.getByText(hi('legal.imageFailed'))).toBeTruthy();
  });

  it('unavailable, error (with working Retry) and open-failure states are translated', async () => {
    await setLang('hi');
    respondWith({ document: { ...fixedMeta('vision'), exists: false, viewUrl: '' } });
    const gone = render(<LegalDocumentScreen route={fixedRoute({ type: 'vision' })} />);
    expect(await screen.findByText(hi('legal.unavailable'))).toBeTruthy();
    expect(screen.getByText(hi('legal.unavailableSub'))).toBeTruthy();
    gone.unmount();

    api.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<LegalDocumentScreen route={fixedRoute()} />);
    expect(await screen.findByText(hi('legal.docLoadFailed'))).toBeTruthy();
    expect(screen.getByText(hi('legal.checkConnection'))).toBeTruthy();
    respondWith({ document: fixedMeta('privacy') });
    fireEvent.press(screen.getByText(hi('common.retry')));
    Linking.openURL.mockRejectedValueOnce(new Error('no app'));
    fireEvent.press(await screen.findByText(hi('legal.openDocument')));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('legal.openFileFailed') }));
  });

  it('the heading falls back to the translated word only when neither the document nor the route supplies a title', async () => {
    await setLang('hi');
    api.get.mockRejectedValue(new Error('Network Error'));
    render(<LegalDocumentScreen route={fixedRoute({ title: undefined })} />);
    expect(await screen.findByText(`HEADER:${hi('legal.documentFallback')}`)).toBeTruthy();
  });

  it('switching language does not reload the document', async () => {
    respondWith({ document: fixedMeta('privacy') });
    render(<LegalDocumentScreen route={fixedRoute()} />);
    await screen.findByText('Open document');
    await setLang('hi');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByText(hi('legal.openDocument'))).toBeTruthy();
  });
});

describe('official legal content and consent are untouched', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');

  it('the document descriptors are identical in every UI language (titles, names, URLs, modes)', async () => {
    const run = () => ({
      list: mapLegalDocuments(docsBody()),
      fixed: describeFixedDocument('privacy', { document: fixedMeta('privacy') }),
      file: describeFooterFile(A, { document: fileMeta(A) }),
    });
    const english = run();
    await setLang('hi');
    expect(run()).toEqual(english);
    await setLang('ta');
    expect(run()).toEqual(english);
    expect(english.list.map((d) => d.label)).toEqual(ALL.map(([, l]) => l));
  });

  it('the legal utilities/service do not depend on the localization layer, and no consent wording lives in these screens', () => {
    ['utils/legalResources.js', 'services/legalResourcesService.js'].forEach((f) => expect(/i18n|useTranslation|getTranslator/.test(read(f))).toBe(false));
    ['DeleteAccountScreen.jsx', 'LegalResourcesScreen.jsx', 'LegalDocumentScreen.jsx', 'FamilyMembersScreen.jsx', 'FamilyMemberFormScreen.jsx']
      .forEach((f) => expect(/consent/i.test(read('screens', 'user', f))).toBe(false));
  });

  it('no dictionary entry is used for a document title: titles reach the screens only from the server response or route', () => {
    const src = `${read('screens', 'user', 'LegalResourcesScreen.jsx')}\n${read('screens', 'user', 'LegalDocumentScreen.jsx')}`;
    expect(src).toContain('label={d.label}');
    expect(src).toContain('doc?.title || titleParam');
    expect(/t\('legal\.(privacy|terms|refund|about|vision)/.test(src)).toBe(false);
  });
});
