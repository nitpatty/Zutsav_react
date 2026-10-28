import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useNotificationStore } from '../../../store/notificationStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import NotificationsScreen from '../NotificationsScreen';

// F-08 Phase 7: Notifications. The screen's own wording is translated; the notification title/message arrive already
// translated from the backend (GET /notifications?lang=) and are shown as received. Ids, read flags, the mark-read /
// delete / clear requests and the tap navigation are unchanged, and a language switch never writes anything.
// The real API client and the real store are used (only the transport is replaced).

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text, View } = require('react-native');
  return { __esModule: true, default: ({ title, right }) => <View><Text>{`HEADER:${title}`}</Text>{right}</View> };
});
const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const hi = getTranslator('hi');
const ta = getTranslator('ta');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

let calls;
const reply = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
const langOf = (config) => (config.params && config.params.lang) || 'en';
const TEXT = {
  en: { title: 'Booking confirmed', message: 'Your pooja is booked' },
  hi: { title: 'बुकिंग की पुष्टि', message: 'आपकी पूजा बुक हो गई है' },
  ta: { title: 'முன்பதிவு உறுதி', message: 'உங்கள் பூஜை முன்பதிவு செய்யப்பட்டது' },
};
const docs = (lang) => [
  { _id: 'n1', ...TEXT[lang], isRead: false, type: 'booking_created', data: { bookingNumber: 'BK-1001' }, createdAt: new Date().toISOString() },
  { _id: 'n2', title: `read-${lang}`, message: `second-${lang}`, isRead: true, type: 'general', data: {}, createdAt: new Date().toISOString() },
];
const serve = (handler) => {
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params, data: config.data });
    return reply(config, await handler(config));
  };
};
const defaultServer = (config) => {
  if (config.method === 'get' && config.url.startsWith('/notifications')) return { notifications: docs(langOf(config)) };
  if (config.url.startsWith('/bookings/by-number/')) return { bookingId: 'b-real-id' };
  return { success: true };
};
const writes = () => calls.filter((c) => c.method !== 'get');

