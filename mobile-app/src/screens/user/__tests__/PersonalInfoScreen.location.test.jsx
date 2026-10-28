import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PersonalInfoScreen from '../PersonalInfoScreen';
import { useAuthStore } from '../../../store/authStore';
import { reverseGeocodeLocation } from '../../../services/geocodingService';

const mockNav = { goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../services/geocodingService', () => ({ reverseGeocodeLocation: jest.fn(), autocompletePlaces: jest.fn(), clearGeocodingCache: jest.fn() }));

// What the pincode lookup returns for the pincode currently in the field (null = no lookup result).
let mockPincodeData = null;
jest.mock('../../../hooks/usePincodeLookup', () => ({ __esModule: true, default: () => ({ loading: false, data: mockPincodeData, error: null }) }));

// Stand-ins for the two children that need a backend / native modules. Tests drive them directly.
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

const SAVED = { latitude: 19.076, longitude: 72.8777 };
const baseUser = (over = {}) => ({
  name: 'Asha Test', email: 'asha@example.invalid', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City',
  address: '12 MG Road, Fort', ...SAVED, ...over,
});
const FORT = {
  label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:fort',
  components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', locality: 'Fort' },
};
const PUNE = {
  label: 'Koregaon Park, Pune, Maharashtra, India', lat: 18.5362, lng: 73.8939, placeId: 'ola:kp',
  components: { pincode: '411001', city: 'Pune', state: 'Maharashtra', district: 'Pune' },
};

let updateUser;
const mountWith = (user) => {
  updateUser = jest.fn().mockResolvedValue({});
  useAuthStore.setState({ user, updateUser });
  return render(<PersonalInfoScreen />);
};
const saved = () => updateUser.mock.calls[updateUser.mock.calls.length - 1][0];
const save = async () => { fireEvent.press(screen.getByText('Save Changes')); await waitFor(() => expect(updateUser).toHaveBeenCalled()); };
const text = (placeholder, value) => fireEvent.changeText(screen.getByPlaceholderText(placeholder), value);
const pickPlace = (place) => { mockSelection = place; fireEvent.press(screen.getByTestId('search-pick')); };
const confirmOnMap = async (point, source) => {
  mockMapPoint = point; mockMapSource = source;
  fireEvent.press(screen.getByText(/📍|Pick on Map|Use Current Location/));
  await act(async () => { fireEvent.press(screen.getByTestId('picker-confirm')); });
};
const pinLabel = () => screen.getByText(/^📍/).props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockPincodeData = null;
  reverseGeocodeLocation.mockResolvedValue({ displayName: '', components: {} });
});

