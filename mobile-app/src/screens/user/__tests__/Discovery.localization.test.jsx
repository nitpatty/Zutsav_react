import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import DashboardScreen from '../DashboardScreen';
import PoojaListScreen from '../PoojaListScreen';
import ExpandableText from '../../../components/shared/ExpandableText';
import ImageGallery from '../../../components/shared/ImageGallery';
import { useLanguageStore } from '../../../i18n/languageStore';

// F-08 Phase 3: home and pooja discovery. Only the UI-owned wording is translated here; pooja names, descriptions and
// festival names come from the backend already translated (?lang=) and must be shown exactly as received.
// The real API client is used (only its transport is replaced) so the ?lang= behaviour is the production one.

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ title }) => <Text>{`HEADER:${title}`}</Text> };
});
jest.mock('../../../components/NotificationBell', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

let calls;
const respond = (handler) => {
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params });
    const data = await handler(config);
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
};
const fail = (config) => { throw Object.assign(new Error('Request failed'), { config, response: { status: 500, data: {}, config } }); };

const hindiPooja = { _id: 'p1', name: 'गणेश पूजा', description: 'सुख और समृद्धि के लिए', price: 501, salePrice: 501, durationValue: 2, durationUnit: 'hours' };
const englishPooja = { ...hindiPooja, name: 'Ganesh Pooja', description: 'For prosperity' };

// Cold start. The very first render of the large Dashboard (SVG, gradients, animated views, icon set) and its data re-render
// cost ~2 s on an idle machine — about 20x any later test — and many times that under CPU contention. Left alone, that cost
// lands inside whichever test runs first (with --randomize, a different one each run) and can outlast the 1 s default wait of
// findByText even though the content does render. These throw-away renders pay it once, before any test's timed waits. The
// generous bounds are only a hook timeout / failure budget: they return as soon as the screen is ready.
beforeAll(async () => {
  calls = [];
  respond((config) => {
    if (config.url.startsWith('/poojas')) return { data: [englishPooja] };
    if (config.url.startsWith('/festivals')) return { data: [{ _id: 'f1', name: 'Diwali', date: '2099-01-01' }] };
    return { data: [] };
  });
  const dashboard = render(<DashboardScreen />);
  await screen.findByText('Ganesh Pooja', {}, { timeout: 60000 });
  dashboard.unmount();
  const list = render(<PoojaListScreen />);
  await screen.findByText('Ganesh Pooja', {}, { timeout: 60000 });
  list.unmount();
}, 120000);

beforeEach(() => { calls = []; mockNavigate.mockClear(); Toast.show.mockClear(); });

describe('DashboardScreen localization', () => {
  const dashboardData = (config) => {
    const lang = config.params && config.params.lang;
    if (config.url.startsWith('/poojas')) return { data: [lang === 'hi' ? hindiPooja : englishPooja] };
    if (config.url.startsWith('/festivals')) return { data: [{ _id: 'f1', name: lang === 'hi' ? 'दिवाली' : 'Diwali', date: '2099-01-01' }] };
    return { data: [] };
  };

  it('English: the original labels are unchanged', async () => {
    respond(dashboardData);
    render(<DashboardScreen />);
    expect(await screen.findByText('Available Poojas')).toBeTruthy();
    ['Book Pooja', 'Panchang', 'Temples', 'Live Poojas', 'Marketplace', 'Orders', 'AI Guru', 'Upcoming Festivals',
      '100% Trusted & Secure', 'Verified Pandits', 'Secure Payments', '24×7 Support', 'Stories & Spiritual Wisdom']
      .forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(screen.getByText('Book Now')).toBeTruthy();
    expect(screen.getByText('Ganesh Pooja')).toBeTruthy();
  });

  it('Hindi: labels are translated, server-localized content is shown as received, API values are untouched', async () => {
    await setLang('hi');
    respond(dashboardData);
    render(<DashboardScreen />);
    expect(await screen.findByText('उपलब्ध पूजाएँ')).toBeTruthy();
    expect(screen.getByText('पूजा बुक करें')).toBeTruthy();
    expect(screen.getAllByText('सभी देखें').length).toBeGreaterThan(0);
    expect(screen.getByText('100% भरोसेमंद और सुरक्षित')).toBeTruthy();
    expect(screen.queryByText('Available Poojas')).toBeNull();
    // server-translated entities arrive translated; the app does not alter them
    expect(screen.getByText('गणेश पूजा')).toBeTruthy();
    expect(screen.getByText('दिवाली')).toBeTruthy();
    // endpoints, queries and the ?lang parameter
    expect(calls.map((c) => c.url).sort()).toEqual(['/bookings/my?limit=3&sort=-createdAt', '/festivals?limit=5&upcoming=true', '/poojas?limit=6&isActive=true']);
    calls.forEach((c) => { expect(c.method).toBe('get'); expect(c.params).toEqual({ lang: 'hi' }); });
  });

  it('switching language reloads the dashboard once in the new language and leaves no old-language text', async () => {
    respond(dashboardData);
    render(<DashboardScreen />);
    expect(await screen.findByText('Ganesh Pooja')).toBeTruthy();
    expect(calls).toHaveLength(3);
    await setLang('hi');
    expect(await screen.findByText('गणेश पूजा')).toBeTruthy();
    expect(screen.queryByText('Ganesh Pooja')).toBeNull();
    expect(calls).toHaveLength(6);                       // exactly one more round of the same three GETs, no loop
  });

  it('shows the translated error toast when loading fails', async () => {
    await setLang('hi');
    respond(fail);
    render(<DashboardScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'डैशबोर्ड लोड नहीं हो सका' }));
  });

  it('tapping a quick action navigates to the same route in any language', async () => {
    await setLang('hi');
    respond(dashboardData);
    render(<DashboardScreen />);
    fireEvent.press(await screen.findByText('पूजा बुक करें'));
    expect(mockNavigate.mock.calls[0][0]).toBe('PoojaList');
  });
});

