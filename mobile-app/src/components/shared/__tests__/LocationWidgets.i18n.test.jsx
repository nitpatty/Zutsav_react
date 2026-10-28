import React from 'react';
import { Platform } from 'react-native';
import axios from 'axios';
import * as Location from 'expo-location';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import LocationSearch from '../LocationSearch';
import PincodeInput from '../PincodeInput';
import MapPicker from '../MapPicker';
import { autocompletePlaces } from '../../../services/geocodingService';
import { formatPinLabel } from '../../../utils/locationPin';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { DICTIONARIES } from '../../../i18n/locales';

// Real LocationSearch / PincodeInput / MapPicker with only the network, GPS and native map replaced.
jest.mock('../../../services/geocodingService', () => ({ autocompletePlaces: jest.fn() }));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), create: jest.fn() } }));
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
const mockMapMounted = jest.fn();
jest.mock('react-native-maps', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: (props) => { mockMapMounted(); return R.createElement(View, { testID: 'map-view', ...props }); } };
});

const hi = DICTIONARIES.hi;
const FORT = {
  label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:fort',
  components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City' },
};
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const originalOS = Platform.OS;

beforeEach(() => {
  autocompletePlaces.mockReset(); axios.get.mockReset(); Toast.show.mockClear(); mockMapMounted.mockClear();
  Location.requestForegroundPermissionsAsync.mockReset(); Location.getCurrentPositionAsync.mockReset();
});
afterEach(() => { Platform.OS = originalOS; jest.useRealTimers(); });

describe('LocationSearch', () => {
  const tick = async (ms = 350) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

  beforeEach(() => { jest.useFakeTimers(); });

  it('English placeholder is unchanged', () => {
    render(<LocationSearch onSelect={jest.fn()} />);
    expect(screen.getByPlaceholderText('Search your locality, city, or address…')).toBeTruthy();
  });

  it('uses the localized default placeholder, but an explicit placeholder prop still wins', async () => {
    await setLang('hi');
    const { rerender } = render(<LocationSearch onSelect={jest.fn()} />);
    expect(screen.getByPlaceholderText(hi.location.searchPlaceholder)).toBeTruthy();
    rerender(<LocationSearch onSelect={jest.fn()} placeholder="custom prompt" />);
    expect(screen.getByPlaceholderText('custom prompt')).toBeTruthy();
  });

  it('distinguishes "unavailable" (with retry) from "no results" — both localized — and the retry searches again', async () => {
    await setLang('hi');
    autocompletePlaces.mockResolvedValueOnce({ found: false, unavailable: true });
    render(<LocationSearch onSelect={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.location.searchPlaceholder), 'Fort');
    await tick(); await flush();
    expect(screen.getByText(hi.location.unavailable)).toBeTruthy();
    expect(screen.queryByText(hi.location.noResults)).toBeNull();
    expect(screen.getByLabelText(hi.location.tryAgainLabel)).toBeTruthy();

    autocompletePlaces.mockResolvedValueOnce({ found: false });
    fireEvent.press(screen.getByText(hi.location.tryAgain));
    await flush();
    expect(autocompletePlaces).toHaveBeenCalledTimes(2);
    expect(autocompletePlaces).toHaveBeenLastCalledWith('Fort');
    expect(screen.getByText(hi.location.noResults)).toBeTruthy();
    expect(screen.queryByText(hi.location.unavailable)).toBeNull();
  });

  it('results and the selection payload are untouched by the language (place labels are provider data)', async () => {
    await setLang('hi');
    const onSelect = jest.fn();
    autocompletePlaces.mockResolvedValue({ found: true, results: [FORT] });
    render(<LocationSearch onSelect={onSelect} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.location.searchPlaceholder), 'Fort');
    await tick(); await flush();
    fireEvent.press(screen.getByText(FORT.label));
    expect(onSelect).toHaveBeenCalledWith(FORT);
    expect(autocompletePlaces).toHaveBeenCalledWith('Fort'); // the query text is passed verbatim
  });
});

