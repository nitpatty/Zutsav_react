import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AddressPicker from '../AddressPicker';
import useAddresses from '../../../hooks/useAddresses';
import { reverseGeocodeLocation } from '../../../services/geocodingService';

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../hooks/useAddresses', () => ({ __esModule: true, default: jest.fn() }));
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
// The edit sheet has its own tests; here it is just a closed modal.
jest.mock('../AddressFormSheet', () => ({ __esModule: true, default: () => null }));

const MUMBAI = { latitude: 19.076, longitude: 72.8777 };
const ADDR = { address: '12 MG Road, Fort', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City', ...MUMBAI };
const FORT = { label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:fort', components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City' } };
const PUNE = { label: 'Koregaon Park, Pune, Maharashtra, India', lat: 18.5362, lng: 73.8939, placeId: 'ola:kp', components: { pincode: '411001', city: 'Pune', state: 'Maharashtra', district: 'Pune' } };

let latest;
// Parent that merges the emitted fields (as BookingFlowScreen does) or replaces its state (as CartScreen does).
function Harness({ initial, replace = false, extra = {} }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return (
    <AddressPicker
      mode="picker"
      allowInlineNew
      value={value}
      onChange={(fields) => (replace ? setValue(fields) : setValue((p) => ({ ...p, ...fields })))}
      {...extra}
    />
  );
}
const mountInline = (initial = ADDR, opts = {}) => {
  useAddresses.mockReturnValue({ addresses: [], loading: false, addAddress: jest.fn(), updateAddress: jest.fn(), deleteAddress: jest.fn() });
  return render(<Harness initial={initial} {...opts} />);
};
const text = (placeholder, value) => fireEvent.changeText(screen.getByPlaceholderText(placeholder), value);
const pickPlace = (place) => { mockSelection = place; fireEvent.press(screen.getByTestId('search-pick')); };
const confirmOnMap = async (point, source) => {
  mockMapPoint = point; mockMapSource = source;
  fireEvent.press(screen.getByText(/📍|Pick on Map|Use Current Location/));
  await act(async () => { fireEvent.press(screen.getByTestId('picker-confirm')); });
};
const pair = () => ({ latitude: latest.latitude, longitude: latest.longitude });
const NO_PAIR = { latitude: null, longitude: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockPincodeData = null;
  reverseGeocodeLocation.mockResolvedValue({ displayName: '', components: {} });
});

describe('AddressPicker — a manual address edit clears the pin the parent holds', () => {
  it.each([
    ['address', 'House no., street, area…', '99 Different Street'],
    ['pincode', 'Enter 6-digit pincode', '400002'],
    ['city', 'City', 'Thane'],
    ['state', 'State', 'Gujarat'],
  ])('editing the %s emits latitude: null, longitude: null (so booking / checkout cannot submit the old pin)', (_n, placeholder, value) => {
    mountInline();
    expect(pair()).toEqual(MUMBAI);
    text(placeholder, value);
    expect(pair()).toEqual(NO_PAIR);
    expect(screen.getByTestId('stale-pin-notice')).toBeTruthy();
  });

  it('the same holds when the parent REPLACES its state instead of merging (checkout style)', () => {
    mountInline(ADDR, { replace: true });
    text('House no., street, area…', 'Edited');
    expect(pair()).toEqual(NO_PAIR);
    expect(latest.address).toBe('Edited');
  });

  it('typing the same text again changes nothing (the pincode field re-emits its own value when a non-digit is typed)', () => {
    mountInline();
    text('Enter 6-digit pincode', '400001');
    expect(pair()).toEqual(MUMBAI);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });

  it('with no pin to begin with, editing leaves null / null and shows no warning', () => {
    mountInline({ ...ADDR, latitude: null, longitude: null });
    text('City', 'Thane');
    expect(pair()).toEqual(NO_PAIR);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });
});

