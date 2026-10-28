import React from 'react';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react-native';
import MapPicker from '../MapPicker';
import { formatPinLabel } from '../../../utils/locationPin';
import { getTranslator } from '../../../i18n/translate';
import { OSM_COPYRIGHT_URL, OSM_TILE_USER_AGENT } from '../../../utils/mapConfig';
import { latLngToWorldPixel, panCenter, pointAt, TILE_SIZE } from '../../../utils/slippyMap';

// Day 29 (issue B): on Android the picker now shows a REAL interactive map — OpenStreetMap raster tiles drawn with plain React Native
// views (the same provider and tiling as the website's Leaflet picker; no key, no dependency, no native change). Nothing about map
// availability is mocked here: the real helper decides, on Android. Jest cannot draw pixels, so what is verified is the tile URLs the
// app requests, the gesture → coordinate arithmetic, and the state that ends up in onConfirm — not how it looks on a device.
const mockMapMounted = jest.fn();
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: (props) => { mockMapMounted(); return React.createElement(View, { testID: 'map-view', ...props }); } };
});
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));

const originalOS = Platform.OS;
const DELHI = { latitude: 28.6139, longitude: 77.209 };
const VIEW = { width: 400, height: 600 };
const en = getTranslator('en');

beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'android'; });
afterEach(() => { Platform.OS = originalOS; });

const open = (props = {}) => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  const utils = render(<MapPicker visible initialCoords={null} onConfirm={onConfirm} onClose={onClose} {...props} />);
  fireEvent(screen.getByLabelText('Map'), 'layout', { nativeEvent: { layout: VIEW } });   // give the map a size, as the device does
  return { onConfirm, onClose, ...utils };
};
const surface = () => screen.getByLabelText('Map');
const touch = (pageX, pageY, locationX = pageX, locationY = pageY, touches = []) => ({ nativeEvent: { pageX, pageY, locationX, locationY, touches } });
const grant = (x, y, lx, ly) => fireEvent(surface(), 'responderGrant', touch(x, y, lx, ly));
const move = (x, y, touches) => fireEvent(surface(), 'responderMove', touch(x, y, x, y, touches));
const release = (x = 0, y = 0) => fireEvent(surface(), 'responderRelease', touch(x, y));
const drag = (fromX, fromY, toX, toY) => { grant(fromX, fromY); move(toX, toY); release(toX, toY); };
const tileUris = () => screen.queryAllByTestId('osm-tile').map((t) => t.props.source.uri);
const zoomOfTiles = () => Number(tileUris()[0].split('/').slice(-3)[0]);
const selection = () => screen.getByTestId('picker-selection').props.children;
const pressConfirm = () => fireEvent.press(screen.getByText('Confirm Location'));
const near = (a, b, eps = 1e-5) => Math.abs(a - b) < eps;

describe('Android renders a real OpenStreetMap tile map', () => {
  it('mounts the tile map, not the Google-backed native view, and not the old "unavailable" notice', () => {
    open({ initialCoords: DELHI });
    expect(mockMapMounted).not.toHaveBeenCalled();
    expect(screen.queryByTestId('map-view')).toBeNull();
    expect(screen.queryByTestId('map-unavailable')).toBeNull();
    expect(screen.getByTestId('osm-map')).toBeTruthy();
    expect(screen.getByTestId('map-marker')).toBeTruthy();
  });

  it('requests actual OSM tiles — https, {z}/{x}/{y}.png — for the area around the saved point, identifying the app', () => {
    open({ initialCoords: DELHI });
    const tiles = screen.getAllByTestId('osm-tile');
    expect(tiles.length).toBeGreaterThanOrEqual(8);
    tiles.forEach((t) => {
      expect(t.props.source.uri).toMatch(/^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
      expect(t.props.source.headers['User-Agent']).toBe(OSM_TILE_USER_AGENT);
    });
    expect(tileUris()).toContain('https://tile.openstreetmap.org/16/46822/27326.png');   // the OSM tile that contains Delhi at zoom 16
    expect(new Set(tileUris()).size).toBe(tileUris().length);
  });

  it('shows the OpenStreetMap attribution, which opens the OSM copyright page', () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue();
    open({ initialCoords: DELHI });
    expect(screen.getByText('© OpenStreetMap contributors')).toBeTruthy();
    fireEvent.press(screen.getByTestId('osm-attribution'));
    expect(Linking.openURL).toHaveBeenCalledWith(OSM_COPYRIGHT_URL);
  });

  it('no saved location: whole-country view, and the centre of India cannot be confirmed untouched', () => {
    const { onConfirm } = open();
    expect(zoomOfTiles()).toBe(5);
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('picker-selection')).toBeNull();
  });

  it.each([
    ['NaN', { latitude: NaN, longitude: 72 }], ['out of range', { latitude: 200, longitude: 400 }], ['0,0 placeholder', { latitude: 0, longitude: 0 }],
  ])('invalid saved coordinates (%s) never reach the map: default view, nothing confirmable', (_n, bad) => {
    const { onConfirm } = open({ initialCoords: bad });
    expect(zoomOfTiles()).toBe(5);
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a saved location is shown, labelled "Saved", and confirmable unchanged', () => {
    const { onConfirm } = open({ initialCoords: { latitude: '28.6139', longitude: '77.209' } });
    expect(selection()).toBe(formatPinLabel(DELHI, 'saved', en));
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(DELHI, { source: 'saved' });
  });
});

