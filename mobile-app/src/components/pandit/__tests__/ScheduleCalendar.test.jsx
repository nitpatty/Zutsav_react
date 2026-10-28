import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import ScheduleCalendar, { monthRangeKeys } from '../ScheduleCalendar';

// Day 29 (issue C): the Pandit dashboard calendar. It renders ONLY what GET /pandits/me/schedule-calendar returns (the same
// authoritative per-day data the website's availability calendar uses), with the website's colour meanings and legend. Read-only.

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
// "Today" is the IST day; pin it so the month under test and the today ring are deterministic.
jest.mock('../../../utils/bookingDateRules', () => ({ ...jest.requireActual('../../../utils/bookingDateRules'), todayIST: () => '2026-04-15' }));

const style = (node) => StyleSheet.flatten(node.props.style) || {};
const day = (over) => ({ availability: 'available', status: 'available', bookingCount: 0, scheduleConflict: false, bookings: [], ...over });
const booking = (over = {}) => ({
  _id: 'bk1', bookingNumber: 'ZB-1001', status: 'pandit_accepted', poojaName: 'Griha Pravesh', customerName: 'Asha',
  scheduledTime: '09:00', startMinutes: 540, endMinutes: 660, actionable: false, ...over,
});

const APRIL = {
  days: [
    day({ date: '2026-04-14', status: 'available' }),
    day({ date: '2026-04-15', status: 'available', bookingCount: 2, bookings: [booking(), booking({ _id: 'bk2', bookingNumber: 'ZB-1002', poojaName: 'Satyanarayan Katha', status: 'pandit_assigned', actionable: true, startMinutes: 780, endMinutes: null, customerName: '' })] }),
    day({ date: '2026-04-16', availability: 'leave', status: 'leave', bookingCount: 1, scheduleConflict: true, bookings: [booking({ _id: 'bk3' })] }),
    day({ date: '2026-04-17', availability: 'limited', status: 'limited' }),
    day({ date: '2026-04-18', availability: 'special', status: 'special' }),
    day({ date: '2026-04-19', availability: 'off', status: 'off' }),
    day({ date: '2026-04-20', availability: 'off', status: 'blue', bookingCount: 1, bookings: [booking({ _id: 'bk4', poojaName: 'Rudrabhishek' })] }),
    day({ date: '2026-04-21', availability: 'unavailable', status: 'unavailable' }),
  ],
};
const serve = (byFrom = {}) => api.get.mockImplementation(async (url) => {
  const from = /from=([\d-]+)/.exec(url)?.[1];
  if (byFrom[from] instanceof Error) throw byFrom[from];
  if (from === '2026-04-01') return { data: byFrom[from] || APRIL };
  return { data: byFrom[from] || { days: [] } };
});
const calls = () => api.get.mock.calls.map(([u]) => u);
const dayCount = () => screen.queryAllByTestId(/^cal-day-/).length;
const padCount = () => screen.queryAllByTestId(/^cal-pad-/).length;

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset && f.mockReset()); });

