import React from 'react';
import { Alert, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import api from '../../../api/axios';
import ProfileScreen from '../ProfileScreen';
import PersonalInfoScreen from '../PersonalInfoScreen';
import ChangePasswordScreen from '../ChangePasswordScreen';
import AddressBookScreen from '../AddressBookScreen';
import { useAuthStore } from '../../../store/authStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { DICTIONARIES } from '../../../i18n/locales';

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  imageUrl: (p) => p,
  setSessionExpiredHandler: jest.fn(),
}));
const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }) => children }));
jest.mock('../../../utils/socket', () => ({ disconnectSocket: jest.fn() }));
jest.mock('../../../components/NotificationBell', () => ({ __esModule: true, default: () => null }));
// Render the header title so screen titles can be asserted.
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: ({ title }) => require('react').createElement(require('react-native').Text, { testID: 'header-title' }, title) }));
jest.mock('../../../services/geocodingService', () => ({ reverseGeocodeLocation: jest.fn(), autocompletePlaces: jest.fn(), clearGeocodingCache: jest.fn() }));
jest.mock('../../../hooks/usePincodeLookup', () => ({ __esModule: true, default: () => ({ loading: false, data: null, error: null }) }));
jest.mock('../../../hooks/useAddresses', () => ({
  __esModule: true,
  default: () => ({ addresses: [], loading: false, addAddress: jest.fn(), updateAddress: jest.fn(), deleteAddress: jest.fn() }),
}));
let mockSelection = null;
let mockMapPoint = null;
let mockMapSource = 'gps';
jest.mock('../../../components/shared/LocationSearch', () => {
  const R = require('react');
  const { TouchableOpacity, Text: T } = require('react-native');
  return { __esModule: true, default: ({ onSelect }) => R.createElement(TouchableOpacity, { testID: 'search-pick', onPress: () => onSelect(mockSelection) }, R.createElement(T, null, 'search-pick')) };
});
jest.mock('../../../components/shared/MapPicker', () => {
  const R = require('react');
  const { TouchableOpacity, Text: T } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, onConfirm }) => (visible
      ? R.createElement(TouchableOpacity, { testID: 'picker-confirm', onPress: () => onConfirm(mockMapPoint, { source: mockMapSource }) }, R.createElement(T, null, 'picker-confirm'))
      : null),
  };
});

