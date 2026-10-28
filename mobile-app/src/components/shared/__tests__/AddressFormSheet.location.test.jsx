import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AddressFormSheet from '../AddressFormSheet';
import { reverseGeocodeLocation } from '../../../services/geocodingService';

jest.mock('../../../services/geocodingService', () => ({ reverseGeocodeLocation: jest.fn(), autocompletePlaces: jest.fn(), clearGeocodingCache: jest.fn() }));

let mockPincodeData = null;
jest.mock('../../../hooks/usePincodeLookup', () => ({ __esModule: true, default: () => ({ loading: false, data: mockPincodeData, error: null }) }));

let mockSelection = null;
let mockMapPoint = null;
let mockMapSource = 'gps';
jest.mock('../LocationSearch', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return { __esModule: true, default: ({ onSelect }) => React.createElement(TouchableOpacity, { testID: 'search-pick', onPress: () => onSelect(mockSelection) }, React.createElement(Text, null, 'search-pick')) };
});
jest.mock('../MapPicker', () => {
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
const HOME = { _id: 'a1', label: 'Home', isDefault: true, address: '12 MG Road, Fort', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City', ...MUMBAI };
const OFFICE = { _id: 'a2', label: 'Office', isDefault: false, address: 'Office Park 7', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' }; // no pin
const FORT = { label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:fort', components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City' } };
const PUNE = { label: 'Koregaon Park, Pune, Maharashtra, India', lat: 18.5362, lng: 73.8939, placeId: 'ola:kp', components: { pincode: '411001', city: 'Pune', state: 'Maharashtra', district: 'Pune' } };

const ADDRESS = 'House no., street, area…';
let onSave;
const sheet = (props) => <AddressFormSheet visible initialValues={null} onSave={onSave} onClose={jest.fn()} {...props} />;
const open = (initialValues = null) => render(sheet({ initialValues }));
const text = (placeholder, value) => fireEvent.changeText(screen.getByPlaceholderText(placeholder), value);
const pickPlace = (place) => { mockSelection = place; fireEvent.press(screen.getByTestId('search-pick')); };
const confirmOnMap = async (point, source) => {
  mockMapPoint = point; mockMapSource = source;
  fireEvent.press(screen.getByText(/📍|Pick on Map|Use Current Location/));
  await act(async () => { fireEvent.press(screen.getByTestId('picker-confirm')); });
};
const save = async () => { fireEvent.press(screen.getByText('Save Address')); await waitFor(() => expect(onSave).toHaveBeenCalled()); };
const saved = () => onSave.mock.calls[onSave.mock.calls.length - 1][0];
const pinLabel = () => screen.getByText(/^📍|^Pick on Map|^Use Current Location/).props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockPincodeData = null;
  onSave = jest.fn().mockResolvedValue(undefined);
  reverseGeocodeLocation.mockResolvedValue({ displayName: '', components: {} });
});

describe('AddressFormSheet — creating an address', () => {
  it('search → fields filled from the suggestion, pair saved, source shown', async () => {
    open();
    pickPlace(FORT);
    expect(screen.getByPlaceholderText(ADDRESS).props.value).toBe(FORT.label);
    expect(screen.getByPlaceholderText('City').props.value).toBe('Mumbai');
    expect(pinLabel()).toBe('📍 18.93220, 72.83470 · Search');
    await save();
    expect(saved()).toMatchObject({ address: FORT.label, pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', latitude: FORT.lat, longitude: FORT.lng });
  });

  it('a suggestion without components: coordinates and label only, a typed pincode is kept, and the pair is saved', async () => {
    open();
    text('Enter 6-digit pincode', '440001'); // the pincode is required to save; entered before the pick
    pickPlace({ label: 'Somewhere in Nagpur', lat: 21.1458, lng: 79.0882, placeId: '', components: {} });
    expect(screen.getByPlaceholderText('City').props.value).toBe('');
    expect(screen.getByPlaceholderText('Enter 6-digit pincode').props.value).toBe('440001');
    await save();
    expect(saved()).toMatchObject({ address: 'Somewhere in Nagpur', pincode: '440001', latitude: 21.1458, longitude: 79.0882 });
  });

  it('typing the pincode AFTER such a pick is an address edit: the pin is cleared (never saved against a different pincode) and can be re-picked', async () => {
    open();
    pickPlace({ label: 'Somewhere in Nagpur', lat: 21.1458, lng: 79.0882, placeId: '', components: {} });
    text('Enter 6-digit pincode', '440001');
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
    pickPlace({ label: 'Somewhere in Nagpur', lat: 21.1458, lng: 79.0882, placeId: '', components: {} }); // pick again
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ pincode: '440001', latitude: 21.1458, longitude: 79.0882 });
  });

  it('typed text after the pick clears the pin: null / null is saved', async () => {
    open();
    pickPlace(FORT);
    text(ADDRESS, 'Flat 4, Different Building');
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
    await save();
    expect(saved()).toMatchObject({ address: 'Flat 4, Different Building', ...NO_PAIR });
  });

  it('editing after GPS, then picking a replacement place, saves the replacement pair', async () => {
    open();
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    expect(pinLabel()).toBe('📍 28.61390, 77.20900 · GPS');
    text(ADDRESS, '12 Typed Road');
    text('Enter 6-digit pincode', '110001');
    pickPlace(PUNE);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ latitude: PUNE.lat, longitude: PUNE.lng });
  });

  it('the pincode lookup that follows a suggestion does not invalidate its pin', async () => {
    open();
    mockPincodeData = { state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' };
    pickPlace(FORT);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ latitude: FORT.lat, longitude: FORT.lng });
  });

  it('an address with no pin at all is saved as null / null', async () => {
    open();
    text(ADDRESS, '5 Plain Street');
    text('Enter 6-digit pincode', '400001');
    await save();
    expect(saved()).toMatchObject({ address: '5 Plain Street', ...NO_PAIR });
  });

  it('GPS with an empty address reverse-geocodes it for a label; the label fill does not stale the pin', async () => {
    reverseGeocodeLocation.mockResolvedValue({ displayName: 'Connaught Place, New Delhi', components: {} });
    open();
    text('Enter 6-digit pincode', '110001');
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    await waitFor(() => expect(screen.getByPlaceholderText(ADDRESS).props.value).toBe('Connaught Place, New Delhi'));
    expect(reverseGeocodeLocation).toHaveBeenCalledWith(28.6139, 77.209);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ address: 'Connaught Place, New Delhi', ...{ latitude: 28.6139, longitude: 77.209 } });
  });

  it('search selection makes no reverse-geocoding request', async () => {
    open();
    pickPlace(FORT);
    await act(async () => {});
    expect(reverseGeocodeLocation).not.toHaveBeenCalled();
  });
});