describe('PincodeInput', () => {
  const ok = (po) => ({ data: [{ Status: 'Success', PostOffice: [po] }] });

  it('English placeholder is unchanged', () => {
    render(<PincodeInput value="" onChange={jest.fn()} onFill={jest.fn()} />);
    expect(screen.getByPlaceholderText('Enter 6-digit pincode')).toBeTruthy();
  });

  it('localizes the placeholder and the District / City / State chips; values and the fill payload are untouched', async () => {
    await setLang('hi');
    axios.get.mockResolvedValue(ok({ State: 'Maharashtra', Division: 'Mumbai', District: 'Mumbai City', Name: 'Fort' }));
    const onFill = jest.fn();
    render(<PincodeInput value="400001" onChange={jest.fn()} onFill={onFill} />);
    expect(screen.getByPlaceholderText(hi.location.pincodePlaceholder)).toBeTruthy();
    expect(await screen.findByText(`${hi.address.district}: Mumbai City`)).toBeTruthy();
    expect(screen.getByText(`${hi.address.city}: Mumbai`)).toBeTruthy();
    expect(screen.getByText(`${hi.address.state}: Maharashtra`)).toBeTruthy();
    expect(onFill).toHaveBeenCalledWith({ state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' });
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(String(axios.get.mock.calls[0][0])).toMatch(/\/400001$/); // same lookup URL shape, just the pincode
  });

  it('an invalid pincode and a failed lookup show different localized messages, and clear the fill', async () => {
    await setLang('hi');
    axios.get.mockResolvedValueOnce({ data: [{ Status: 'Error', PostOffice: null }] });
    const onFill = jest.fn();
    const { rerender } = render(<PincodeInput value="000000" onChange={jest.fn()} onFill={onFill} />);
    expect(await screen.findByText(hi.location.pincodeInvalid)).toBeTruthy();
    expect(onFill).toHaveBeenCalledWith({ state: '', city: '', district: '' });

    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    rerender(<PincodeInput value="400002" onChange={jest.fn()} onFill={onFill} />);
    expect(await screen.findByText(hi.location.pincodeLookupFailed)).toBeTruthy();
    expect(screen.queryByText(hi.location.pincodeInvalid)).toBeNull();
  });

  it('an external validation error is shown as given (not translated)', async () => {
    await setLang('hi');
    render(<PincodeInput value="" onChange={jest.fn()} onFill={jest.fn()} error="Pincode is required" />);
    expect(screen.getByText('Pincode is required')).toBeTruthy();
  });

  it('typing still strips non-digits and caps at 6', async () => {
    await setLang('hi');
    const onChange = jest.fn();
    render(<PincodeInput value="" onChange={onChange} onFill={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.location.pincodePlaceholder), '4a0b0c0d0e1f2g3');
    expect(onChange).toHaveBeenCalledWith('400001'); // digits 4,0,0,0,0,1,2,3 → first six
  });
});

describe('MapPicker', () => {
  const open = (props = {}) => render(<MapPicker visible initialCoords={null} onConfirm={jest.fn()} onClose={jest.fn()} {...props} />);

  it('English on Android: the title, controls and map zoom labels (the "map is not available" notice is gone)', () => {
    Platform.OS = 'android';
    open();
    expect(screen.getByText('Pick Your Location')).toBeTruthy();
    expect(screen.queryByText("An interactive map isn't available in the Android app yet.")).toBeNull();
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Zoom out')).toBeTruthy();
    expect(screen.getByText('Use My Current Location')).toBeTruthy();
    expect(screen.getByText('Confirm Location')).toBeTruthy();
  });

  it('Android (Hindi): the tile map is shown (native map never mounted) with translated title, hint and zoom labels', async () => {
    Platform.OS = 'android';
    await setLang('hi');
    open({ initialCoords: { latitude: 19.076, longitude: 72.8777 } });
    expect(mockMapMounted).not.toHaveBeenCalled();
    expect(screen.getByTestId('osm-map')).toBeTruthy();
    expect(screen.queryByTestId('map-unavailable')).toBeNull();
    expect(screen.getByText(hi.location.mapTitle)).toBeTruthy();
    expect(screen.getByLabelText(hi.location.zoomIn)).toBeTruthy();
    expect(screen.getByLabelText(hi.location.zoomOut)).toBeTruthy();
    expect(screen.getByText(hi.location.useCurrent)).toBeTruthy();
    expect(screen.getByText(hi.location.confirm)).toBeTruthy();
  });

  it('Android (Hindi): when no tile can be loaded the translated "map could not be loaded" state and retry are shown', async () => {
    Platform.OS = 'android';
    await setLang('hi');
    open({ initialCoords: { latitude: 19.076, longitude: 72.8777 } });
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent(screen.getByLabelText('Map'), 'layout', { nativeEvent: { layout: { width: 400, height: 600 } } });
    screen.getAllByTestId('osm-tile').slice(0, 4).forEach((tile) => fireEvent(tile, 'error'));
    expect(screen.getByTestId('map-unavailable')).toBeTruthy();
    expect(screen.getByText(hi.location.mapUnavailable)).toBeTruthy();
    expect(screen.getByText(hi.location.mapUnavailableHint)).toBeTruthy();
    expect(screen.getByText(hi.location.tryAgain)).toBeTruthy();
  });

  it('iOS: the map still mounts and the drag hint is translated', async () => {
    Platform.OS = 'ios';
    await setLang('hi');
    open();
    expect(screen.getByTestId('map-view')).toBeTruthy();
    expect(screen.getByText(hi.location.dragHint)).toBeTruthy();
  });

  it('GPS success: same coordinates and source, "GPS" label with the exact numbers, localized button text while locating', async () => {
    Platform.OS = 'android';
    await setLang('hi');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    let release;
    Location.getCurrentPositionAsync.mockImplementation(() => new Promise((r) => { release = r; }));
    const onConfirm = jest.fn();
    open({ onConfirm });
    fireEvent.press(screen.getByText(hi.location.useCurrent));
    expect(await screen.findByText(hi.location.locating)).toBeTruthy();
    await act(async () => { release({ coords: { latitude: 28.6139, longitude: 77.209 } }); });
    expect(await screen.findByTestId('picker-selection')).toBeTruthy();
    expect(screen.getByTestId('picker-selection').props.children).toBe('📍 28.61390, 77.20900 · GPS');
    fireEvent.press(screen.getByText(hi.location.confirm));
    expect(onConfirm).toHaveBeenCalledWith({ latitude: 28.6139, longitude: 77.209 }, { source: 'gps' });
  });

  it('permission denied and a failed GPS fix show different localized messages and confirm nothing', async () => {
    Platform.OS = 'android';
    await setLang('hi');
    const onConfirm = jest.fn();
    open({ onConfirm });

    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
    fireEvent.press(screen.getByText(hi.location.useCurrent));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.location.permissionDenied }));
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();

    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: true });
    Location.getCurrentPositionAsync.mockRejectedValueOnce(new Error('no fix'));
    fireEvent.press(screen.getByText(hi.location.useCurrent));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.location.locateFailed }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('an invalid fix is rejected with the localized message and never confirmed', async () => {
    Platform.OS = 'android';
    await setLang('hi');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
    const onConfirm = jest.fn();
    open({ onConfirm });
    fireEvent.press(screen.getByText(hi.location.useCurrent));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.location.locateFailed }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('formatPinLabel', () => {
  const MUMBAI = { latitude: 19.076, longitude: 72.8777 };
  const t = getTranslator('hi');

  it('without a translator it returns the same English text as before', () => {
    expect(formatPinLabel(MUMBAI, 'search')).toBe('📍 19.07600, 72.87770 · Search');
    expect(formatPinLabel(MUMBAI, 'gps')).toBe('📍 19.07600, 72.87770 · GPS');
    expect(formatPinLabel(null, null)).toMatch(/^(Pick on Map|Use Current Location)$/);
  });

  it('with a translator only the words change — the coordinates are formatted identically', () => {
    for (const source of ['saved', 'search', 'gps', 'map']) {
      const english = formatPinLabel(MUMBAI, source);
      const localized = formatPinLabel(MUMBAI, source, t);
      expect(localized.startsWith('📍 19.07600, 72.87770')).toBe(true);
      expect(english.startsWith('📍 19.07600, 72.87770')).toBe(true);
    }
    expect(formatPinLabel(MUMBAI, 'search', t)).toBe(`📍 19.07600, 72.87770 · ${hi.location.pinSearch}`);
    expect(formatPinLabel(MUMBAI, 'gps', t)).toBe('📍 19.07600, 72.87770 · GPS');
  });

  it('an unknown source shows no origin, and invalid coordinates never form a label with numbers', () => {
    expect(formatPinLabel(MUMBAI, 'unknown', t)).toBe('📍 19.07600, 72.87770');
    expect(formatPinLabel({ latitude: 0, longitude: 0 }, 'saved', t)).not.toMatch(/📍/);
    expect(formatPinLabel({ latitude: NaN, longitude: 1 }, 'saved', t)).not.toMatch(/📍/);
  });

  it('the call to action follows the platform and the language', () => {
    Platform.OS = 'android';
    expect(formatPinLabel(null, null, t)).toBe(hi.location.pinUseCurrent);
    Platform.OS = 'ios';
    expect(formatPinLabel(null, null, t)).toBe(hi.location.pinPick);
  });
});