describe('PersonalInfoScreen — saved location', () => {
  it('opening and saving an untouched profile keeps the saved pair', async () => {
    mountWith(baseUser());
    await save();
    expect(saved()).toMatchObject({ address: '12 MG Road, Fort', ...SAVED });
  });

  it('the pincode lookup that runs when the screen opens (onFill) does NOT make the saved pin stale', async () => {
    mockPincodeData = { state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' };
    mountWith(baseUser());
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject(SAVED);
  });

  it('editing an unrelated field (name, email) preserves the pair', async () => {
    mountWith(baseUser());
    text('Your full name', 'Asha Renamed');
    text('you@example.com', 'new@example.invalid');
    await save();
    expect(saved()).toMatchObject({ name: 'Asha Renamed', email: 'new@example.invalid', ...SAVED });
  });

  it('shows where the saved position is (coordinates, "Saved")', () => {
    mountWith(baseUser());
    expect(pinLabel()).toBe('📍 19.07600, 72.87770 · Saved');
  });

  it.each([null, undefined])('a profile without a location (%p) saves null / null, not undefined or a placeholder', async (v) => {
    mountWith(baseUser({ latitude: v, longitude: v }));
    await save();
    expect(saved().latitude).toBeNull();
    expect(saved().longitude).toBeNull();
  });

  it('a half pair in the profile data (latitude only) is never sent: both null', async () => {
    mountWith(baseUser({ latitude: 19.076, longitude: undefined }));
    await save();
    expect(saved()).toMatchObject({ latitude: null, longitude: null });
  });
});

describe('PersonalInfoScreen — stale pin', () => {
  it.each([
    ['address', 'House no., street, area…', '99 Different Street'],
    ['pincode', 'Enter 6-digit pincode', '400002'],
    ['city', 'City', 'Thane'],
    ['district', 'District', 'Thane'],
    ['state', 'State', 'Gujarat'],
  ])('editing the %s after the pin was set clears it on save (null / null) and warns the user', async (_n, placeholder, value) => {
    mountWith(baseUser());
    text(placeholder, value);
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
    await save();
    expect(saved()).toMatchObject({ latitude: null, longitude: null });
  });

  it('editing the address after choosing a place from search', async () => {
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    pickPlace(FORT);
    text('House no., street, area…', 'Somewhere else entirely');
    await save();
    expect(saved()).toMatchObject({ latitude: null, longitude: null });
  });

  it('editing the address after using GPS', async () => {
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    expect(pinLabel()).toBe('📍 28.61390, 77.20900 · GPS');
    text('House no., street, area…', 'Typed after GPS');
    await save();
    expect(saved()).toMatchObject({ latitude: null, longitude: null });
  });

  it('typing the same text again is not an edit', async () => {
    mountWith(baseUser());
    text('House no., street, area…', '12 MG Road, Fort');
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject(SAVED);
  });

  it('choosing a replacement place after editing restores a valid pair and removes the warning', async () => {
    mountWith(baseUser());
    text('House no., street, area…', 'Changed by hand');
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
    pickPlace(PUNE);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ latitude: PUNE.lat, longitude: PUNE.lng });
  });

  it('a new GPS fix after editing restores a valid pair', async () => {
    mountWith(baseUser());
    text('City', 'Thane');
    await confirmOnMap({ latitude: 12.9716, longitude: 77.5946 }, 'gps');
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ latitude: 12.9716, longitude: 77.5946 });
  });
});