const hi = DICTIONARIES.hi;
const ta = DICTIONARIES.ta;
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const title = () => screen.getByTestId('header-title').props.children;

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.patch.mockReset();
  Toast.show.mockClear();
  Object.values(mockNav).forEach((f) => f.mockClear());
  useAuthStore.setState({ user: null, token: null, ready: true });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('ProfileScreen', () => {
  const user = { _id: 'u1', name: 'Asha Test', phone: '9876543210', email: 'asha@example.invalid', role: 'user' };
  const mount = (over = {}) => { useAuthStore.setState({ user: { ...user, ...over }, logout: jest.fn(), refreshUser: jest.fn() }); return render(<ProfileScreen />); };

  it('English is unchanged', () => {
    mount();
    expect(title()).toBe('Profile');
    ['Edit Profile', 'Personal', 'Personal Information', 'Saved Addresses', 'Family Members', 'Change Password', 'Activity', 'My Orders', 'My Bookings',
      'My Referrals', 'Wallet', 'Notifications', 'Preferences', 'Settings', 'Privacy & Security', 'Delete Account', 'Devotee']
      .forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
  });

  it('renders every section, menu item and the role badge in Hindi; personal data is untouched', async () => {
    await setLang('hi');
    mount();
    expect(title()).toBe(hi.nav.profile);
    [hi.profile.editProfile, hi.profile.sectionPersonal, hi.profile.personalInfo, hi.profile.savedAddresses, hi.profile.familyMembers,
      hi.settings.changePassword, hi.profile.sectionActivity, hi.profile.myOrders, hi.profile.myBookings, hi.profile.myReferrals, hi.profile.wallet,
      hi.settings.notifications, hi.profile.sectionPreferences, hi.settings.title, hi.profile.sectionPrivacy, hi.settings.deleteAccount, hi.auth.devotee]
      .forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    expect(screen.getByText('Asha Test')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('asha@example.invalid')).toBeTruthy();
  });

  it('the role badge follows the role, not the language ("pandit" stays a role value)', async () => {
    await setLang('hi');
    mount({ role: 'pandit' });
    expect(screen.getByText(hi.auth.pandit)).toBeTruthy();
    expect(screen.queryByText(hi.auth.devotee)).toBeNull();
  });

  it('menu items still navigate to the same routes in Hindi', async () => {
    await setLang('hi');
    mount();
    fireEvent.press(screen.getByText(hi.profile.personalInfo));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('PersonalInfo');
    fireEvent.press(screen.getByText(hi.profile.savedAddresses));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('AddressBook');
    fireEvent.press(screen.getByText(hi.profile.myOrders));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('ShopTab', { screen: 'Orders' });
    fireEvent.press(screen.getByText(hi.profile.myReferrals));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('MyReferrals');
    fireEvent.press(screen.getByText(hi.profile.wallet));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('Wallet');
    fireEvent.press(screen.getByText(hi.settings.deleteAccount));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('DeleteAccount');
  });

  it('switching language while the screen is open re-renders it in place', async () => {
    mount();
    expect(screen.getByText('Saved Addresses')).toBeTruthy();
    await setLang('ta');
    expect(screen.getByText(ta.profile.savedAddresses)).toBeTruthy();
    expect(title()).toBe(ta.nav.profile);
  });

  it('gallery permission denied and the upload outcomes are localized', async () => {
    await setLang('hi');
    mount();
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await act(async () => { fireEvent.press(screen.getByText('A')); });   // avatar initial of "Asha"
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.profile.galleryDenied });

    Toast.show.mockClear();
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///a.jpg' }] });
    api.post.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(screen.getByText('A')); });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.profile.uploadFailed });

    Toast.show.mockClear();
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///a.jpg' }] });
    api.post.mockResolvedValueOnce({ data: {} });
    await act(async () => { fireEvent.press(screen.getByText('A')); });
    expect(api.post).toHaveBeenLastCalledWith('/users/profile/photo', expect.anything(), { headers: { 'Content-Type': 'multipart/form-data' } });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.profile.photoUpdated });
  });

  it('the Logout button and its confirmation are localized, and confirming still calls the same logout action', async () => {
    await setLang('hi');
    const logout = jest.fn();
    useAuthStore.setState({ user, logout, refreshUser: jest.fn() });
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText(hi.settings.logout));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [alertTitle, message, buttons] = Alert.alert.mock.calls[0];
    expect(alertTitle).toBe(hi.settings.logout);
    expect(message).toBe(hi.profile.logoutConfirm);
    expect(buttons.map((b) => b.text)).toEqual([hi.common.cancel, hi.settings.logout]);
    expect(buttons[1].style).toBe('destructive');
    expect(logout).not.toHaveBeenCalled();     // nothing happens until the user confirms
    buttons[1].onPress();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('English Logout button is unchanged', () => {
    mount();
    expect(screen.getByText('Logout')).toBeTruthy();
  });

  it('opening the screen and switching language sends no request and does not log out', async () => {
    const logout = jest.fn();
    useAuthStore.setState({ user, logout, refreshUser: jest.fn() });
    render(<ProfileScreen />);
    await setLang('hi');
    expect(logout).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('PersonalInfoScreen', () => {
  const SAVED = { latitude: 19.076, longitude: 72.8777 };
  const baseUser = (over = {}) => ({
    name: 'Asha Test', email: 'asha@example.invalid', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City',
    address: '12 MG Road, Fort', ...SAVED, ...over,
  });
  const PUNE = { label: 'Koregaon Park, Pune, Maharashtra, India', lat: 18.5362, lng: 73.8939, placeId: 'ola:kp', components: { pincode: '411001', city: 'Pune', state: 'Maharashtra', district: 'Pune' } };
  let updateUser;
  const mountWith = (user = baseUser()) => {
    updateUser = jest.fn().mockResolvedValue({});
    useAuthStore.setState({ user, updateUser });
    return render(<PersonalInfoScreen />);
  };
  const saved = () => updateUser.mock.calls[updateUser.mock.calls.length - 1][0];
  const lang = () => DICTIONARIES[useLanguageStore.getState().language];
  const save = async () => { fireEvent.press(screen.getByText(lang().profile.saveChanges)); await waitFor(() => expect(updateUser).toHaveBeenCalled()); };

  it('English is unchanged', () => {
    mountWith();
    expect(title()).toBe('Personal Information');
    ['Full Name *', 'Email', 'Pincode', 'City', 'District', 'State', 'Search Location', 'Complete Address', 'Save Changes'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByPlaceholderText('Your full name')).toBeTruthy();
    expect(screen.getByPlaceholderText('House no., street, area…')).toBeTruthy();
    expect(screen.getByText('📍 19.07600, 72.87770 · Saved')).toBeTruthy();
  });

  it('renders in Hindi (title, labels, placeholders, pin label with the exact coordinates)', async () => {
    await setLang('hi');
    mountWith();
    expect(title()).toBe(hi.profile.personalInfo);
    [hi.profile.fullNameRequired, hi.auth.channelEmail, hi.address.pincode, hi.address.city, hi.address.district, hi.address.state,
      hi.location.searchLabel, hi.profile.completeAddress, hi.profile.saveChanges].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByPlaceholderText(hi.auth.fullNamePlaceholder)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi.address.placeholder)).toBeTruthy();
    expect(screen.getByText(`📍 19.07600, 72.87770 · ${hi.location.pinSaved}`)).toBeTruthy();
  });

  it('switching language keeps what was typed, the pin and the form values', async () => {
    mountWith();
    fireEvent.changeText(screen.getByPlaceholderText('Your full name'), 'Asha Renamed');
    fireEvent.changeText(screen.getByPlaceholderText('House no., street, area…'), '14 MG Road, Fort');   // marks the pin stale
    await setLang('hi');
    expect(screen.getByDisplayValue('Asha Renamed')).toBeTruthy();
    expect(screen.getByDisplayValue('14 MG Road, Fort')).toBeTruthy();
    expect(screen.getByTestId('stale-pin-notice').props.children).toBe(hi.location.stalePinNotice);
    await save();
    expect(saved()).toMatchObject({ name: 'Asha Renamed', address: '14 MG Road, Fort', latitude: null, longitude: null });
  });

  it('the saved payload is byte-for-byte the same in English and in Hindi (including the coordinate pair)', async () => {
    mountWith();
    fireEvent.changeText(screen.getByPlaceholderText('Your full name'), ' Asha  ');
    await save();
    const english = saved();
    expect(english).toMatchObject({ name: 'Asha', latitude: 19.076, longitude: 72.8777 });
    cleanupAll();

    await setLang('hi');
    mountWith();
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.fullNamePlaceholder), ' Asha  ');
    await save();
    expect(saved()).toEqual(english);
  });

  it('choosing a search result in Hindi attaches that place’s coordinates and fills the fields unchanged', async () => {
    await setLang('hi');
    mountWith(baseUser({ address: '' }));
    mockSelection = PUNE;
    fireEvent.press(screen.getByTestId('search-pick'));
    expect(screen.getByText(`📍 18.53620, 73.89390 · ${hi.location.pinSearch}`)).toBeTruthy();
    await save();
    expect(saved()).toMatchObject({ address: PUNE.label, pincode: '411001', city: 'Pune', state: 'Maharashtra', latitude: 18.5362, longitude: 73.8939 });
  });

  it('a GPS pin is labelled GPS and saved as the same coordinate pair', async () => {
    await setLang('hi');
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    mockMapPoint = { latitude: 28.6139, longitude: 77.209 }; mockMapSource = 'gps';
    // no pin yet → the button shows the call to action (Android here: "use current location")
    fireEvent.press(screen.getByText(new RegExp(`📍|${hi.location.pinPick}|${hi.location.pinUseCurrent}`)));
    await act(async () => { fireEvent.press(screen.getByTestId('picker-confirm')); });
    expect(screen.getByText('📍 28.61390, 77.20900 · GPS')).toBeTruthy();
    await save();
    expect(saved()).toMatchObject({ latitude: 28.6139, longitude: 77.209 });
  });

  it('validation and failure messages: client text localized, server message preserved', async () => {
    await setLang('hi');
    mountWith(baseUser({ name: '' }));
    fireEvent.press(screen.getByText(hi.profile.saveChanges));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.profile.nameRequired });
    expect(updateUser).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.fullNamePlaceholder), 'Asha');
    updateUser.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Email already in use' } } });
    fireEvent.press(screen.getByText(hi.profile.saveChanges));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'Email already in use' }));
    updateUser.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getByText(hi.profile.saveChanges));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.profile.updateFailed }));
  });

  it('success toast is localized and navigation still goes back', async () => {
    await setLang('hi');
    mountWith();
    await save();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.profile.profileUpdated }));
    expect(mockNav.goBack).toHaveBeenCalled();
  });

  function cleanupAll() { screen.unmount(); }
});

