import React from 'react';
import Toast from 'react-native-toast-message';
import * as Location from 'expo-location';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import MapPicker from '../MapPicker';
import { isEmbeddedMapAvailable } from '../../../utils/mapConfig';

const mockAnimate = jest.fn();
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate }));
    return React.createElement(View, { testID: 'map-view', ...props });
  });
  return { __esModule: true, default: MapView };
});
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
// Keep the real coordinate validation, control availability per test (the real helper is covered in mapConfig.test.js).
jest.mock('../../../utils/mapConfig', () => ({
  ...jest.requireActual('../../../utils/mapConfig'),
  isEmbeddedMapAvailable: jest.fn(),
}));

const MUMBAI = { latitude: 19.076, longitude: 72.8777 };
const DELHI = { latitude: 28.6139, longitude: 77.209 };

const renderPicker = (props = {}) => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  const utils = render(<MapPicker visible initialCoords={null} onConfirm={onConfirm} onClose={onClose} {...props} />);
  return { onConfirm, onClose, ...utils };
};
const pressConfirm = () => fireEvent.press(screen.getByText('Confirm Location'));
const toastText = () => Toast.show.mock.calls.map(([a]) => a.text1).join(' | ');

beforeEach(() => {
  jest.clearAllMocks();
  isEmbeddedMapAvailable.mockReturnValue(true);
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: MUMBAI });
});

describe('MapPicker — map available (iOS)', () => {
  it('renders the map and no "unavailable" notice', () => {
    renderPicker();
    expect(screen.getByTestId('map-view')).toBeTruthy();
    expect(screen.queryByTestId('map-unavailable')).toBeNull();
  });

  it('opens on the saved location, accepting numeric strings from the API', () => {
    renderPicker({ initialCoords: { latitude: '19.076', longitude: '72.8777' } });
    expect(screen.getByTestId('map-view').props.initialRegion).toMatchObject(MUMBAI);
  });

  it.each([
    ['NaN', { latitude: NaN, longitude: 72 }], ['out of range', { latitude: 200, longitude: 400 }],
    ['text', { latitude: 'north', longitude: 'east' }], ['0,0 placeholder', { latitude: 0, longitude: 0 }],
  ])('invalid saved coordinates (%s) never reach the native map: default view, nothing confirmable', (_n, bad) => {
    const { onConfirm } = renderPicker({ initialCoords: bad });
    const region = screen.getByTestId('map-view').props.initialRegion;
    expect(region).toMatchObject({ latitude: 20.5937, longitude: 78.9629 }); // India-wide default VIEW
    expect(screen.queryByTestId('picker-selection')).toBeNull();            // ...which is not presented as a selection
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the default India-centre view is never a confirmed location, even after pressing Confirm repeatedly', () => {
    const { onConfirm } = renderPicker();
    expect(screen.queryByTestId('picker-selection')).toBeNull();
    pressConfirm(); pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a valid saved location can be confirmed straight away and is reported as "saved"', () => {
    const { onConfirm } = renderPicker({ initialCoords: MUMBAI });
    expect(screen.getByTestId('picker-selection').props.children).toBe('📍 19.07600, 72.87770 · Saved');
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(MUMBAI, { source: 'saved' });
  });

  it('panning the map selects the centre point and reports the source as "map"', () => {
    const { onConfirm } = renderPicker();
    const map = screen.getByTestId('map-view');
    act(() => { map.props.onPanDrag(); map.props.onRegionChangeComplete({ ...DELHI, latitudeDelta: 0.02, longitudeDelta: 0.02 }); });
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(DELHI, { source: 'map' });
  });
});

