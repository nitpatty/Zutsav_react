import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import SettingsScreen from '../SettingsScreen';
import { useAuthStore } from '../../../store/authStore';
import { useCartStore } from '../../../store/cartStore';
import { useThemeStore } from '../../../store/themeStore';
import { useLanguageStore, LANGUAGE_STORAGE_KEY } from '../../../i18n/languageStore';
import { __resetLanguagePreference } from '../../../i18n/languagePreference';
import { AVAILABLE_LOCALES, DICTIONARIES } from '../../../i18n/locales';

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../utils/socket', () => ({ disconnectSocket: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

const hi = DICTIONARIES.hi;
const ta = DICTIONARIES.ta;
const radio = (native) => screen.getByLabelText(new RegExp(`^${native} \\(`));
const selected = (el) => el.props.accessibilityState?.selected === true;
const signIn = () => useAuthStore.setState({ token: 'tok', user: { _id: 'u1', name: 'Asha', preferredLanguage: 'en' }, ready: true });
const patches = () => api.patch.mock.calls.filter(([u]) => u === '/auth/preferred-language');

beforeEach(() => {
  api.patch.mockReset(); api.patch.mockResolvedValue({ data: { success: true } });
  Toast.show.mockClear();
  __resetLanguagePreference();
  useAuthStore.setState({ user: null, token: null, ready: true, loading: false });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('language picker', () => {
  it('lists exactly the languages that have a dictionary, by native name (not a hard-coded list)', () => {
    render(<SettingsScreen />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(AVAILABLE_LOCALES.length);
    AVAILABLE_LOCALES.forEach((l) => expect(screen.getByLabelText(`${l.native} (${l.name})`)).toBeTruthy());
    expect(screen.getByText('हिन्दी')).toBeTruthy();
    expect(screen.getByText('தமிழ்')).toBeTruthy();
  });

  it('marks the language in effect as selected (English by default)', () => {
    render(<SettingsScreen />);
    expect(selected(radio('English'))).toBe(true);
    expect(selected(radio('हिन्दी'))).toBe(false);
  });

  it('keeps the existing Settings behaviour and labels in English', () => {
    render(<SettingsScreen />);
    ['Appearance', 'App Language', 'Account', 'Change Password', 'Notifications', 'Delete Account', 'Logout', 'Legal & Resources', 'About', 'Version',
      'Sacred Spiritual', 'Modern Executive', 'Dark Mode', 'Minimal White'].forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Legal & Resources')).toBeTruthy();
  });

  it('switching to Hindi re-renders the labels immediately, moves the selection, and persists on the device', async () => {
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('हिन्दी')); });
    expect(screen.getByText(hi.settings.appearance)).toBeTruthy();
    expect(screen.getByText(hi.settings.language)).toBeTruthy();
    expect(screen.getByText(hi.settings.changePassword)).toBeTruthy();
    expect(screen.getByText(hi.settings.themeDark)).toBeTruthy();
    expect(screen.getByLabelText(hi.settings.legalResources)).toBeTruthy();
    expect(screen.queryByText('Appearance')).toBeNull();
    expect(selected(radio('हिन्दी'))).toBe(true);
    expect(selected(radio('English'))).toBe(false);
    expect(await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY)).toBe('hi');
    expect(useLanguageStore.getState().language).toBe('hi');
  });

  it('every available language can be selected and renders its own title', async () => {
    render(<SettingsScreen />);
    for (const l of AVAILABLE_LOCALES) {
      await act(async () => { fireEvent.press(radio(l.native)); });
      expect(screen.getByText(DICTIONARIES[l.code].settings.appearance)).toBeTruthy();
      expect(selected(radio(l.native))).toBe(true);
    }
  });

  it('a guest makes no account request', async () => {
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('हिन्दी')); });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('a signed-in user syncs the preference once, with the documented body', async () => {
    signIn();
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('हिन्दी')); });
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual(['/auth/preferred-language', { preferredLanguage: 'hi' }]);
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('re-selecting the language already in effect sends nothing', async () => {
    signIn();
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('English')); });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('rapid taps do not stack requests: one in flight at a time, the last choice is what the server gets', async () => {
    signIn();
    const resolvers = [];
    api.patch.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));
    render(<SettingsScreen />);
    await act(async () => {
      fireEvent.press(radio('हिन्दी'));
      fireEvent.press(radio('தமிழ்'));
      fireEvent.press(radio('मराठी'));
    });
    expect(patches().length).toBeLessThanOrEqual(1);
    await act(async () => { resolvers[0]?.({ data: {} }); await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { resolvers[1]?.({ data: {} }); await new Promise((r) => setTimeout(r, 0)); });
    expect(patches().length).toBeLessThanOrEqual(2);
    expect(patches()[patches().length - 1][1]).toEqual({ preferredLanguage: 'mr' });
    expect(useLanguageStore.getState().language).toBe('mr');
  });

  it('when the account sync fails: the language still applies, a localized non-blocking notice appears, the session survives', async () => {
    signIn();
    api.patch.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('தமிழ்')); });
    await waitFor(() => expect(Toast.show).toHaveBeenCalledTimes(1));
    expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: ta.settings.languageSaveFailed }); // in the NEW language
    expect(useLanguageStore.getState().language).toBe('ta');
    expect(screen.getByText(ta.settings.appearance)).toBeTruthy();
    expect(selected(radio('தமிழ்'))).toBe(true);
    expect(useAuthStore.getState().token).toBe('tok');
    expect(useAuthStore.getState().user.preferredLanguage).toBe('en'); // not pretended
  });

  it('a 401 on the preference request does not clear the session from this screen', async () => {
    signIn();
    api.patch.mockRejectedValue({ response: { status: 401, data: { message: 'Not authorized' } } });
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('हिन्दी')); });
    await waitFor(() => expect(Toast.show).toHaveBeenCalled());
    expect(useAuthStore.getState().token).toBe('tok'); // expiry is the shared API client's job, never this screen's
  });
});

