import React from 'react';
import { Linking } from 'react-native';
import Toast from 'react-native-toast-message';
import { fireEvent, render, screen, waitFor, act, within } from '@testing-library/react-native';
import api from '../../../api/axios';
import { resetLegalCache } from '../../../services/legalResourcesService';
import LegalResourcesScreen from '../LegalResourcesScreen';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const A = 'a1b2c3d4e5f60718';
const B = '0123456789abcdef';
const C = 'fedcba9876543210';
const ALL = [
  ['privacy', 'Privacy Policy'], ['terms', 'Terms & Conditions'], ['refund-policy', 'Refund & Cancellation Policy'],
  ['about-us', 'About Us'], ['vision', 'Vision, Mission & Core Values'],
];
const docsBody = (published = ALL.map(([t]) => t)) => ({
  success: true,
  documents: ALL.map(([t, label]) => {
    const exists = published.includes(t);
    return { documentType: t, label, exists, originalName: `${t}.pdf`, mimeType: 'application/pdf', size: 1000, viewUrl: exists ? `/api/documents/${t}/view` : '' };
  }),
});
const settingsBody = (footerLinks) => ({ success: true, settings: { platformName: 'Zutsav', footerLinks } });
const urlLink = (id, label, url = 'https://example.com/x') => ({ id, label, linkType: 'url', url });
const fileLink = (id, label) => ({ id, label, linkType: 'document', path: `/legal/link/${id}` });

