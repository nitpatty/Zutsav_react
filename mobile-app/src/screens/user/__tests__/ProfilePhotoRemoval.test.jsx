import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import ProfileScreen from '../ProfileScreen';
import PanditProfileScreen from '../../pandit/PanditProfileScreen';
import { useAuthStore } from '../../../store/authStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';

// Day 29 (issue F). The website's "profile removal" is ProfilePhoto.jsx's "Remove": confirm ("Remove profile photo?") and then
// DELETE the photo endpoint — /users/profile/photo for customers, /pandits/me/photo for Pandits (both already exist on the backend).
// It is NOT account deletion (that stays the separate OTP flow) and NOT the KYC document choice. These tests pin the mobile
// equivalent: nothing is sent on the first tap, Cancel sends nothing, Confirm sends exactly one DELETE, a double tap cannot send two,
// and a failure leaves the photo and the button as they were.

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  imageUrl: (p) => p,
  setSessionExpiredHandler: jest.fn(),
}));
const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useFocusEffect: (cb) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }) => children }));
jest.mock('../../../utils/socket', () => ({ disconnectSocket: jest.fn() }));
jest.mock('../../../components/NotificationBell', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/pandit/StickyActionBar', () => ({ useTabBarClearance: () => 0 }));
jest.mock('../../../hooks/useOnReconnect', () => ({ __esModule: true, default: jest.fn() }));   // NetInfo is not under test here

const hi = getTranslator('hi');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const pressedButtons = () => Alert.alert.mock.calls[0][2];
const confirmButton = () => pressedButtons().find((b) => b.style === 'destructive');
const cancelButton = () => pressedButtons().find((b) => b.style === 'cancel');

let refreshUser;
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset && f.mockReset());
  Toast.show.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  refreshUser = jest.fn().mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('customer profile — remove photo', () => {
  const asCustomer = (over = {}) => useAuthStore.setState({
    user: { _id: 'u1', name: 'Asha', phone: '9111111111', email: 'asha@example.invalid', role: 'user', profilePhoto: '/uploads/profiles/a.jpg', ...over },
    refreshUser,
  });

  it('is offered only when there is a photo', () => {
    asCustomer({ profilePhoto: null });
    render(<ProfileScreen />);
    expect(screen.queryByLabelText('Remove photo')).toBeNull();
  });

  it('the first tap only asks: it explains the consequence and sends nothing', () => {
    asCustomer();
    render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText('Remove photo'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert.mock.calls[0][0]).toBe('Remove profile photo?');
    expect(Alert.alert.mock.calls[0][1]).toMatch(/removed from your account/);
    expect(api.delete).not.toHaveBeenCalled();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('Cancel sends nothing and changes nothing', () => {
    asCustomer();
    render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText('Remove photo'));
    expect(cancelButton().onPress).toBeUndefined();          // the system dismisses the dialog; no handler runs
    expect(api.delete).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Remove photo')).toBeTruthy();
  });

  it('Confirm sends exactly one DELETE to the existing endpoint, refreshes the profile and reports success', async () => {
    asCustomer();
    api.delete.mockResolvedValue({ data: { success: true } });
    render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText('Remove photo'));
    await act(async () => { await confirmButton().onPress(); });
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/users/profile/photo');
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Photo removed' });
    expect(api.post).not.toHaveBeenCalled();                 // nothing but the photo DELETE: not the account-deletion endpoints
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('a double tap while the request is in flight cannot send a second request', async () => {
    asCustomer();
    let release;
    api.delete.mockReturnValue(new Promise((r) => { release = r; }));
    render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText('Remove photo'));
    const { onPress } = confirmButton();
    let first; let second;
    await act(async () => { first = onPress(); second = onPress(); });
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Remove photo').props.accessibilityState).toMatchObject({ disabled: true });   // loading state
    await act(async () => { release({ data: { success: true } }); await first; await second; });
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Remove photo').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('a failure shows the error, does not refresh, and leaves the button usable', async () => {
    asCustomer();
    api.delete.mockRejectedValue(new Error('boom'));
    render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText('Remove photo'));
    await act(async () => { await confirmButton().onPress(); });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Could not remove the photo. Please try again.' });
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Remove photo').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('the photo is removed even if only the profile re-fetch fails (reported honestly, not as a failure)', async () => {
    asCustomer();
    refreshUser.mockRejectedValue(new Error('offline'));
    api.delete.mockResolvedValue({ data: { success: true } });
    render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText('Remove photo'));
    await act(async () => { await confirmButton().onPress(); });
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'info', text1: 'Photo removed' }));
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('Hindi: the label, dialog and toasts are translated; the endpoint is the same', async () => {
    await setLang('hi');
    asCustomer();
    api.delete.mockResolvedValue({ data: { success: true } });
    render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText(hi('profile.removePhoto')));
    expect(Alert.alert.mock.calls[0][0]).toBe(hi('profile.removePhotoTitle'));
    expect(Alert.alert.mock.calls[0][1]).toBe(hi('profile.removePhotoConfirm'));
    expect(confirmButton().text).toBe(hi('profile.removePhoto'));
    await act(async () => { await confirmButton().onPress(); });
    expect(api.delete).toHaveBeenCalledWith('/users/profile/photo');
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('profile.photoRemoved') });
  });
});

