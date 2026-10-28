import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import LocationSearch from '../LocationSearch';
import { autocompletePlaces } from '../../../services/geocodingService';

jest.mock('../../../services/geocodingService', () => ({ autocompletePlaces: jest.fn() }));

const PLACEHOLDER = 'Search your locality, city, or address…';
const FORT = {
  label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:fort',
  components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City' },
};
const PUNE = { label: 'Pune, Maharashtra, India', lat: 18.5204, lng: 73.8567, placeId: 'ola:pune', components: {} };

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const type = (text) => fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), text);
const tick = async (ms = 350) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => {
  jest.useFakeTimers();
  autocompletePlaces.mockReset();
});
afterEach(() => { jest.useRealTimers(); });

describe('LocationSearch — typing', () => {
  it('does not search until 3 characters have been typed', async () => {
    render(<LocationSearch onSelect={jest.fn()} />);
    type('Fo');
    await tick(1000);
    expect(autocompletePlaces).not.toHaveBeenCalled();
  });

  it('debounces: only the final text of a burst is searched, after 350 ms of quiet', async () => {
    autocompletePlaces.mockResolvedValue({ found: true, results: [FORT] });
    render(<LocationSearch onSelect={jest.fn()} />);
    type('For'); await tick(200);
    type('Fort'); await tick(200);
    type('Fort '); await tick(349);
    expect(autocompletePlaces).not.toHaveBeenCalled();
    await tick(1);
    expect(autocompletePlaces).toHaveBeenCalledTimes(1);
    expect(autocompletePlaces).toHaveBeenCalledWith('Fort ');
  });
});

describe('LocationSearch — selection', () => {
  it('passes the COMPLETE normalized result (label, coordinates, placeId, components) and fills the box with the label', async () => {
    autocompletePlaces.mockResolvedValue({ found: true, results: [FORT, PUNE] });
    const onSelect = jest.fn();
    render(<LocationSearch onSelect={onSelect} />);
    type('Fort'); await tick(); await flush();
    fireEvent.press(screen.getByText(FORT.label));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(FORT);
    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe(FORT.label);
    expect(screen.queryByText(PUNE.label)).toBeNull(); // dropdown closed
  });

  it('a suggestion without components still selects normally (manual entry continues)', async () => {
    autocompletePlaces.mockResolvedValue({ found: true, results: [PUNE] });
    const onSelect = jest.fn();
    render(<LocationSearch onSelect={onSelect} />);
    type('Pune'); await tick(); await flush();
    fireEvent.press(screen.getByText(PUNE.label));
    expect(onSelect).toHaveBeenCalledWith(PUNE);
  });
});

describe('LocationSearch — stale responses', () => {
  it('a slow older response cannot replace the suggestions of a newer search', async () => {
    const older = deferred(); const newer = deferred();
    autocompletePlaces.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<LocationSearch onSelect={jest.fn()} />);
    type('Mum'); await tick();
    type('Mumbai'); await tick();
    newer.resolve({ found: true, results: [FORT] });
    await flush();
    older.resolve({ found: true, results: [PUNE] });
    await flush();
    expect(screen.getByText(FORT.label)).toBeTruthy();
    expect(screen.queryByText(PUNE.label)).toBeNull();
  });

  it('a response that arrives after the text was shortened below 3 characters does not reopen the dropdown', async () => {
    const inflight = deferred();
    autocompletePlaces.mockReturnValueOnce(inflight.promise);
    render(<LocationSearch onSelect={jest.fn()} />);
    type('Mumbai'); await tick();
    type('Mu'); // cleared before the answer arrives
    inflight.resolve({ found: true, results: [FORT] });
    await flush();
    expect(screen.queryByText(FORT.label)).toBeNull();
    expect(screen.queryByText(/No matching places/)).toBeNull();
  });

  it('unmounting while a search is in flight is harmless', async () => {
    const inflight = deferred();
    autocompletePlaces.mockReturnValueOnce(inflight.promise);
    const { unmount } = render(<LocationSearch onSelect={jest.fn()} />);
    type('Mumbai'); await tick();
    unmount();
    inflight.resolve({ found: true, results: [FORT] });
    await expect(flush()).resolves.toBeUndefined();
  });
});

describe('LocationSearch — empty vs unavailable', () => {
  it('a search that matched nothing shows the existing no-results message, and no retry', async () => {
    autocompletePlaces.mockResolvedValue({ found: false });
    render(<LocationSearch onSelect={jest.fn()} />);
    type('zzzzzz'); await tick(); await flush();
    expect(screen.getByText('No matching places found. Fill the fields below manually.')).toBeTruthy();
    expect(screen.queryByTestId('place-search-unavailable')).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('a provider / network failure shows a calm "temporarily unavailable" message — not "no matching places" — with a retry', async () => {
    autocompletePlaces.mockResolvedValue({ found: false, unavailable: true });
    render(<LocationSearch onSelect={jest.fn()} />);
    type('Mumbai'); await tick(); await flush();
    expect(screen.getByTestId('place-search-unavailable')).toBeTruthy();
    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/No matching places/)).toBeNull();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('Try again repeats the same text immediately and shows the suggestions when the service has recovered', async () => {
    autocompletePlaces.mockResolvedValueOnce({ found: false, unavailable: true }).mockResolvedValueOnce({ found: true, results: [FORT] });
    render(<LocationSearch onSelect={jest.fn()} />);
    type('Mumbai'); await tick(); await flush();
    fireEvent.press(screen.getByText('Try again'));
    await flush();
    expect(autocompletePlaces).toHaveBeenCalledTimes(2);
    expect(autocompletePlaces).toHaveBeenLastCalledWith('Mumbai');
    expect(screen.getByText(FORT.label)).toBeTruthy();
    expect(screen.queryByTestId('place-search-unavailable')).toBeNull();
  });

  it('a retry that fails again keeps the unavailable state', async () => {
    autocompletePlaces.mockResolvedValue({ found: false, unavailable: true });
    render(<LocationSearch onSelect={jest.fn()} />);
    type('Mumbai'); await tick(); await flush();
    fireEvent.press(screen.getByText('Try again')); await flush();
    expect(screen.getByTestId('place-search-unavailable')).toBeTruthy();
  });

  it('a session expiry (401) is not shown as "no places" or "unavailable": the dropdown simply closes (the API client handles sign-out)', async () => {
    autocompletePlaces.mockResolvedValue({ found: false, sessionExpired: true });
    render(<LocationSearch onSelect={jest.fn()} />);
    type('Mumbai'); await tick(); await flush();
    expect(screen.queryByText(/No matching places/)).toBeNull();
    expect(screen.queryByTestId('place-search-unavailable')).toBeNull();
  });
});