describe('month rendering and alignment', () => {
  it('shows the month and year, Sunday-first weekday headings and the right number of days', async () => {
    serve();
    render(<ScheduleCalendar />);
    expect(await screen.findByText('April 2026')).toBeTruthy();
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((w) => expect(screen.getByText(w)).toBeTruthy());
    expect(dayCount()).toBe(30);
    expect(padCount()).toBe(3);                                     // 1 April 2026 is a Wednesday → three blanks (Sun, Mon, Tue)
    expect(screen.getByTestId('cal-day-2026-04-01')).toBeTruthy();
    expect(screen.getByTestId('cal-day-2026-04-30')).toBeTruthy();
    expect(screen.queryByTestId('cal-day-2026-04-31')).toBeNull();
  });

  it('asks the existing endpoint for exactly the displayed month', async () => {
    serve();
    render(<ScheduleCalendar />);
    await screen.findByText('April 2026');
    expect(calls()).toEqual(['/pandits/me/schedule-calendar?from=2026-04-01&to=2026-04-30']);
    expect(monthRangeKeys(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRangeKeys(2028, 1)).toEqual({ from: '2028-02-01', to: '2028-02-29' });      // leap year
    expect(monthRangeKeys(2026, 11)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('marks today with a ring and selects it by default', async () => {
    serve();
    render(<ScheduleCalendar />);
    await screen.findByText('April 2026');
    const today = screen.getByTestId('cal-day-2026-04-15');
    expect(style(today)).toMatchObject({ borderWidth: 2 });
    expect(style(screen.getByTestId('cal-day-2026-04-14')).borderWidth).toBe(0);            // other days have no ring
    expect(screen.getByLabelText(/15 April 2026.*today/)).toBeTruthy();
    expect(screen.getByText('15 April 2026  ·  Today')).toBeTruthy();
  });
});

describe('navigation', () => {
  it('previous / next month reload that month, keep alignment right, and drop a selection that left the month', async () => {
    serve();
    render(<ScheduleCalendar />);
    await screen.findByText('April 2026');
    fireEvent.press(screen.getByLabelText('Next month'));
    expect(await screen.findByText('May 2026')).toBeTruthy();
    await waitFor(() => expect(calls()).toContain('/pandits/me/schedule-calendar?from=2026-05-01&to=2026-05-31'));
    expect(dayCount()).toBe(31);
    expect(padCount()).toBe(5);                                     // 1 May 2026 is a Friday
    expect(screen.queryByTestId('calendar-selected-day')).toBeNull();   // 15 April is no longer in view → no stale panel

    fireEvent.press(screen.getByLabelText('Previous month'));
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(await screen.findByText('March 2026')).toBeTruthy();
    await waitFor(() => expect(calls()).toContain('/pandits/me/schedule-calendar?from=2026-03-01&to=2026-03-31'));
    expect(padCount()).toBe(0);                                     // 1 March 2026 is a Sunday
    expect(dayCount()).toBe(31);
  });

  it('rolls over the year boundary', async () => {
    serve();
    render(<ScheduleCalendar />);
    await screen.findByText('April 2026');
    for (let i = 0; i < 4; i += 1) fireEvent.press(screen.getByLabelText('Next month'));
    expect(await screen.findByText('August 2026')).toBeTruthy();
    for (let i = 0; i < 4; i += 1) fireEvent.press(screen.getByLabelText('Next month'));
    expect(await screen.findByText('December 2026')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Next month'));
    expect(await screen.findByText('January 2027')).toBeTruthy();
    await waitFor(() => expect(calls()).toContain('/pandits/me/schedule-calendar?from=2027-01-01&to=2027-01-31'));
  });

  it('a late reply for a month the user already left cannot overwrite the month on screen', async () => {
    let releaseApril;
    api.get.mockImplementation((url) => {
      if (url.includes('from=2026-04-01')) return new Promise((r) => { releaseApril = () => r({ data: APRIL }); });
      return Promise.resolve({ data: { days: [day({ date: '2026-05-02', status: 'limited', availability: 'limited' })] } });
    });
    render(<ScheduleCalendar />);
    fireEvent.press(await screen.findByLabelText('Next month'));
    await screen.findByText('May 2026');
    await waitFor(() => expect(style(screen.getByTestId('cal-day-2026-05-02')).backgroundColor).toBe('#FEF9C3'));
    releaseApril();                                                  // April's reply arrives last
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('May 2026')).toBeTruthy();
    expect(style(screen.getByTestId('cal-day-2026-05-02')).backgroundColor).toBe('#FEF9C3');
    expect(screen.queryByTestId('cal-day-2026-04-15')).toBeNull();
  });
});

describe('availability and booking indicators (website colour meanings)', () => {
  it('colours each day from its backend status and adds the booking / conflict dots', async () => {
    serve();
    render(<ScheduleCalendar />);
    await waitFor(() => expect(style(screen.getByTestId('cal-day-2026-04-14')).backgroundColor).toBe('#DCFCE7'));
    const bg = (d) => style(screen.getByTestId(`cal-day-${d}`)).backgroundColor;
    expect(bg('2026-04-14')).toBe('#DCFCE7');                        // available → green
    expect(bg('2026-04-16')).toBe('#FEE2E2');                        // leave → red
    expect(bg('2026-04-21')).toBe('#FEE2E2');                        // unavailable → red
    expect(bg('2026-04-17')).toBe('#FEF9C3');                        // limited → yellow
    expect(bg('2026-04-18')).toBe('#FEF9C3');                        // special → yellow
    expect(bg('2026-04-19')).toBe('transparent');                    // weekly day off → uncoloured
    expect(bg('2026-04-20')).toBe('#3B82F6');                        // booking on a free/off day → solid blue
    expect(bg('2026-04-10')).toBe('transparent');                    // a day the backend did not return → "none"
    expect(screen.getByTestId('cal-booking-2026-04-15')).toBeTruthy();
    expect(screen.getByTestId('cal-booking-2026-04-16')).toBeTruthy();
    expect(screen.getByTestId('cal-booking-2026-04-20')).toBeTruthy();
    expect(screen.queryByTestId('cal-booking-2026-04-17')).toBeNull();
    expect(screen.getByTestId('cal-conflict-2026-04-16')).toBeTruthy();
    expect(screen.queryByTestId('cal-conflict-2026-04-15')).toBeNull();
  });

  it('shows the website legend', async () => {
    serve();
    render(<ScheduleCalendar />);
    await screen.findByText('April 2026');
    // 'Available' also appears as today's availability in the detail panel, hence getAllByText.
    ['Available', 'Limited / Special', 'Unavailable / Leave', 'Has Booking'].forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    expect(screen.getByText('Has Booking')).toBeTruthy();
  });

  it('days carry accessible labels with their availability and booking count', async () => {
    serve();
    render(<ScheduleCalendar />);
    expect(await screen.findByLabelText('16 April 2026, On leave, 1 booking')).toBeTruthy();
    expect(screen.getByLabelText('15 April 2026, Available, 2 bookings, today')).toBeTruthy();
  });
});

describe('selected date and booking navigation', () => {
  it('lists the selected day\'s bookings with time, customer, status and number, and opens the booking on tap', async () => {
    serve();
    const onOpenBooking = jest.fn();
    render(<ScheduleCalendar onOpenBooking={onOpenBooking} />);
    expect(await screen.findByText('Griha Pravesh')).toBeTruthy();
    expect(screen.getByText('09:00 – 11:00 · Asha')).toBeTruthy();
    expect(screen.getByText('Accepted · #ZB-1001')).toBeTruthy();
    expect(screen.getByText('Awaiting your acceptance · #ZB-1002')).toBeTruthy();
    expect(screen.getByText('13:00')).toBeTruthy();                  // no end time and no customer name → just the start
    fireEvent.press(screen.getByText('Satyanarayan Katha'));
    expect(onOpenBooking).toHaveBeenCalledTimes(1);
    expect(onOpenBooking).toHaveBeenCalledWith('bk2');               // the booking's own id, unchanged
  });

  it('selecting another date shows that date; a conflict day shows the warning; an empty day says so', async () => {
    serve();
    render(<ScheduleCalendar />);
    await screen.findByText('Griha Pravesh');
    fireEvent.press(screen.getByTestId('cal-day-2026-04-16'));
    expect(screen.getByText('16 April 2026')).toBeTruthy();
    expect(screen.getByText('On leave')).toBeTruthy();
    expect(screen.getByText(/Conflict: a booking is scheduled on a day marked as leave\/unavailable/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('cal-day-2026-04-17'));
    expect(screen.getByText('Limited hours')).toBeTruthy();
    expect(screen.getByText('No bookings on this date')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cal-day-2026-04-10'));        // not in the response
    expect(screen.getByText('No schedule data for this date')).toBeTruthy();
  });
});

describe('loading, empty and error states', () => {
  it('shows a loading indicator while the month loads and removes it afterwards', async () => {
    let release;
    api.get.mockReturnValue(new Promise((r) => { release = () => r({ data: APRIL }); }));
    render(<ScheduleCalendar />);
    expect(screen.getByTestId('calendar-loading')).toBeTruthy();
    expect(screen.getByText('April 2026')).toBeTruthy();             // the grid is already usable for navigation
    release();
    await waitFor(() => expect(screen.queryByTestId('calendar-loading')).toBeNull());
  });

  it('an empty response renders the month with no indicators and an honest empty panel (no invented states)', async () => {
    api.get.mockResolvedValue({ data: { days: [] } });
    render(<ScheduleCalendar />);
    await waitFor(() => expect(screen.queryByTestId('calendar-loading')).toBeNull());
    expect(dayCount()).toBe(30);
    expect(screen.queryAllByTestId(/^cal-booking-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^cal-conflict-/)).toHaveLength(0);
    expect(style(screen.getByTestId('cal-day-2026-04-14')).backgroundColor).toBe('transparent');
    expect(screen.getByText('No schedule data for this date')).toBeTruthy();
  });

  it('an error shows a message with Retry, never fake data; Retry reloads the same month', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    render(<ScheduleCalendar />);
    expect(await screen.findByText('Could not load your schedule for this month.')).toBeTruthy();
    expect(style(screen.getByTestId('cal-day-2026-04-14')).backgroundColor).toBe('transparent');
    api.get.mockResolvedValue({ data: APRIL });
    fireEvent.press(screen.getByLabelText('Retry loading the calendar'));
    await waitFor(() => expect(screen.queryByTestId('calendar-error')).toBeNull());
    expect(style(screen.getByTestId('cal-day-2026-04-14')).backgroundColor).toBe('#DCFCE7');
    expect(calls()).toEqual(Array(2).fill('/pandits/me/schedule-calendar?from=2026-04-01&to=2026-04-30'));
  });

  it('reloads the displayed month when refreshKey changes (dashboard pull-to-refresh)', async () => {
    serve();
    const { rerender } = render(<ScheduleCalendar refreshKey={0} />);
    await screen.findByText('Griha Pravesh');
    rerender(<ScheduleCalendar refreshKey={1} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('is read-only: it never writes', async () => {
    serve();
    render(<ScheduleCalendar onOpenBooking={() => {}} />);
    await screen.findByText('Griha Pravesh');
    fireEvent.press(screen.getByText('Griha Pravesh'));
    fireEvent.press(screen.getByLabelText('Next month'));
    [api.post, api.patch, api.put, api.delete].forEach((f) => expect(f).not.toHaveBeenCalled());
  });
});