let docsResponse; let settingsResponse;
const respond = (r) => (typeof r === 'function' ? r() : r);
beforeEach(() => {
  jest.clearAllMocks();
  resetLegalCache();
  docsResponse = { data: docsBody() };
  settingsResponse = { data: settingsBody([]) };
  api.get.mockImplementation(async (url) => {
    if (url === '/documents') return respond(docsResponse);
    if (url === '/settings/public') return respond(settingsResponse);
    throw new Error(`unexpected GET ${url}`);
  });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('Legal & Resources — fixed documents', () => {
  it('lists every published legal document under its server title', async () => {
    render(<LegalResourcesScreen />);
    for (const [, label] of ALL) expect(await screen.findByText(label)).toBeTruthy();
  });

  it('does not show unpublished documents', async () => {
    docsResponse = { data: docsBody(['privacy', 'about-us']) };
    render(<LegalResourcesScreen />);
    await screen.findByText('Privacy Policy');
    expect(screen.getByText('About Us')).toBeTruthy();
    expect(screen.queryByText('Terms & Conditions')).toBeNull();
    expect(screen.queryByText('Refund & Cancellation Policy')).toBeNull();
    expect(screen.queryByText(/Vision/)).toBeNull();
  });

  it('opens the document viewer for the tapped document', async () => {
    render(<LegalResourcesScreen />);
    fireEvent.press(await screen.findByText('Terms & Conditions'));
    expect(mockNav.navigate).toHaveBeenCalledWith('LegalDocument', { source: 'fixed', type: 'terms', title: 'Terms & Conditions' });
  });

  it('shows an empty state (no fabricated content) when nothing is published', async () => {
    docsResponse = { data: docsBody([]) };
    render(<LegalResourcesScreen />);
    expect(await screen.findByTestId('docs-empty')).toBeTruthy();
    expect(screen.queryByText('Privacy Policy')).toBeNull();
  });

  it('shows a network error with Retry, and Retry recovers', async () => {
    docsResponse = () => { throw new Error('Network Error'); };
    render(<LegalResourcesScreen />);
    expect(await screen.findByTestId('docs-error')).toBeTruthy();

    docsResponse = { data: docsBody(['privacy']) };
    fireEvent.press(screen.getAllByText('Retry')[0]);
    expect(await screen.findByText('Privacy Policy')).toBeTruthy();
    expect(screen.queryByTestId('docs-error')).toBeNull();
  });
});

describe('Legal & Resources — admin-configured links', () => {
  it('shows saved display names in the configured order', async () => {
    settingsResponse = { data: settingsBody([urlLink(A, 'Careers'), fileLink(B, 'Annual Report'), urlLink(C, 'Press Kit')]) };
    render(<LegalResourcesScreen />);
    await screen.findByText('Careers');
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel).filter(Boolean);
    expect(labels.filter((l) => ['Careers', 'Annual Report', 'Press Kit'].includes(l))).toEqual(['Careers', 'Annual Report', 'Press Kit']);
  });

  it('opens a URL link in the external browser, exactly as configured', async () => {
    settingsResponse = { data: settingsBody([urlLink(A, 'Careers', 'https://example.com/jobs?x=1')]) };
    render(<LegalResourcesScreen />);
    fireEvent.press(await screen.findByText('Careers'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/jobs?x=1'));
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('opens an uploaded-file link in the in-app viewer', async () => {
    settingsResponse = { data: settingsBody([fileLink(B, 'Annual Report')]) };
    render(<LegalResourcesScreen />);
    fireEvent.press(await screen.findByText('Annual Report'));
    expect(mockNav.navigate).toHaveBeenCalledWith('LegalDocument', { source: 'link', id: B, title: 'Annual Report' });
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('never shows or opens unsafe, malformed or duplicate links', async () => {
    settingsResponse = { data: settingsBody([
      urlLink(A, 'Evil', 'javascript:alert(1)'), urlLink(B, 'Intent', 'intent://x#Intent;end'), urlLink(C, 'Creds', 'https://u:p@example.com'),
      { id: 'bad', label: 'Bad id', linkType: 'url', url: 'https://example.com' }, urlLink('1'.repeat(16), 'Privacy Policy'), urlLink('2'.repeat(16), 'Good'),
    ]) };
    render(<LegalResourcesScreen />);
    await screen.findByText('Good');
    for (const bad of ['Evil', 'Intent', 'Creds', 'Bad id']) expect(screen.queryByText(bad)).toBeNull();
    expect(screen.getAllByText('Privacy Policy')).toHaveLength(1); // only the fixed document, not the duplicate link
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('hides the "More links" section when none are configured', async () => {
    render(<LegalResourcesScreen />);
    await screen.findByText('Privacy Policy');
    expect(screen.queryByText('More links')).toBeNull();
  });

  it('a toast (not a crash) when the device cannot open the link', async () => {
    Linking.openURL.mockRejectedValueOnce(new Error('no handler'));
    settingsResponse = { data: settingsBody([urlLink(A, 'Careers')]) };
    render(<LegalResourcesScreen />);
    fireEvent.press(await screen.findByText('Careers'));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
  });

  it('a settings failure does not hide the documents; it shows its own error and Retry', async () => {
    settingsResponse = () => { throw new Error('boom'); };
    render(<LegalResourcesScreen />);
    expect(await screen.findByText('Privacy Policy')).toBeTruthy();
    expect(await screen.findByTestId('links-error')).toBeTruthy();

    settingsResponse = { data: settingsBody([urlLink(A, 'Careers')]) };
    fireEvent.press(within(screen.getByTestId('links-error')).getByText('Retry'));
    expect(await screen.findByText('Careers')).toBeTruthy();
    expect(screen.queryByTestId('links-error')).toBeNull();
  });
});

describe('Legal & Resources — refresh', () => {
  it('pull-to-refresh shows changes the administrator made (rename, add, disable) without an app release', async () => {
    settingsResponse = { data: settingsBody([urlLink(A, 'Old name'), urlLink(B, 'To be disabled')]) };
    render(<LegalResourcesScreen />);
    await screen.findByText('Old name');

    settingsResponse = { data: settingsBody([urlLink(A, 'New name'), urlLink(C, 'Added link')]) };
    docsResponse = { data: docsBody(['privacy']) };
    const scroll = screen.UNSAFE_getByType(require('react-native').ScrollView);
    await act(async () => { await scroll.props.refreshControl.props.onRefresh(); });

    expect(await screen.findByText('New name')).toBeTruthy();
    expect(screen.getByText('Added link')).toBeTruthy();
    expect(screen.queryByText('Old name')).toBeNull();
    expect(screen.queryByText('To be disabled')).toBeNull();
    expect(screen.queryByText('Terms & Conditions')).toBeNull();
  });

  it('keeps the last good data (with a notice) when a refresh fails', async () => {
    settingsResponse = { data: settingsBody([urlLink(A, 'Careers')]) };
    render(<LegalResourcesScreen />);
    await screen.findByText('Careers');

    docsResponse = () => { throw new Error('offline'); };
    settingsResponse = () => { throw new Error('offline'); };
    const scroll = screen.UNSAFE_getByType(require('react-native').ScrollView);
    await act(async () => { await scroll.props.refreshControl.props.onRefresh(); });

    expect(await screen.findByTestId('docs-stale')).toBeTruthy();
    expect(screen.getByTestId('links-stale')).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText('Careers')).toBeTruthy();
  });

  it('a focus event inside the cache window makes no new requests; mounting makes exactly one per endpoint', async () => {
    render(<LegalResourcesScreen />);
    await screen.findByText('Privacy Policy');
    const urls = api.get.mock.calls.map(([u]) => u).sort();
    expect(urls).toEqual(['/documents', '/settings/public']);

    const onFocus = mockNav.addListener.mock.calls.find(([evt]) => evt === 'focus')[1];
    await act(async () => { onFocus(); });
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