describe('switching language leaves unrelated state alone', () => {
  it('keeps the cart, the theme and the signed-in session', async () => {
    signIn();
    useCartStore.setState({ items: [{ productId: 'p1', variantId: 'v1', name: 'Ghee', price: 100, quantity: 2 }] });
    const themeBefore = useThemeStore.getState().themeId;
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('हिन्दी')); });
    expect(useCartStore.getState().items).toEqual([{ productId: 'p1', variantId: 'v1', name: 'Ghee', price: 100, quantity: 2 }]);
    expect(useThemeStore.getState().themeId).toBe(themeBefore);
    expect(useAuthStore.getState().token).toBe('tok');
    expect(api.post).not.toHaveBeenCalled(); // nothing else is triggered (no payment/booking/logout calls)
  });

  it('theme selection still works, with translated labels', async () => {
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('हिन्दी')); });
    fireEvent.press(screen.getByText(hi.settings.themeDark));
    await waitFor(() => expect(useThemeStore.getState().themeId).toBe('dark')); // setTheme persists first, then updates
  });

  it('the logout confirmation is localized and still logs out through the same action', async () => {
    signIn();
    render(<SettingsScreen />);
    await act(async () => { fireEvent.press(radio('हिन्दी')); });
    fireEvent.press(screen.getAllByText(hi.settings.logout).slice(-1)[0]);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = Alert.alert.mock.calls[0];
    expect(title).toBe(hi.settings.logoutTitle);
    expect(message).toBe(hi.settings.logoutConfirm);
    expect(buttons.map((b) => b.text)).toEqual([DICTIONARIES.hi.common.cancel, hi.settings.logout]);
    expect(buttons[1].style).toBe('destructive');
    expect(typeof buttons[1].onPress).toBe('function');
  });
});
