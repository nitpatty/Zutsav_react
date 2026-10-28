import React from 'react';
import Toast from 'react-native-toast-message';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PanditAddressScreen from '../PanditAddressScreen';
import api from '../../../api/axios';
import { reverseGeocodeLocation } from '../../../services/geocodingService';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/pandit/StickyActionBar', () => ({ useTabBarClearance: () => 0 }));
jest.mock('../../../services/geocodingService', () => ({ reverseGeocodeLocation: jest.fn(), autocompletePlaces: jest.fn(), clearGeocodingCache: jest.fn() }));

let mockPincodeData = null;
jest.mock('../../../hooks/usePincodeLookup', () => ({ __esModule: true, default: () => ({ loading: false, data: mockPincodeData, error: null }) }));

let mockSelection = null;
let mockMapPoint = null;
let mockMapSource = 'gps';
jest.mock('../../../components/shared/LocationSearch', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return { __esModule: true, default: ({ onSelect }) => React.createElement(TouchableOpacity, { testID: 'search-pick', onPress: () => onSelect(mockSelection) }, React.createElement(Text, null, 'search-pick')) };
});
jest.mock('../../../components/shared/MapPicker', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, initialCoords, onConfirm }) => (visible
      ? React.createElement(React.Fragment, null,
        React.createElement(Text, { testID: 'picker-initial' }, JSON.stringify(initialCoords)),
        React.createElement(TouchableOpacity, { testID: 'picker-confirm', onPress: () => onConfirm(mockMapPoint, { source: mockMapSource }) }, React.createElement(Text, null, 'picker-confirm')))
      : null),
  };
});

const MUMBAI = { latitude: 19.076, longitude: 72.8777 };
const NO_PAIR = { latitude: null, longitude: null };
const PANDIT = {
  languages: ['Hindi'], pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City',
  address: '12 MG Road, Fort', ...MUMBAI, serviceCoverage: { type: 'city', radiusKm: 25 },
};
const FORT = { label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:fort', components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City' } };
const PUNE = { label: 'Koregaon Park, Pune, Maharashtra, India', lat: 18.5362, lng: 73.8939, placeId: 'ola:kp', components: { pincode: '411001', city: 'Pune', state: 'Maharashtra', district: 'Pune' } };

const ADDRESS = 'House no, street, locality…';
const open = async (pandit = PANDIT) => {
  api.get.mockResolvedValue({ data: { pandit } });
  render(<PanditAddressScreen />);
  await screen.findByText('Save Changes');
};
const save = async () => { fireEvent.press(screen.getByText('Save Changes')); await waitFor(() => expect(api.patch).toHaveBeenCalled()); };
const payload = () => api.patch.mock.calls[api.patch.mock.calls.length - 1][1];
const pickPlace = (place) => { mockSelection = place; fireEvent.press(screen.getByTestId('search-pick')); };
const confirmOnMap = async (point, source) => {
  mockMapPoint = point; mockMapSource = source;
  fireEvent.press(screen.getByText(/📍|Pick on Map|Use Current Location/));
  await act(async () => { fireEvent.press(screen.getByTestId('picker-confirm')); });
};
const pinLabel = () => screen.getByText(/^📍|^Pick on Map|^Use Current Location/).props.children;
const toasts = () => Toast.show.mock.calls.map(([a]) => a.text1).join(' | ');

beforeEach(() => {
  jest.clearAllMocks();
  mockPincodeData = null;
  api.patch.mockResolvedValue({ data: {} });
  reverseGeocodeLocation.mockResolvedValue({ displayName: '', components: {} });
});