describe('PoojaListScreen localization', () => {
  const poojaData = (config) => {
    const lang = config.params && config.params.lang;
    const search = config.params && config.params.search;
    if (search === 'none') return { poojas: [] };
    return { poojas: [lang === 'hi' ? hindiPooja : englishPooja] };
  };

  it('English: title, placeholder and server content as before', async () => {
    respond(poojaData);
    render(<PoojaListScreen />);
    expect(await screen.findByText('Ganesh Pooja')).toBeTruthy();
    expect(screen.getByText('HEADER:Poojas')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search poojas…')).toBeTruthy();
    expect(calls[0]).toEqual({ method: 'get', url: '/poojas', params: { page: 1, limit: 12, isActive: true } });
  });

  it('Hindi: translated title/placeholder/Show More, server-localized pooja shown, stable query params', async () => {
    await setLang('hi');
    respond(poojaData);
    render(<PoojaListScreen />);
    expect(await screen.findByText('गणेश पूजा')).toBeTruthy();
    expect(screen.getByText('HEADER:पूजा')).toBeTruthy();
    expect(screen.getByPlaceholderText('पूजा खोजें...')).toBeTruthy();
    expect(calls[0].params).toEqual({ page: 1, limit: 12, isActive: true, lang: 'hi' });
  });

  it('search sends the raw term (not translated) and the Hindi empty state is shown', async () => {
    await setLang('hi');
    respond(poojaData);
    render(<PoojaListScreen />);
    await screen.findByText('गणेश पूजा');
    const input = screen.getByPlaceholderText('पूजा खोजें...');
    fireEvent.changeText(input, 'none');
    fireEvent(input, 'submitEditing');
    expect(await screen.findByText('कोई पूजा नहीं मिली।')).toBeTruthy();
    expect(calls[calls.length - 1].params).toEqual({ page: 1, limit: 12, isActive: true, search: 'none', lang: 'hi' });
  });

  it('error state: translated toast; selecting a pooja still navigates with the same ids', async () => {
    await setLang('hi');
    respond(fail);
    const first = render(<PoojaListScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'पूजाएँ लोड नहीं हो सकीं' }));
    first.unmount();

    respond(poojaData);
    render(<PoojaListScreen />);
    fireEvent.press(await screen.findByText('गणेश पूजा'));
    expect(mockNavigate).toHaveBeenCalledWith('BookingFlow', { poojaId: 'p1', pooja: expect.objectContaining({ _id: 'p1', name: 'गणेश पूजा' }) });
  });

  it('switching language refetches the list in the new language', async () => {
    respond(poojaData);
    render(<PoojaListScreen />);
    expect(await screen.findByText('Ganesh Pooja')).toBeTruthy();
    await setLang('hi');
    expect(await screen.findByText('गणेश पूजा')).toBeTruthy();
    expect(screen.queryByText('Ganesh Pooja')).toBeNull();
    expect(calls).toHaveLength(2);
  });
});

describe('shared components', () => {
  it('ExpandableText toggles with translated labels (English unchanged, Hindi translated)', async () => {
    const long = 'word '.repeat(200);
    const overflow = () => fireEvent(screen.getAllByText(long)[0], 'textLayout', { nativeEvent: { lines: [1, 2, 3, 4, 5] } });

    const english = render(<ExpandableText text={long} />);
    overflow();
    fireEvent.press(screen.getByText('Show More'));
    expect(screen.getByText('Show Less')).toBeTruthy();
    english.unmount();

    await setLang('hi');
    render(<ExpandableText text={long} />);
    overflow();
    expect(screen.getByText('और दिखाएँ')).toBeTruthy();
    fireEvent.press(screen.getByText('और दिखाएँ'));
    expect(screen.getByText('कम दिखाएँ')).toBeTruthy();
    expect(screen.queryByText('Show More')).toBeNull();
  });

  it('ImageGallery: empty text, per-photo and close labels are translated; counter unchanged', async () => {
    await setLang('hi');
    const first = render(<ImageGallery images={[]} />);
    expect(screen.getByText('गैलरी में कोई चित्र उपलब्ध नहीं')).toBeTruthy();
    first.unmount();
    render(<ImageGallery images={['a.jpg', 'b.jpg']} />);
    fireEvent.press(screen.getByLabelText('फ़ोटो 2 / 2 खोलें'));
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByLabelText('फ़ोटो व्यूअर बंद करें')).toBeTruthy();
  });

  it('ImageGallery: a caller-supplied emptyText still wins', () => {
    render(<ImageGallery images={[]} emptyText="Custom" />);
    expect(screen.getByText('Custom')).toBeTruthy();
  });
});