describe('ChangePasswordScreen', () => {
  const fill = (d, cur, next, conf) => {
    fireEvent.changeText(screen.getByPlaceholderText(d.profile.currentPasswordPlaceholder), cur);
    fireEvent.changeText(screen.getByPlaceholderText(d.auth.passwordHint), next);
    fireEvent.changeText(screen.getByPlaceholderText(d.profile.reenterNewPassword), conf);
  };

  it('English is unchanged', () => {
    render(<ChangePasswordScreen />);
    expect(title()).toBe('Change Password');
    ['Current Password', 'New Password', 'Confirm New Password', 'Update Password'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByPlaceholderText('Enter current password')).toBeTruthy();
    expect(screen.getByPlaceholderText('At least 6 characters')).toBeTruthy();
    expect(screen.getByPlaceholderText('Re-enter new password')).toBeTruthy();
  });

  it('renders in Tamil and validates with localized messages (nothing is sent on invalid input)', async () => {
    await setLang('ta');
    render(<ChangePasswordScreen />);
    expect(title()).toBe(ta.settings.changePassword);
    fireEvent.press(screen.getByText(ta.profile.updatePassword));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: ta.profile.enterCurrentPassword });
    fill(ta, 'oldpass', '123', '123');
    fireEvent.press(screen.getByText(ta.profile.updatePassword));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: ta.profile.newPasswordMin });
    fill(ta, 'oldpass', 'newpass1', 'different');
    fireEvent.press(screen.getByText(ta.profile.updatePassword));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: ta.auth.passwordsMismatch });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('the request body is unchanged in any language; success and failures are localized (server message preserved)', async () => {
    await setLang('hi');
    render(<ChangePasswordScreen />);
    fill(hi, 'oldpass', 'newpass1', 'newpass1');
    api.patch.mockResolvedValueOnce({ data: {} });
    await act(async () => { fireEvent.press(screen.getByText(hi.profile.updatePassword)); });
    expect(api.patch).toHaveBeenCalledWith('/users/change-password', { currentPassword: 'oldpass', newPassword: 'newpass1' });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.profile.passwordChanged });
    expect(mockNav.goBack).toHaveBeenCalled();

    api.patch.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Current password is incorrect' } } });
    await act(async () => { fireEvent.press(screen.getByText(hi.profile.updatePassword)); });
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'Current password is incorrect' });
    api.patch.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(screen.getByText(hi.profile.updatePassword)); });
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.profile.changePasswordFailed });
  });

  it('a language switch keeps the typed passwords', async () => {
    render(<ChangePasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Enter current password'), 'typed-before');
    await setLang('hi');
    expect(screen.getByDisplayValue('typed-before')).toBeTruthy();
  });
});

describe('AddressBookScreen', () => {
  it('title follows the language', async () => {
    render(<AddressBookScreen />);
    expect(title()).toBe('Saved Addresses');
    await setLang('hi');
    expect(title()).toBe(hi.profile.savedAddresses);
    expect(screen.getByText(hi.address.emptyTitle)).toBeTruthy();
  });
});