describe('pan, tap, zoom: the selection, the pin and what is confirmed stay in sync', () => {
  it('dragging the map moves the point under the fixed pin; the selection and the confirmed coordinates are that point', () => {
    const { onConfirm } = open({ initialCoords: DELHI });
    drag(100, 300, 220, 380);                                          // drag right 120 px and down 80 px
    const expected = panCenter(DELHI, 16, 120, 80);
    expect(expected.longitude).toBeLessThan(DELHI.longitude);          // the map followed the finger, so the pin is now further west/north
    expect(expected.latitude).toBeGreaterThan(DELHI.latitude);
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [point, meta] = onConfirm.mock.calls[0];
    expect(near(point.latitude, expected.latitude)).toBe(true);
    expect(near(point.longitude, expected.longitude)).toBe(true);
    expect(meta).toEqual({ source: 'map' });
    expect(selection()).toBe(formatPinLabel(point, 'map', en));   // the label shown to the user is the same point
  });

  it('the tiles slide with the finger while dragging, and settle on the new centre afterwards', () => {
    open({ initialCoords: DELHI });
    const lefts = () => screen.getAllByTestId('osm-tile').map((t) => t.props.style).map((s) => [].concat(s).reduce((a, b) => ({ ...a, ...b }), {}).left);
    const before = lefts();
    grant(100, 300); move(190, 300);
    expect(lefts()[0] - before[0]).toBe(90);                           // live pan offset
    release(190, 300);
    // After release the centre has moved by the same 90 px, so the tile grid is back at (about) the same screen positions.
    expect(Math.abs(lefts()[0] - before[0])).toBeLessThanOrEqual(256);
  });

  it('a tap moves the pin to the tapped point (and leaves the zoom alone)', () => {
    const { onConfirm } = open({ initialCoords: DELHI });
    grant(300, 200, 300, 200); release(300, 200);                      // no movement → a tap, 100 px right and 100 px above the middle
    const expected = pointAt({ center: DELHI, zoom: 16, ...VIEW, px: 300, py: 200 });
    pressConfirm();
    const [point, meta] = onConfirm.mock.calls[0];
    expect(near(point.latitude, expected.latitude)).toBe(true);
    expect(near(point.longitude, expected.longitude)).toBe(true);
    expect(point.longitude).toBeGreaterThan(DELHI.longitude);
    expect(point.latitude).toBeGreaterThan(DELHI.latitude);
    expect(meta).toEqual({ source: 'map' });
    expect(zoomOfTiles()).toBe(16);
  });

  it('a tiny finger wobble is still a tap, not a pan', () => {
    const { onConfirm } = open({ initialCoords: DELHI });
    grant(200, 300, 200, 300); move(203, 302); release(203, 302);
    pressConfirm();
    const [point] = onConfirm.mock.calls[0];
    expect(near(point.latitude, DELHI.latitude, 1e-4)).toBe(true);      // tapped (almost) the centre → essentially unchanged
    expect(near(point.longitude, DELHI.longitude, 1e-4)).toBe(true);
  });

  it('the zoom buttons change the tile zoom and keep the centre; they stop at the limits', () => {
    const { onConfirm } = open({ initialCoords: DELHI });
    fireEvent.press(screen.getByLabelText('Zoom in'));
    expect(zoomOfTiles()).toBe(17);
    fireEvent.press(screen.getByLabelText('Zoom out'));
    fireEvent.press(screen.getByLabelText('Zoom out'));
    expect(zoomOfTiles()).toBe(15);
    for (let i = 0; i < 30; i += 1) fireEvent.press(screen.getByLabelText('Zoom in'));
    expect(zoomOfTiles()).toBe(18);
    expect(screen.getByLabelText('Zoom in').props.accessibilityState?.disabled ?? screen.getByTestId('map-zoom-in').props.disabled).toBeTruthy();
    for (let i = 0; i < 30; i += 1) fireEvent.press(screen.getByLabelText('Zoom out'));
    expect(zoomOfTiles()).toBe(3);
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(DELHI, { source: 'saved' });   // zooming never moves or re-sources the selection
  });

  it('zooming alone does not make the untouched India view confirmable', () => {
    const { onConfirm } = open();
    fireEvent.press(screen.getByLabelText('Zoom in'));
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('pinching two fingers apart zooms in one step; together zooms out; neither moves the selection', () => {
    const { onConfirm } = open({ initialCoords: DELHI });
    const fingers = (d) => [{ pageX: 200 - d / 2, pageY: 300 }, { pageX: 200 + d / 2, pageY: 300 }];
    grant(150, 300); move(150, 300, fingers(100)); move(150, 300, fingers(210)); release();
    expect(zoomOfTiles()).toBe(17);
    grant(150, 300); move(150, 300, fingers(200)); move(150, 300, fingers(95)); release();
    expect(zoomOfTiles()).toBe(16);
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith(DELHI, { source: 'saved' });
  });

  it('after a pan the same point comes out whatever the zoom: pan arithmetic is consistent at street level and city level', () => {
    const { onConfirm } = open({ initialCoords: DELHI });
    fireEvent.press(screen.getByLabelText('Zoom out'));                // zoom 15
    drag(200, 300, 100, 300);
    const expected = panCenter(DELHI, 15, -100, 0);
    pressConfirm();
    const [point] = onConfirm.mock.calls[0];
    expect(near(point.longitude, expected.longitude)).toBe(true);
    const px = latLngToWorldPixel(point, 15).x - latLngToWorldPixel(DELHI, 15).x;
    expect(Math.round(px)).toBe(100);                                   // exactly the 100 px the finger travelled, at this zoom
    expect(TILE_SIZE).toBe(256);
  });
});

describe('current location (GPS) on the tile map', () => {
  it('moves the pin to the GPS fix at street zoom, labels it GPS and confirms it', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 19.076, longitude: 72.8777 } });
    const { onConfirm } = open();
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('picker-selection')).toBeTruthy());
    expect(zoomOfTiles()).toBe(16);
    expect(tileUris().some((u) => u.includes('/16/45'))).toBe(false);      // no longer the Delhi tiles
    pressConfirm();
    expect(onConfirm).toHaveBeenCalledWith({ latitude: 19.076, longitude: 72.8777 }, { source: 'gps' });
    expect(mockMapMounted).not.toHaveBeenCalled();
  });

  it('a denied permission leaves the selection untouched and unconfirmable', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    const { onConfirm } = open();
    fireEvent.press(screen.getByText('Use My Current Location'));
    await waitFor(() => expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled());
    await act(async () => {});
    pressConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Close still works', () => {
    const { onClose } = open();
    fireEvent.press(screen.UNSAFE_getAllByType(require('react-native').TouchableOpacity)[0]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('tile loading failure', () => {
  const failTiles = (n) => screen.getAllByTestId('osm-tile').slice(0, n).forEach((t) => fireEvent(t, 'error'));

  it('shows a loading indicator until the first tile arrives', () => {
    open({ initialCoords: DELHI });
    expect(screen.getByTestId('osm-loading')).toBeTruthy();
    fireEvent(screen.getAllByTestId('osm-tile')[0], 'load');
    expect(screen.queryByTestId('osm-loading')).toBeNull();
  });

  it('when no tile can be loaded it says so and offers Try again; the rest of the picker keeps working', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: DELHI });
    const { onConfirm } = open({ initialCoords: DELHI });
    failTiles(4);
    expect(screen.getByTestId('map-unavailable')).toBeTruthy();
    expect(screen.getByText('The map could not be loaded. Check your internet connection.')).toBeTruthy();
    expect(screen.getByText(/Use your current location, or go back and search for or type the address/)).toBeTruthy();
    expect(screen.queryByTestId('osm-map')).toBeNull();
    pressConfirm();                                                      // the saved point is still confirmable without the map
    expect(onConfirm).toHaveBeenCalledWith(DELHI, { source: 'saved' });
  });

  it('Try again reloads the map', () => {
    open({ initialCoords: DELHI });
    failTiles(4);
    fireEvent.press(screen.getByLabelText('Try place search again'));
    expect(screen.queryByTestId('map-unavailable')).toBeNull();
    expect(screen.getByTestId('osm-map')).toBeTruthy();
  });

  it('a few failed tiles among loaded ones are not a failure (patchy network)', () => {
    open({ initialCoords: DELHI });
    fireEvent(screen.getAllByTestId('osm-tile')[0], 'load');
    failTiles(5);
    expect(screen.queryByTestId('map-unavailable')).toBeNull();
    expect(screen.getByTestId('osm-map')).toBeTruthy();
  });
});

describe('iOS is unchanged', () => {
  it('on iOS the native map view is mounted and the tile map is not', () => {
    Platform.OS = 'ios';
    render(<MapPicker visible initialCoords={{ latitude: 19.076, longitude: 72.8777 }} onConfirm={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('map-view')).toBeTruthy();
    expect(screen.queryByTestId('osm-map')).toBeNull();
    expect(screen.queryByTestId('map-unavailable')).toBeNull();
  });
});