describe('PersonalInfoScreen — search selection and autofill', () => {
  it('fills coordinates, pincode, city, state and district from the suggestion; the address only when it was empty', async () => {
    mountWith(baseUser({ pincode: '', state: '', city: '', district: '', address: '', latitude: undefined, longitude: undefined }));
    pickPlace(FORT);
    expect(screen.getByPlaceholderText('City').props.value).toBe('Mumbai');
    expect(screen.getByPlaceholderText('State').props.value).toBe('Maharashtra');
    expect(screen.getByPlaceholderText('District').props.value).toBe('Mumbai City');
    expect(screen.getByPlaceholderText('Enter 6-digit pincode').props.value).toBe('400001');
    expect(screen.getByPlaceholderText('House no., street, area…').props.value).toBe(FORT.label);
    expect(pinLabel()).toBe('📍 18.93220, 72.83470 · Search');
    await save();
    expect(saved()).toMatchObject({ pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', address: FORT.label, latitude: FORT.lat, longitude: FORT.lng });
  });

  it('a typed address is kept; only the parts the suggestion provides are replaced', async () => {
    mountWith(baseUser());
    pickPlace(PUNE);
    expect(screen.getByPlaceholderText('House no., street, area…').props.value).toBe('12 MG Road, Fort');
    expect(screen.getByPlaceholderText('City').props.value).toBe('Pune');
    await save();
    expect(saved()).toMatchObject({ address: '12 MG Road, Fort', city: 'Pune', pincode: '411001', latitude: PUNE.lat, longitude: PUNE.lng });
  });

  it('partial components change only those fields', async () => {
    mountWith(baseUser());
    pickPlace({ label: 'Nashik', lat: 19.9975, lng: 73.7898, placeId: 'x', components: { city: 'Nashik' } });
    expect(screen.getByPlaceholderText('City').props.value).toBe('Nashik');
    expect(screen.getByPlaceholderText('State').props.value).toBe('Maharashtra');
    expect(screen.getByPlaceholderText('District').props.value).toBe('Mumbai City');
    expect(screen.getByPlaceholderText('Enter 6-digit pincode').props.value).toBe('400001');
  });

  it.each([[{}], [undefined]])('a suggestion with empty components (%p) wipes nothing: other fields stay, coordinates are still set', async (components) => {
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    pickPlace({ label: 'Somewhere', lat: 21.1458, lng: 79.0882, placeId: '', components });
    expect(screen.getByPlaceholderText('City').props.value).toBe('Mumbai');
    expect(screen.getByPlaceholderText('Enter 6-digit pincode').props.value).toBe('400001');
    await save();
    expect(saved()).toMatchObject({ city: 'Mumbai', pincode: '400001', latitude: 21.1458, longitude: 79.0882 });
  });

  it('the pincode lookup that follows the autofill (onFill) does not invalidate the pin it belongs to', async () => {
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    mockPincodeData = { state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' }; // what the lookup returns after the pick
    pickPlace(FORT);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ latitude: FORT.lat, longitude: FORT.lng });
  });

  it('fields filled by the suggestion can still be edited, and that edit then clears the pin', async () => {
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    pickPlace(FORT);
    text('City', 'Navi Mumbai');
    await save();
    expect(saved()).toMatchObject({ city: 'Navi Mumbai', latitude: null, longitude: null });
  });

  it('an invalid suggestion (no usable coordinates) is ignored — nothing is attached', async () => {
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    pickPlace({ label: 'Broken', lat: NaN, lng: 72, components: { city: 'Pune' } });
    expect(screen.getByPlaceholderText('City').props.value).toBe('Mumbai');
    await save();
    expect(saved()).toMatchObject({ latitude: null, longitude: null });
  });

  it('makes NO reverse-geocoding request after a search selection', async () => {
    mountWith(baseUser());
    pickPlace(FORT);
    await act(async () => {});
    expect(reverseGeocodeLocation).not.toHaveBeenCalled();
  });
});

describe('PersonalInfoScreen — GPS / map confirm', () => {
  it('reverse-geocodes the point to label an EMPTY address, and keeps the GPS pin', async () => {
    reverseGeocodeLocation.mockResolvedValue({ displayName: 'Connaught Place, New Delhi', components: {} });
    mountWith(baseUser({ address: '', latitude: undefined, longitude: undefined }));
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    expect(reverseGeocodeLocation).toHaveBeenCalledWith(28.6139, 77.209);
    await waitFor(() => expect(screen.getByPlaceholderText('House no., street, area…').props.value).toBe('Connaught Place, New Delhi'));
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull(); // the label fill is programmatic
    await save();
    expect(saved()).toMatchObject({ address: 'Connaught Place, New Delhi', latitude: 28.6139, longitude: 77.209 });
  });

  it('does not call reverse geocoding (or overwrite the text) when the user already typed an address', async () => {
    mountWith(baseUser());
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    expect(reverseGeocodeLocation).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('House no., street, area…').props.value).toBe('12 MG Road, Fort');
  });

  it('the picker opens on the CURRENT pin: after a search pick it receives the new coordinates, not the old ones', async () => {
    mountWith(baseUser());
    pickPlace(PUNE);
    fireEvent.press(screen.getByText(/^📍/));
    expect(JSON.parse(screen.getByTestId('picker-initial').props.children)).toEqual({ latitude: PUNE.lat, longitude: PUNE.lng });
  });

  it('with no location the picker opens with nothing selected', () => {
    mountWith(baseUser({ latitude: undefined, longitude: undefined }));
    fireEvent.press(screen.getByText(/Pick on Map|Use Current Location/));
    expect(screen.getByTestId('picker-initial').props.children).toBe('null');
  });
});