describe('MapPicker — GPS ("Use My Current Location")', () => {
  it('a GPS fix becomes the selection, is labelled GPS (no accuracy claimed) and is confirmed as source "gps"', async () => {
    const { onConfirm } = renderPicker();
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(screen.getByTestId('picker-selection').props.children).toBe('📍 19.07600, 72.87770 · GPS'));
    expect(mockAnimate).toHaveBeenCalled();
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(MUMBAI, { source: 'gps' });
    expect(screen.queryByText(/accura/i)).toBeNull();
  });

  it('denied permission: clear message, nothing selected or confirmable', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    const { onConfirm } = renderPicker();
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(toastText()).toMatch(/permission denied/i));
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a failed fix says the current location could not be obtained (a different message from a denial)', async () => {
    Location.getCurrentPositionAsync.mockRejectedValue(new Error('timeout'));
    const { onConfirm } = renderPicker();
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(toastText()).toMatch(/could not get your current location/i));
    expect(toastText()).not.toMatch(/permission denied/i);
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([
    ['NaN', { latitude: NaN, longitude: NaN }], ['0,0', { latitude: 0, longitude: 0 }], ['out of range', { latitude: 95, longitude: 10 }], ['missing', undefined],
  ])('an invalid GPS fix (%s) is rejected: not selected, not confirmable', async (_n, coords) => {
    Location.getCurrentPositionAsync.mockResolvedValue({ coords });
    const { onConfirm } = renderPicker();
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(toastText()).toMatch(/could not get your current location/i));
    expect(screen.queryByTestId('picker-selection')).toBeNull();
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('MapPicker — each opening starts from the latest coordinates', () => {
  const element = (visible, initialCoords, onConfirm = jest.fn()) => (
    <MapPicker visible={visible} initialCoords={initialCoords} onConfirm={onConfirm} onClose={jest.fn()} />
  );

  it('reopening after a different place was chosen shows the NEW place, not the old one', () => {
    const { rerender } = render(element(true, MUMBAI));
    expect(screen.getByTestId('map-view').props.initialRegion).toMatchObject(MUMBAI);

    rerender(element(false, MUMBAI));
    expect(screen.queryByTestId('map-view')).toBeNull();

    rerender(element(true, DELHI)); // the user picked Delhi from search while the picker was closed
    expect(screen.getByTestId('map-view').props.initialRegion).toMatchObject(DELHI);
  });

  it('what the user did in an earlier opening (a pan, a GPS fix) does not leak into the next one', async () => {
    const onConfirm = jest.fn();
    const { rerender } = render(element(true, null, onConfirm));
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(screen.getByTestId('picker-selection')).toBeTruthy());

    rerender(element(false, null, onConfirm));
    rerender(element(true, null, onConfirm)); // reopened with no saved location
    expect(screen.queryByTestId('picker-selection')).toBeNull();
    expect(screen.getByTestId('map-view').props.initialRegion).toMatchObject({ latitude: 20.5937, longitude: 78.9629 });
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a location that was cleared since the last opening opens as "no selection"', () => {
    const { rerender } = render(element(true, MUMBAI));
    expect(screen.getByTestId('picker-selection')).toBeTruthy();
    rerender(element(false, MUMBAI));
    rerender(element(true, null));
    expect(screen.queryByTestId('picker-selection')).toBeNull();
  });
});

describe('MapPicker — native map not available (Android: react-native-maps is Google-backed, not configured) → OpenStreetMap tile map', () => {
  beforeEach(() => isEmbeddedMapAvailable.mockReturnValue(false));

  it('shows the interactive OpenStreetMap tile map (not the old "not available" notice) and never mounts the native map', () => {
    renderPicker();
    expect(screen.getByTestId('osm-map')).toBeTruthy();
    expect(screen.getByTestId('map-marker')).toBeTruthy();
    expect(screen.getByTestId('osm-attribution')).toBeTruthy();
    expect(screen.queryByTestId('map-unavailable')).toBeNull();
    expect(screen.queryByText(/interactive map isn't available/i)).toBeNull();
    expect(screen.queryByTestId('map-view')).toBeNull();
  });

  it('does not let the placeholder India-centre be saved', () => {
    const { onConfirm } = renderPicker();
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('"Use My Current Location" still works, shows what was selected, and then allows Confirm', async () => {
    const { onConfirm } = renderPicker();
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(screen.getByTestId('picker-selection').props.children).toBe('📍 19.07600, 72.87770 · GPS'));
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(MUMBAI, { source: 'gps' });
  });

  it('a saved valid location is still confirmable without the map', () => {
    const { onConfirm } = renderPicker({ initialCoords: MUMBAI });
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(MUMBAI, { source: 'saved' });
  });

  it('close still works', () => {
    const { onClose } = renderPicker();
    fireEvent.press(screen.UNSAFE_getAllByType(require('react-native').TouchableOpacity)[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