beforeEach(() => {
  calls = []; mockNav.navigate.mockClear(); Toast.show.mockClear();
  useNotificationStore.setState({ notifications: [], unreadCount: 2, loading: false });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  serve(defaultServer);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('NotificationsScreen localization', () => {
  it('English is unchanged', async () => {
    render(<NotificationsScreen />);
    expect(await screen.findByText('Booking confirmed')).toBeTruthy();
    expect(screen.getByText('HEADER:Notifications')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search notifications…')).toBeTruthy();
    expect(calls[0]).toMatchObject({ method: 'get', url: '/notifications?limit=50' });
    expect(calls[0].params).toBeUndefined();                              // English sends no lang
  });

  it('Hindi: UI wording is translated, the request carries lang=hi, and the server-translated text is shown exactly as received', async () => {
    await setLang('hi');
    render(<NotificationsScreen />);
    expect(await screen.findByText(TEXT.hi.title)).toBeTruthy();
    expect(screen.getByText(TEXT.hi.message)).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('settings.notifications')}`)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi('notifications.searchPlaceholder'))).toBeTruthy();
    expect(calls[0]).toMatchObject({ method: 'get', url: '/notifications?limit=50', params: { lang: 'hi' } });
    expect(screen.getByLabelText(hi('notifications.markAllRead'))).toBeTruthy();
    expect(screen.getByLabelText(hi('notifications.clearAllLabel'))).toBeTruthy();
    expect(screen.getAllByLabelText(hi('notifications.deleteLabel'))).toHaveLength(2);
  });

  it('empty and no-match states are translated (Tamil)', async () => {
    await setLang('ta');
    serve((config) => (config.method === 'get' ? { notifications: [] } : { success: true }));
    const empty = render(<NotificationsScreen />);
    expect(await screen.findByText(ta('notifications.empty'))).toBeTruthy();
    empty.unmount();

    serve(defaultServer);
    useNotificationStore.setState({ notifications: [] });
    render(<NotificationsScreen />);
    await screen.findByText(TEXT.ta.title);
    fireEvent.changeText(screen.getByPlaceholderText(ta('notifications.searchPlaceholder')), 'zzzz-no-match');
    expect(screen.getByText(ta('notifications.emptyMatch'))).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText(ta('notifications.searchPlaceholder')), 'முன்பதிவு');
    expect(screen.getByText(TEXT.ta.title)).toBeTruthy();                // search still works over the server-translated text
  });

  it('tapping an unread notification still marks THAT id read (once) and navigates through the same lookup', async () => {
    await setLang('hi');
    render(<NotificationsScreen />);
    fireEvent.press(await screen.findByText(TEXT.hi.title));
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('BookingsTab', { screen: 'BookingDetail', params: { bookingId: 'b-real-id' } }));
    expect(calls.filter((c) => c.method === 'patch').map((c) => c.url)).toEqual(['/notifications/n1/read']);
    expect(calls.some((c) => c.url === '/bookings/by-number/BK-1001')).toBe(true);
    await waitFor(() => expect(useNotificationStore.getState().notifications.find((n) => n._id === 'n1').isRead).toBe(true));
    expect(useNotificationStore.getState().notifications.find((n) => n._id === 'n2').isRead).toBe(true);   // untouched
  });

  it('a read notification is not marked again; a role-specific handler still takes over', async () => {
    const handler = jest.fn(async () => {});
    render(<NotificationsScreen customHandlers={{ general: handler }} />);
    fireEvent.press(await screen.findByText('read-en'));
    await waitFor(() => expect(handler).toHaveBeenCalledWith({}, mockNav));
    expect(writes()).toHaveLength(0);
  });

  it('mark-all-read, delete and clear-all keep their requests; the confirmation and failure message are translated', async () => {
    await setLang('hi');
    render(<NotificationsScreen />);
    await screen.findByText(TEXT.hi.title);
    fireEvent.press(screen.getByLabelText(hi('notifications.markAllRead')));
    await waitFor(() => expect(calls.some((c) => c.method === 'patch' && c.url === '/notifications/read-all')).toBe(true));

    fireEvent.press(screen.getAllByLabelText(hi('notifications.deleteLabel'))[1]);
    await waitFor(() => expect(calls.some((c) => c.method === 'delete' && c.url === '/notifications/n2')).toBe(true));

    fireEvent.press(screen.getByLabelText(hi('notifications.clearAllLabel')));
    const [title, message, buttons] = Alert.alert.mock.calls[0];
    expect(title).toBe(hi('notifications.clearTitle'));
    expect(message).toBe(hi('notifications.clearMessage'));
    expect(buttons.map((b) => b.text)).toEqual([hi('common.cancel'), hi('notifications.clearConfirm')]);
    serve((config) => { if (config.url === '/notifications/clear-all') throw Object.assign(new Error('x'), { config, response: { status: 500, data: {}, config } }); return defaultServer(config); });
    await act(async () => { buttons[1].onPress(); await new Promise((r) => setTimeout(r, 20)); });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('notifications.clearFailed') });
    expect(calls.some((c) => c.method === 'delete' && c.url === '/notifications/clear-all')).toBe(true);
  });

  it('a language switch refetches the list once in the new language and writes NOTHING (no read marks, no deletes)', async () => {
    render(<NotificationsScreen />);
    expect(await screen.findByText(TEXT.en.title)).toBeTruthy();
    expect(calls.filter((c) => c.method === 'get')).toHaveLength(1);
    await setLang('hi');
    expect(await screen.findByText(TEXT.hi.title)).toBeTruthy();
    expect(screen.queryByText(TEXT.en.title)).toBeNull();
    const gets = calls.filter((c) => c.method === 'get' && c.url.startsWith('/notifications?'));
    expect(gets).toHaveLength(2);
    expect(gets[1].params).toEqual({ lang: 'hi' });
    expect(writes()).toHaveLength(0);
    const list = useNotificationStore.getState().notifications;
    expect(list.map((n) => [n._id, n.isRead])).toEqual([['n1', false], ['n2', true]]);   // ids and read flags exactly as served
  });

  it('a slow reply for a superseded language cannot overwrite the newer one', async () => {
    const pending = {};
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ method: config.method, url: config.url, params: config.params });
      const lang = langOf(config);
      const done = () => resolve(reply(config, { notifications: docs(lang) }));
      if (lang === 'en') done(); else pending[lang] = done;
    });
    render(<NotificationsScreen />);
    await screen.findByText(TEXT.en.title);
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText(TEXT.ta.title)).toBeTruthy();
    await act(async () => { pending.hi(); await new Promise((r) => setTimeout(r, 10)); });   // arrives last: ignored
    expect(screen.getByText(TEXT.ta.title)).toBeTruthy();
    expect(screen.queryByText(TEXT.hi.title)).toBeNull();
  });

  it('a failed load leaves the screen usable and pull-to-refresh recovers it', async () => {
    serve((config) => { if (config.method === 'get') throw Object.assign(new Error('offline'), { config }); return { success: true }; });
    const { UNSAFE_getByType } = render(<NotificationsScreen />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(await screen.findByText('No notifications yet')).toBeTruthy();
    serve(defaultServer);
    await act(async () => { UNSAFE_getByType(RefreshControl).props.onRefresh(); await new Promise((r) => setTimeout(r, 20)); });
    expect(await screen.findByText(TEXT.en.title)).toBeTruthy();
  });

  it('account isolation: after the store is reset (logout) a reply still in flight cannot repopulate the list', async () => {
    let release;
    api.defaults.adapter = (config) => new Promise((resolve) => { release = () => resolve(reply(config, { notifications: docs('en') })); });
    render(<NotificationsScreen />);
    await waitFor(() => expect(release).toBeDefined());
    act(() => { useNotificationStore.getState().reset(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 10)); });
    expect(useNotificationStore.getState().notifications).toEqual([]);
    expect(screen.queryByText(TEXT.en.title)).toBeNull();
  });
});