describe('Pandit profile — remove photo', () => {
  const pandit = (over = {}) => ({
    _id: 'p1', name: 'Pt. Sharma', phone: '9222222222', kycStatus: 'approved', profilePhoto: '/uploads/profiles/p.jpg', rating: 4.5, totalReviews: 3, ...over,
  });
  const open = async (over) => {
    api.get.mockResolvedValue({ data: { pandit: pandit(over) } });
    render(<PanditProfileScreen />);
    await screen.findByText('Pt. Sharma');
  };

  it('is offered only when there is a photo', async () => {
    await open({ profilePhoto: null });
    expect(screen.queryByLabelText('Remove photo')).toBeNull();
  });

  it('the first tap only asks (and says this removes only the photo); Cancel sends nothing', async () => {
    await open();
    fireEvent.press(screen.getByLabelText('Remove photo'));
    expect(Alert.alert.mock.calls[0][0]).toBe('Remove profile photo?');
    expect(Alert.alert.mock.calls[0][1]).toMatch(/removed from your Pandit profile/);
    expect(api.delete).not.toHaveBeenCalled();
    expect(cancelButton().onPress).toBeUndefined();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('Confirm sends exactly one DELETE /pandits/me/photo, shows the placeholder and reports success; nothing else is written', async () => {
    await open();
    api.delete.mockResolvedValue({ data: { success: true, pandit: pandit({ profilePhoto: null }) } });
    fireEvent.press(screen.getByLabelText('Remove photo'));
    await act(async () => { await confirmButton().onPress(); });
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/pandits/me/photo');
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Photo removed' });
    expect(screen.queryByLabelText('Remove photo')).toBeNull();     // no photo any more → no remove control
    expect(screen.getByText('P')).toBeTruthy();                     // initial placeholder
    expect(api.post).not.toHaveBeenCalled();                        // not the KYC decision, not an account/OTP endpoint
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('a double tap cannot send a second request; the control is disabled while it runs', async () => {
    await open();
    let release;
    api.delete.mockReturnValue(new Promise((r) => { release = r; }));
    fireEvent.press(screen.getByLabelText('Remove photo'));
    const { onPress } = confirmButton();
    let first; let second;
    await act(async () => { first = onPress(); second = onPress(); });
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Remove photo').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => { release({ data: { success: true, pandit: pandit({ profilePhoto: null }) } }); await first; await second; });
    expect(api.delete).toHaveBeenCalledTimes(1);
  });

  it('a failure keeps the photo and the control and shows the website\'s message', async () => {
    await open();
    api.delete.mockRejectedValue(new Error('boom'));
    fireEvent.press(screen.getByLabelText('Remove photo'));
    await act(async () => { await confirmButton().onPress(); });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Failed to remove photo' });
    expect(screen.getByLabelText('Remove photo').props.accessibilityState).toMatchObject({ disabled: false });
  });
});
