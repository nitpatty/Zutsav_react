import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import LivestreamsScreen from '../LivestreamsScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

// Synthetic body in the exact shape of GET /api/livestreams.
const stream = (over = {}) => ({
  _id: 's1', title: 'Evening Aarti', description: 'Live from the sanctum', isActive: true,
  youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  templeId: { _id: 't1', name: 'Kashi Vishwanath', city: 'Varanasi', state: 'Uttar Pradesh' }, ...over,
});

let openURL;
beforeEach(() => {
  api.get.mockReset();
  Toast.show.mockClear();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => openURL.mockRestore());

describe('LivestreamsScreen (F-12)', () => {
  it('loads from /livestreams without the unsupported status/sort query and shows active streams', async () => {
    api.get.mockResolvedValue({ data: { success: true, livestreams: [stream(), stream({ _id: 's2', title: 'Hidden', isActive: false })] } });
    render(<LivestreamsScreen />);

    expect(await screen.findByText('Evening Aarti')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/livestreams');
    expect(screen.getByText('Live from the sanctum')).toBeTruthy();
    expect(screen.getByText('Kashi Vishwanath · Varanasi, Uttar Pradesh')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('tapping a valid stream opens its YouTube URL', async () => {
    api.get.mockResolvedValue({ data: { livestreams: [stream()] } });
    render(<LivestreamsScreen />);

    fireEvent.press(await screen.findByLabelText('Watch Evening Aarti'));

    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('opens a youtu.be short link', async () => {
    api.get.mockResolvedValue({ data: { livestreams: [stream({ youtubeUrl: 'https://youtu.be/abc123' })] } });
    render(<LivestreamsScreen />);
    fireEvent.press(await screen.findByLabelText('Watch Evening Aarti'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://youtu.be/abc123'));
  });

  it.each([
    ['a non-YouTube host', 'https://evil.example/watch?v=1'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a malformed value', 'not a url'],
    ['an empty value', ''],
  ])('never opens %s — the card is shown as unavailable', async (_label, youtubeUrl) => {
    api.get.mockResolvedValue({ data: { livestreams: [stream({ youtubeUrl })] } });
    render(<LivestreamsScreen />);

    expect(await screen.findByText('This stream link is unavailable.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Evening Aarti (link unavailable)'));

    expect(openURL).not.toHaveBeenCalled();
  });

  it('reports a failure to open (e.g. no handler) instead of crashing', async () => {
    openURL.mockRejectedValueOnce(new Error('No app to handle URL'));
    api.get.mockResolvedValue({ data: { livestreams: [stream()] } });
    render(<LivestreamsScreen />);

    fireEvent.press(await screen.findByLabelText('Watch Evening Aarti'));

    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Could not open this stream' }));
  });

  it('shows the empty state when there are no active streams', async () => {
    api.get.mockResolvedValue({ data: { livestreams: [] } });
    render(<LivestreamsScreen />);
    expect(await screen.findByText('No live streams right now')).toBeTruthy();
  });

  it('shows the empty state and an error toast when loading fails', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    render(<LivestreamsScreen />);
    expect(await screen.findByText('No live streams right now')).toBeTruthy();
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Could not load livestreams' });
  });

  it('handles a stream without a description or temple', async () => {
    api.get.mockResolvedValue({ data: { livestreams: [stream({ description: undefined, templeId: undefined })] } });
    render(<LivestreamsScreen />);
    expect(await screen.findByText('Evening Aarti')).toBeTruthy();
    expect(screen.queryByText(/Kashi/)).toBeNull();
  });
});