describe('AddressPicker — programmatic fills never invalidate the pin', () => {
  it('the pincode lookup (onFill) fills state/city/district and keeps the pair', () => {
    const { rerender } = mountInline();
    mockPincodeData = { state: 'Gujarat', city: 'Surat', district: 'Surat District' }; // differs from the form, so we can see onFill ran
    rerender(<Harness initial={ADDR} />);       // deliver the lookup result to PincodeInput
    expect(latest).toMatchObject({ state: 'Gujarat', city: 'Surat', district: 'Surat District' });
    expect(pair()).toEqual(MUMBAI);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });

  it('choosing a search suggestion attaches ITS coordinates and fills the address parts it provides', () => {
    mountInline({ address: '', pincode: '', state: '', city: '', district: '', latitude: null, longitude: null });
    pickPlace(FORT);
    expect(latest).toMatchObject({ address: FORT.label, pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', latitude: FORT.lat, longitude: FORT.lng });
    expect(screen.getByText('📍 18.93220, 72.83470 · Search')).toBeTruthy();
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });

  it('a typed address is kept when a suggestion is chosen; empty components change nothing else', () => {
    mountInline();
    pickPlace({ label: 'Somewhere', lat: 21.1458, lng: 79.0882, placeId: '', components: {} });
    expect(latest).toMatchObject({ address: '12 MG Road, Fort', city: 'Mumbai', pincode: '400001', latitude: 21.1458, longitude: 79.0882 });
  });

  it('an invalid suggestion attaches nothing', () => {
    mountInline();
    pickPlace({ label: 'Broken', lat: NaN, lng: 5, components: { city: 'Pune' } });
    expect(latest).toMatchObject({ city: 'Mumbai', ...MUMBAI });
  });

  it('a replacement place chosen after an edit restores a valid pair and clears the warning', () => {
    mountInline();
    text('House no., street, area…', 'Changed by hand');
    expect(pair()).toEqual(NO_PAIR);
    pickPlace(PUNE);
    expect(pair()).toEqual({ latitude: PUNE.lat, longitude: PUNE.lng });
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });

  it('a GPS fix attaches the point (labelled GPS), and editing afterwards clears it', async () => {
    mountInline({ ...ADDR, latitude: null, longitude: null });
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    expect(pair()).toEqual({ latitude: 28.6139, longitude: 77.209 });
    expect(screen.getByText('📍 28.61390, 77.20900 · GPS')).toBeTruthy();
    text('House no., street, area…', 'Typed after GPS');
    expect(pair()).toEqual(NO_PAIR);
  });

  it('a GPS fix after an edit restores a valid pair', async () => {
    mountInline();
    text('City', 'Thane');
    await confirmOnMap({ latitude: 12.9716, longitude: 77.5946 }, 'gps');
    expect(pair()).toEqual({ latitude: 12.9716, longitude: 77.5946 });
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });

  it('map confirm with an EMPTY address labels it through reverse geocoding (the GPS flow keeps its request); with a typed address it asks nothing', async () => {
    reverseGeocodeLocation.mockResolvedValue({ displayName: 'Connaught Place, New Delhi', components: {} });
    mountInline({ address: '', pincode: '', state: '', city: '', district: '', latitude: null, longitude: null });
    await confirmOnMap({ latitude: 28.6139, longitude: 77.209 }, 'gps');
    await waitFor(() => expect(latest.address).toBe('Connaught Place, New Delhi'));
    expect(reverseGeocodeLocation).toHaveBeenCalledTimes(1);
    expect(pair()).toEqual({ latitude: 28.6139, longitude: 77.209 });
  });

  it('search selection makes no reverse-geocoding request', async () => {
    mountInline();
    pickPlace(FORT);
    await act(async () => {});
    expect(reverseGeocodeLocation).not.toHaveBeenCalled();
  });

  it('the picker opens on the current pin (not the one from an earlier selection)', () => {
    mountInline();
    pickPlace(PUNE);
    fireEvent.press(screen.getByText(/^📍/));
    expect(JSON.parse(screen.getByTestId('picker-initial').props.children)).toEqual({ latitude: PUNE.lat, longitude: PUNE.lng });
  });
});

describe('AddressPicker — switching between saved addresses', () => {
  const HOME = { _id: 'a1', label: 'Home', isDefault: true, address: 'Home Street 1', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City', ...MUMBAI };
  const OFFICE = { _id: 'a2', label: 'Office', isDefault: false, address: 'Office Park 7', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' }; // no coordinates
  const HALF = { _id: 'a3', label: 'Other', isDefault: false, address: 'Half Pair Lane', pincode: '110001', state: 'Delhi', city: 'New Delhi', district: 'Delhi', latitude: 28.6 }; // corrupt: latitude only

  const mountSaved = () => {
    useAddresses.mockReturnValue({ addresses: [HOME, OFFICE, HALF], loading: false, addAddress: jest.fn(), updateAddress: jest.fn(), deleteAddress: jest.fn() });
    return render(<Harness initial={{ address: '', pincode: '', state: '', city: '', district: '' }} />);
  };

  it('the default saved address is selected on open WITH its own pin, and is not stale', async () => {
    mountSaved();
    await waitFor(() => expect(latest.address).toBe('Home Street 1'));
    expect(pair()).toEqual(MUMBAI);
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });

  it('even when the pincode lookup fires for the opened address, the pin survives', async () => {
    mockPincodeData = { state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City' };
    mountSaved();
    await waitFor(() => expect(latest.address).toBe('Home Street 1'));
    expect(pair()).toEqual(MUMBAI);
  });

  it('switching to an address without coordinates leaves null / null — nothing leaks from the previous selection', async () => {
    mountSaved();
    await waitFor(() => expect(latest.address).toBe('Home Street 1'));
    fireEvent.press(screen.getByText('Office Park 7'));
    expect(latest.address).toBe('Office Park 7');
    expect(pair()).toEqual(NO_PAIR);
  });

  it('a saved address holding half a pair is selected as null / null', async () => {
    mountSaved();
    await waitFor(() => expect(latest.address).toBe('Home Street 1'));
    fireEvent.press(screen.getByText('Half Pair Lane'));
    expect(pair()).toEqual(NO_PAIR);
  });

  it('"Enter a new address" starts clean: no pin, no warning', async () => {
    mountSaved();
    await waitFor(() => expect(latest.address).toBe('Home Street 1'));
    fireEvent.press(screen.getByText('Enter a new address'));
    expect(pair()).toEqual(NO_PAIR);
    expect(latest.address).toBe('');
    expect(screen.queryByTestId('stale-pin-notice')).toBeNull();
  });
});

describe('AddressPicker — saving the typed address to the address book', () => {
  const mountForSave = (initial) => {
    const addAddress = jest.fn().mockResolvedValue([{ _id: 'new', label: 'Home', ...ADDR }]);
    useAddresses.mockReturnValue({ addresses: [], loading: false, addAddress, updateAddress: jest.fn(), deleteAddress: jest.fn() });
    render(<Harness initial={initial} />);
    fireEvent.press(screen.getByText('Save this address for future bookings'));
    return addAddress;
  };

  it('sends the pair when the address is unchanged since the pin was set', async () => {
    const addAddress = mountForSave(ADDR);
    fireEvent.press(screen.getByText('Save Address'));
    await waitFor(() => expect(addAddress).toHaveBeenCalled());
    expect(addAddress.mock.calls[0][0]).toMatchObject({ address: ADDR.address, ...MUMBAI });
  });

  it('sends null / null (never half a pair) when the address was edited after the pin', async () => {
    const addAddress = mountForSave(ADDR);
    text('House no., street, area…', 'Edited after pin');
    fireEvent.press(screen.getByText('Save Address'));
    await waitFor(() => expect(addAddress).toHaveBeenCalled());
    expect(addAddress.mock.calls[0][0]).toMatchObject({ address: 'Edited after pin', ...NO_PAIR });
  });

  it('a corrupt half pair held by the parent is sent as null / null', async () => {
    const addAddress = mountForSave({ ...ADDR, longitude: null });
    fireEvent.press(screen.getByText('Save Address'));
    await waitFor(() => expect(addAddress).toHaveBeenCalled());
    expect(addAddress.mock.calls[0][0]).toMatchObject(NO_PAIR);
  });
});
