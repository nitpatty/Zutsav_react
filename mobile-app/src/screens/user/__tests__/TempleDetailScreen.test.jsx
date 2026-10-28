import React from 'react';
import { Image } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import api from '../../../api/axios';
import TempleDetailScreen from '../TempleDetailScreen';

// Keep the real `imageUrl` (so the image URL mapping is exercised); stub only the HTTP client.
jest.mock('../../../api/axios', () => {
  const actual = jest.requireActual('../../../api/axios');
  return { __esModule: true, ...actual, default: { get: jest.fn() } };
});
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

// Synthetic document shaped like backend/src/models/Temple.js.
const temple = (over = {}) => ({
  _id: 't1', name: 'Sri Test Temple', address: '12 Temple Road', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001',
  description: 'An ancient temple.', category: 'Shaiva', primaryDeity: 'Shiva', openingHours: '5:00 AM – 9:00 PM',
  coverImage: 'uploads/temples/cover.jpg', images: ['uploads/temples/a.jpg', '/uploads/temples/b.jpg'], ...over,
});

const renderDetail = (t, params) => render(<TempleDetailScreen route={{ params: { templeId: 't1', temple: t, ...params } }} />);

beforeEach(() => api.get.mockReset());

describe('TempleDetailScreen (F-13)', () => {
  it('shows the real address, primary deity, opening hours, category and description', () => {
    renderDetail(temple());
    expect(screen.getByText('12 Temple Road, Madurai, Tamil Nadu, 625001')).toBeTruthy();
    expect(screen.getAllByText('Shiva').length).toBeGreaterThan(0);
    expect(screen.getByText('5:00 AM – 9:00 PM')).toBeTruthy();
    expect(screen.getByText('Shaiva')).toBeTruthy();
    expect(screen.getByText('An ancient temple.')).toBeTruthy();
    expect(screen.getByText('Address')).toBeTruthy();
    expect(screen.getByText('Opening Hours')).toBeTruthy();
    expect(screen.getByText('Primary Deity')).toBeTruthy();
  });

  it('does not show Phone/Website rows or any value the backend does not provide', () => {
    renderDetail(temple({ phone: '9999999999', website: 'https://x.invalid', deity: 'WRONG', street: 'WRONG', timings: 'WRONG' }));
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText('Website')).toBeNull();
    expect(screen.queryByText(/9999999999|x\.invalid|WRONG/)).toBeNull();
  });

  it('renders the gallery (cover first, then images) using resolved image URLs', () => {
    const { UNSAFE_getAllByType } = renderDetail(temple());
    const thumbs = UNSAFE_getAllByType(Image);
    expect(thumbs.map((i) => i.props.source.uri)).toEqual([
      'https://api.test.invalid/uploads/temples/cover.jpg',
      'https://api.test.invalid/uploads/temples/a.jpg',
      'https://api.test.invalid/uploads/temples/b.jpg', // leading slash normalised, no double slash
    ]);
    expect(screen.getByLabelText('Open photo 1 of 3')).toBeTruthy();
  });

  it('opens a full-screen viewer on tap and closes it', () => {
    renderDetail(temple());
    expect(screen.queryByLabelText('Close photo viewer')).toBeNull();

    fireEvent.press(screen.getByLabelText('Open photo 2 of 3'));
    expect(screen.getByLabelText('Close photo viewer')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Close photo viewer'));
    expect(screen.queryByLabelText('Close photo viewer')).toBeNull();
  });

  it('falls back to a placeholder when an image fails to load', () => {
    renderDetail(temple({ coverImage: '', images: ['uploads/temples/broken.jpg'] }));
    const btn = screen.getByLabelText('Open photo 1 of 1');
    fireEvent(within(btn).UNSAFE_getByType(Image), 'error');
    expect(within(screen.getByLabelText('Open photo 1 of 1')).UNSAFE_queryByType(Image)).toBeNull();
  });

  it('shows a plain note — no fake picture — when the temple has no images', () => {
    const { UNSAFE_queryAllByType } = renderDetail(temple({ coverImage: '', images: [] }));
    expect(screen.getByText('No gallery images available')).toBeTruthy();
    expect(UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('handles a minimal temple without optional data (no description, deity, hours, category)', () => {
    renderDetail({ _id: 't2', name: 'Bare Temple', address: 'Main St', city: 'Pune', state: 'Maharashtra' });
    expect(screen.getAllByText('Bare Temple').length).toBeGreaterThan(0);
    expect(screen.getByText('Main St, Pune, Maharashtra')).toBeTruthy();
    expect(screen.queryByText('Opening Hours')).toBeNull();
    expect(screen.queryByText('Primary Deity')).toBeNull();
    expect(screen.queryByText('About')).toBeNull();
    expect(screen.getByText('No gallery images available')).toBeTruthy();
  });

  it('loads by id when opened without a temple document (response key `temple`)', async () => {
    api.get.mockResolvedValue({ data: { success: true, temple: temple() } });
    render(<TempleDetailScreen route={{ params: { templeId: 't1' } }} />);
    expect(await screen.findByText('12 Temple Road, Madurai, Tamil Nadu, 625001')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/temples/t1');
  });
});