describe('PanditAddressScreen — saved location (the existing working pattern, now covered)', () => {
  it('opening and saving an untouched address keeps the pair and calls the documented endpoint', async () => {
    await open();
    expect(pinLabel()).toBe('📍 19.07600, 72.87770 · Saved');
    await save();
    expect(api.patch).toHaveBeenCalledWith('/pandits/me/languages-address', expect.objectContaining({ address: '12 MG Road, Fort', ...MUMBAI }));
  });

  it('the pincode lookup that fires when a saved address opens (onFill) does not make the pin stale — it used to', async () => {
    mockPincodeData = { state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' };
    await open();
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(payload()).toMatchObject(MUMBAI);
    expect(toasts()).not.toMatch(/pin cleared/i);
  });

  it('a pandit without a pin saves null / null', async () => {
    await open({ ...PANDIT, latitude: null, longitude: null });
    await save();
    expect(payload()).toMatchObject(NO_PAIR);
  });

  it('half a pair in the loaded data is never sent: null / null', async () => {
    await open({ ...PANDIT, longitude: undefined });
    await save();
    expect(payload()).toMatchObject(NO_PAIR);
  });

  it('coverage changes alone keep the pair', async () => {
    await open();
    fireEvent.press(screen.getByText('Entire District'));
    await save();
    expect(payload()).toMatchObject({ ...MUMBAI, serviceCoverage: { type: 'district' } });
  });
});

describe('PanditAddressScreen — stale pin', () => {
  it.each([
    ['address', () => screen.getByPlaceholderText(ADDRESS), 'A different street'],
    ['pincode', () => screen.getByPlaceholderText('Enter 6-digit pincode'), '400002'],
    ['city', () => screen.getByDisplayValue('Mumbai'), 'Thane'],
    ['district', () => screen.getByDisplayValue('Mumbai City'), 'Thane'],
    ['state', () => screen.getByDisplayValue('Maharashtra'), 'Gujarat'],
  ])('editing the %s clears the pin on save (null / null), tells the user, and drops it locally', async (_n, field, value) => {
    await open();
    fireEvent.changeText(field(), value);
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
    await save();
    expect(payload()).toMatchObject(NO_PAIR);
    expect(toasts()).toMatch(/pin cleared/i);
    await waitFor(() => expect(screen.queryByTestId('stale-pin-notice')).toBeNull());
    expect(pinLabel()).toMatch(/^Pick on Map|^Use Current Location/);
  });

  it('typing the same text again is not an edit', async () => {
    await open();
    fireEvent.changeText(screen.getByPlaceholderText(ADDRESS), '12 MG Road, Fort');
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(payload()).toMatchObject(MUMBAI);
  });

  it('editing after GPS clears the GPS pin', async () => {
    await open({ ...PANDIT, latitude: null, longitude: null });
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    expect(pinLabel()).toBe('📍 28.61390, 77.20900 · GPS');
    fireEvent.changeText(screen.getByPlaceholderText(ADDRESS), 'Typed after GPS');
    await save();
    expect(payload()).toMatchObject(NO_PAIR);
  });

  it('a replacement place after an edit restores a valid pair', async () => {
    await open();
    fireEvent.changeText(screen.getByPlaceholderText(ADDRESS), 'Changed by hand');
    pickPlace(PUNE);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(payload()).toMatchObject({ latitude: PUNE.lat, longitude: PUNE.lng });
    expect(toasts()).not.toMatch(/pin cleared/i);
  });

  it('a new GPS fix after an edit restores a valid pair', async () => {
    await open();
    fireEvent.changeText(screen.getByDisplayValue('Mumbai'), 'Thane');
    await confirmOnMap({ latitude: 12.9716, longitude: 77.5946 }, 'gps');
    await save();
    expect(payload()).toMatchObject({ latitude: 12.9716, longitude: 77.5946 });
  });
});

describe('PanditAddressScreen — search selection and autofill', () => {
  it('fills pincode, state, city and district from the suggestion and attaches its coordinates', async () => {
    await open({ ...PANDIT, pincode: '', state: '', city: '', district: '', address: '', latitude: null, longitude: null });
    pickPlace(FORT);
    expect(screen.getByPlaceholderText('Enter 6-digit pincode').props.value).toBe('400001');
    expect(screen.getByDisplayValue('Mumbai')).toBeTruthy();
    expect(screen.getByDisplayValue('Maharashtra')).toBeTruthy();
    expect(screen.getByDisplayValue('Mumbai City')).toBeTruthy();
    expect(screen.getByPlaceholderText(ADDRESS).props.value).toBe(FORT.label);
    expect(pinLabel()).toBe('📍 18.93220, 72.83470 · Search');
    await save();
    expect(payload()).toMatchObject({ pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', address: FORT.label, latitude: FORT.lat, longitude: FORT.lng });
  });

  it('the pincode lookup that follows the autofill does not invalidate the pin (the race the old code had)', async () => {
    await open({ ...PANDIT, pincode: '', state: '', city: '', district: '', address: '', latitude: null, longitude: null });
    mockPincodeData = { state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' };
    pickPlace(FORT);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(payload()).toMatchObject({ latitude: FORT.lat, longitude: FORT.lng });
  });

  it('a typed address is kept; empty components change nothing but the coordinates', async () => {
    await open();
    pickPlace({ label: 'Somewhere', lat: 21.1458, lng: 79.0882, placeId: '', components: {} });
    expect(screen.getByPlaceholderText(ADDRESS).props.value).toBe('12 MG Road, Fort');
    expect(screen.getByDisplayValue('Mumbai')).toBeTruthy();
    await save();
    expect(payload()).toMatchObject({ address: '12 MG Road, Fort', city: 'Mumbai', latitude: 21.1458, longitude: 79.0882 });
  });

  it('an invalid suggestion attaches nothing', async () => {
    await open({ ...PANDIT, latitude: null, longitude: null });
    pickPlace({ label: 'Broken', lat: 999, lng: 5, components: { city: 'Pune' } });
    expect(screen.getByDisplayValue('Mumbai')).toBeTruthy();
    await save();
    expect(payload()).toMatchObject(NO_PAIR);
  });

  it('makes no reverse-geocoding request after a search selection; GPS with an empty address still labels it', async () => {
    await open({ ...PANDIT, address: '', latitude: null, longitude: null });
    pickPlace(PUNE);
    await act(async () => {});
    expect(reverseGeocodeLocation).not.toHaveBeenCalled();

    reverseGeocodeLocation.mockResolvedValue({ displayName: 'Connaught Place, New Delhi', components: {} });
    mockSelection = null;
    fireEvent.changeText(screen.getByPlaceholderText(ADDRESS), ''); // clear the label to simulate an empty address
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    await waitFor(() => expect(reverseGeocodeLocation).toHaveBeenCalledWith(28.6139, 77.209));
    await waitFor(() => expect(screen.getByPlaceholderText(ADDRESS).props.value).toBe('Connaught Place, New Delhi'));
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });

  it('the picker opens on the CURRENT pin', async () => {
    await open();
    pickPlace(PUNE);
    fireEvent.press(screen.getByText(/^📍/));
    expect(JSON.parse(screen.getByTestId('picker-initial').props.children)).toEqual({ latitude: PUNE.lat, longitude: PUNE.lng });
  });
});

describe('PanditAddressScreen — failures', () => {
  it('a rejected save shows the server message and keeps the form (and pin) as it was', async () => {
    await open();
    api.patch.mockRejectedValueOnce({ response: { data: { message: 'latitude and longitude must be sent together' } } });
    fireEvent.press(screen.getByText('Save Changes'));
    await waitFor(() => expect(toasts()).toMatch(/must be sent together/));
    expect(pinLabel()).toBe('📍 19.07600, 72.87770 · Saved');
  });
});