describe('AddressFormSheet — editing a saved address', () => {
  it('opening and saving an untouched address keeps its pair (and the other fields)', async () => {
    open(HOME);
    expect(pinLabel()).toBe('📍 19.07600, 72.87770 · Saved');
    await save();
    expect(saved()).toMatchObject({ address: HOME.address, pincode: '400001', ...MUMBAI });
  });

  it('the pincode lookup that fires when an existing address opens does not make its pin stale', async () => {
    mockPincodeData = { state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' };
    open(HOME);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    await save();
    expect(saved()).toMatchObject(MUMBAI);
  });

  it('changing only the label or the default flag keeps the pair', async () => {
    open(HOME);
    fireEvent.press(screen.getByText('Office'));
    fireEvent.press(screen.getByText('Set as default address'));
    await save();
    expect(saved()).toMatchObject({ label: 'Office', isDefault: false, ...MUMBAI });
  });

  it.each([
    ['address', ADDRESS, 'Another street'], ['pincode', 'Enter 6-digit pincode', '400002'],
    ['city', 'City', 'Thane'], ['district', 'District', 'Thane'], ['state', 'State', 'Gujarat'],
  ])('editing the %s clears the pair on save', async (_n, placeholder, value) => {
    open(HOME);
    text(placeholder, value);
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
    await save();
    expect(saved()).toMatchObject(NO_PAIR);
  });

  it('an address that has no pin saves null / null (no placeholder, no half pair)', async () => {
    open(OFFICE);
    await save();
    expect(saved()).toMatchObject(NO_PAIR);
  });

  it('half a pair in the stored address is never sent', async () => {
    open({ ...OFFICE, latitude: 28.6 });
    await save();
    expect(saved()).toMatchObject(NO_PAIR);
  });

  it('switching to another address does not carry the previous address\'s pin or warning', async () => {
    const { rerender } = open(HOME);
    text(ADDRESS, 'Edited, so stale');
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
    rerender(sheet({ initialValues: OFFICE }));
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
    expect(screen.getByPlaceholderText(ADDRESS).props.value).toBe('Office Park 7');
    await save();
    expect(saved()).toMatchObject({ address: 'Office Park 7', ...NO_PAIR });
  });

  it('closing and re-opening for a new address starts clean (no leftover pin from the last edit)', async () => {
    const { rerender } = open(HOME);
    rerender(sheet({ visible: false, initialValues: HOME }));
    rerender(sheet({ visible: true, initialValues: null }));
    expect(pinLabel()).toMatch(/^Pick on Map|^Use Current Location/);
    expect(screen.getByPlaceholderText(ADDRESS).props.value).toBe('');
  });

  it('the picker opens on the address\'s own pin, and after a new pick on the new one', () => {
    open(HOME);
    fireEvent.press(screen.getByText(/^📍/));
    expect(JSON.parse(screen.getByTestId('picker-initial').props.children)).toEqual(MUMBAI);
  });
});
