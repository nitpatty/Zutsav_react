import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import BookingDetailScreen from '../BookingDetailScreen';

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const booking = (over = {}) => ({
  _id: 'b0000000000000000000001', status: 'completed', paymentStatus: 'FULLY_PAID', paymentMode: 'FULL',
  grandTotal: 2118, amountPaid: 2118, scheduledDate: '2026-03-01T06:30:00.000Z',
  poojaId: { name: 'Griha Pravesh' }, userDetails: { city: 'Pune' }, auditLog: [], ...over,
});

const route = { params: { bookingId: 'b1' } };
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderWith = async (b) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/bookings/b1') return { data: { booking: b } };
    if (url === '/bookings/b1/refund-preview') return { data: { refundPreview: { grandTotal: 2118, refundableAmount: 1800, nonRefundableTotal: 318 } } };
    throw new Error(`unexpected GET ${url}`);
  });
  render(<BookingDetailScreen navigation={navigation} route={route} />);
  await screen.findByText('Griha Pravesh');
};

const openRatingModal = async () => {
  fireEvent.press(await screen.findByText('Rate this Pooja'));
  await screen.findByText('Rate Your Experience');
};

// Cold start. The very first render of this screen (and the first open of its modals) costs ~2 s on an idle machine — about
// 20x any later test — and many times that under CPU contention. Left alone, that cost lands inside whichever test happens to
// run first (with --randomize, a different one each run): it can exceed Jest's 5 s per-test limit, and a test that times out
// keeps running and leaks its late `api.post` into the next test's assertions. This throw-away render pays the cost once,
// before any test's timed waits. The generous bounds below are only a hook timeout / failure budget: they return as soon as
// the screen is ready and do not slow a passing run.
beforeAll(async () => {
  api.get.mockImplementation(async (url) => {
    if (url === '/bookings/b1') return { data: { booking: booking({ rating: null }) } };
    return { data: { refundPreview: { grandTotal: 2118, refundableAmount: 1800, nonRefundableTotal: 318 } } };
  });
  const view = render(<BookingDetailScreen navigation={navigation} route={route} />);
  fireEvent.press(await screen.findByText('Rate this Pooja', {}, { timeout: 60000 }));
  await screen.findByText('Rate Your Experience', {}, { timeout: 60000 });
  view.unmount();
}, 120000);

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.patch.mockReset();
  Toast.show.mockClear();
});

describe('F-10 — rating payload', () => {
  it('sends the star rating AND the written review as `review` (not `comment`)', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await renderWith(booking());
    await openRatingModal();

    fireEvent.press(screen.getByLabelText('4 stars'));
    fireEvent.changeText(screen.getByPlaceholderText(/Share your experience/), 'Beautiful pooja');
    fireEvent.press(screen.getByText('Submit'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/bookings/b1/rate', { rating: 4, review: 'Beautiful pooja' });
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('comment');
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Thank you for your review!' }));
  });

  it('keeps the default 5-star behaviour and sends an empty review when none is written', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await renderWith(booking());
    await openRatingModal();

    fireEvent.press(screen.getByText('Submit'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bookings/b1/rate', { rating: 5, review: '' }));
  });

  it('trims the review (whitespace-only becomes the accepted empty string)', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await renderWith(booking());
    await openRatingModal();

    fireEvent.changeText(screen.getByPlaceholderText(/Share your experience/), '   \n  ');
    fireEvent.press(screen.getByLabelText('2 stars'));
    fireEvent.press(screen.getByText('Submit'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bookings/b1/rate', { rating: 2, review: '' }));
  });

  it('prevents duplicate submissions while a request is in flight', async () => {
    let release;
    api.post.mockReturnValue(new Promise((r) => { release = r; }));
    await renderWith(booking());
    await openRatingModal();

    fireEvent.press(screen.getByText('Submit'));
    await screen.findByText('Submitting…');
    fireEvent.press(screen.getByText('Submitting…'));
    fireEvent.press(screen.getByText('Submitting…'));

    expect(api.post).toHaveBeenCalledTimes(1);
    release({ data: { success: true } });
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
  });

  it('shows the server message on failure, re-enables Submit, and does not refetch', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'You have already rated this booking' } } });
    await renderWith(booking());
    await openRatingModal();
    const getsBefore = api.get.mock.calls.length;

    fireEvent.press(screen.getByText('Submit'));

    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'You have already rated this booking' }));
    expect(await screen.findByText('Submit')).toBeTruthy(); // back from "Submitting…"
    expect(api.get.mock.calls.length).toBe(getsBefore);
  });

  it('reloads the booking after a successful rating', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await renderWith(booking());
    await openRatingModal();
    const getsBefore = api.get.mock.calls.filter(([u]) => u === '/bookings/b1').length;

    fireEvent.press(screen.getByText('Submit'));

    await waitFor(() => expect(api.get.mock.calls.filter(([u]) => u === '/bookings/b1').length).toBe(getsBefore + 1));
  });
});

describe('Rating eligibility — the "Rate this Pooja" action', () => {
  it('is shown for an eligible, unrated completed booking (rating null or absent)', async () => {
    await renderWith(booking({ status: 'completed', rating: null }));
    expect(screen.getByText('Rate this Pooja')).toBeTruthy();
  });

  it('is shown when the API omits `rating` entirely', async () => {
    const b = booking({ status: 'completed' });
    delete b.rating;
    await renderWith(b);
    expect(screen.getByText('Rate this Pooja')).toBeTruthy();
  });

  it.each([1, 3, 5])('is hidden for a booking already rated %i/5 (persisted `rating`)', async (rating) => {
    await renderWith(booking({ status: 'completed', rating, review: 'Great', ratingDate: '2026-03-02T10:00:00.000Z' }));
    expect(screen.queryByText('Rate this Pooja')).toBeNull();
  });

  it.each(['pending_payment', 'paid', 'pandit_assigned', 'pandit_accepted', 'completion_requested', 'cancelled'])(
    'is hidden for the ineligible state %s even though it is unrated', async (status) => {
      await renderWith(booking({ status, rating: null }));
      expect(screen.queryByText('Rate this Pooja')).toBeNull();
    },
  );

  it('disappears after a successful rating once the booking is reloaded with its rating', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    let rated = false;
    api.get.mockImplementation(async (url) => {
      if (url === '/bookings/b1') return { data: { booking: booking({ status: 'completed', rating: rated ? 4 : null }) } };
      throw new Error(`unexpected GET ${url}`);
    });
    render(<BookingDetailScreen navigation={navigation} route={route} />);
    fireEvent.press(await screen.findByText('Rate this Pooja'));
    await screen.findByText('Rate Your Experience');
    fireEvent.press(screen.getByLabelText('4 stars'));

    rated = true; // what the server now returns
    fireEvent.press(screen.getByText('Submit'));

    await waitFor(() => expect(screen.queryByText('Rate this Pooja')).toBeNull());
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe('F-23 — Cancel eligibility', () => {
  it.each(['completion_requested', 'completed', 'cancelled'])('hides Cancel Booking for %s', async (status) => {
    await renderWith(booking({ status }));
    expect(screen.queryByText('Cancel Booking')).toBeNull();
  });

  it.each(['pending_payment', 'paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment'])(
    'still offers Cancel Booking for %s', async (status) => {
      await renderWith(booking({ status }));
      expect(screen.getByText('Cancel Booking')).toBeTruthy();
    },
  );

  it('keeps the refund-preview and cancel flow intact for a cancellable booking', async () => {
    api.patch.mockResolvedValue({ data: { success: true } });
    await renderWith(booking({ status: 'pandit_accepted' }));

    fireEvent.press(screen.getByText('Cancel Booking'));

    expect(await screen.findByText('Refundable Amount')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/bookings/b1/refund-preview');
    expect(screen.getByText('Non-Refundable')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText(/Reason for cancellation/), ' Change of plans ');
    fireEvent.press(screen.getByText('Confirm Cancel'));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/bookings/b1/cancel', { reason: 'Change of plans' }));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Booking cancelled' }));
  });
});
