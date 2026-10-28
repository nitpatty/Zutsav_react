import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { COLORS, RADIUS, SPACING } from '../../theme/tokens';
import { todayIST, formatDateLabel } from '../../utils/bookingDateRules';

// Monthly schedule calendar for the Pandit dashboard — the mobile counterpart of the website's availability MiniCalendar +
// SelectedDatePanel (frontend/src/components/availability/AvailabilityManager.jsx). It shows ONLY what the backend reports:
//   GET /pandits/me/schedule-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD  →  { days: [{ date, availability, status, bookingCount,
//   scheduleConflict, bookings: [{ _id, bookingNumber, status, poojaName, customerName, scheduledTime, startMinutes, endMinutes,
//   actionable }] }] }
// The per-day `status` is the authoritative value the backend's conflict gate uses, so nothing is derived or invented here. The colour
// meanings and legend are the website's. Read-only: it never changes availability, bookings or the schedule.
//   onOpenBooking(bookingId)  – opens the existing Pandit booking detail
//   refreshKey                – change it to reload the displayed month (pull-to-refresh on the dashboard)

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n) => String(n).padStart(2, '0');

// Same meanings as the website: green available · yellow limited/special · red unavailable/leave · grey off/none · blue booked.
const GREEN  = { bg: '#DCFCE7', fg: '#15803D' };
const YELLOW = { bg: '#FEF9C3', fg: '#A16207' };
const RED    = { bg: '#FEE2E2', fg: '#DC2626' };
const STATUS_STYLE = {
  available:   GREEN,
  limited:     YELLOW,
  special:     YELLOW,
  unavailable: RED,
  leave:       RED,
  off:         { bg: 'transparent', fg: '#D1D5DB' },
  none:        { bg: 'transparent', fg: '#D1D5DB' },
  blue:        { bg: '#3B82F6', fg: '#FFFFFF' },
};

const AVAILABILITY_LABEL = {
  available:   'Available',
  limited:     'Limited hours',
  special:     'Custom hours (special date)',
  unavailable: 'Unavailable (special date)',
  leave:       'On leave',
  off:         'Weekly day off',
  none:        'No schedule set',
};
const BOOKING_STATUS_LABEL = {
  pandit_assigned:      'Awaiting your acceptance',
  pandit_accepted:      'Accepted',
  completion_requested: 'Completion requested',
  completed:            'Completed',
};
const LEGEND = [
  { color: GREEN.bg,  border: '#86EFAC', label: 'Available' },
  { color: YELLOW.bg, border: '#FDE047', label: 'Limited / Special' },
  { color: RED.bg,    border: '#FCA5A5', label: 'Unavailable / Leave' },
  { color: '#2563EB', border: '#2563EB', label: 'Has Booking', dot: true },
];

/** First/last 'YYYY-MM-DD' of a displayed month (UTC date math, so no time-zone shift). */
export const monthRangeKeys = (year, month) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { from: `${year}-${pad2(month + 1)}-01`, to: `${year}-${pad2(month + 1)}-${pad2(lastDay)}` };
};

const minsToLabel = (mins) => (mins == null ? null : `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`);

export default function ScheduleCalendar({ onOpenBooking, refreshKey = 0 }) {
  const initial = todayIST();                                  // the Pandit's "today" is the IST day, as on the website
  const [year, setYear] = useState(Number(initial.slice(0, 4)));
  const [month, setMonth] = useState(Number(initial.slice(5, 7)) - 1);
  const [daysMap, setDaysMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState(initial);
  const latest = useRef(0);                                    // only the newest request may update the screen

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    const { from, to } = monthRangeKeys(year, month);
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.get(`/pandits/me/schedule-calendar?from=${from}&to=${to}`);
      if (ticket !== latest.current) return;
      const map = {};
      for (const day of data?.days || []) map[day.date] = day;
      setDaysMap(map);
    } catch {
      if (ticket !== latest.current) return;
      setDaysMap({});
      setFailed(true);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const shiftMonth = (delta) => {
    let y = year;
    let m = month + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setYear(y);
    setMonth(m);
    if (selectedKey && selectedKey.slice(0, 7) !== `${y}-${pad2(m + 1)}`) setSelectedKey(null);   // as the website does
  };

  const todayKey = todayIST();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();           // 0 = Sunday: the grid starts on Sunday, like the website
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const selectedDay = selectedKey ? daysMap[selectedKey] : null;

  return (
    <View style={styles.card} testID="schedule-calendar">
      <View style={styles.header}>
        <Text style={styles.monthTitle} accessibilityRole="header">{MONTH_NAMES[month]} {year}</Text>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={18} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => <Text key={d} style={styles.weekday}>{d}</Text>)}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day == null) return <View key={`e${i}`} style={styles.cell} testID={`cal-pad-${i}`} />;   // leading blanks: weekday alignment
          const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
          const info = daysMap[key];
          const status = info?.status || 'none';
          const tone = STATUS_STYLE[status] || STATUS_STYLE.none;
          const booked = (info?.bookingCount || 0) > 0;
          const isToday = key === todayKey;
          const selected = key === selectedKey;
          const label = [
            `${day} ${MONTH_NAMES[month]} ${year}`,
            AVAILABILITY_LABEL[info?.availability] || null,
            booked ? `${info.bookingCount} booking${info.bookingCount > 1 ? 's' : ''}` : null,
            isToday ? 'today' : null,
          ].filter(Boolean).join(', ');
          return (
            <View key={key} style={styles.cell}>
              <TouchableOpacity
                onPress={() => setSelectedKey(key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                testID={`cal-day-${key}`}
                style={[
                  styles.day,
                  { backgroundColor: tone.bg },
                  isToday && styles.today,
                  selected && styles.selected,
                ]}
              >
                <Text style={[styles.dayText, { color: tone.fg }, isToday && { fontWeight: '800' }]}>{day}</Text>
                {booked ? <View style={styles.bookingDot} testID={`cal-booking-${key}`} /> : null}
                {info?.scheduleConflict ? <View style={styles.conflictDot} testID={`cal-conflict-${key}`} /> : null}
              </TouchableOpacity>
            </View>
          );
        })}
        {loading ? (
          <View style={styles.loadingOverlay} pointerEvents="none" testID="calendar-loading">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : null}
      </View>

      {failed ? (
        <View style={styles.errorBox} testID="calendar-error">
          <Text style={styles.errorText}>Could not load your schedule for this month.</Text>
          <TouchableOpacity onPress={load} accessibilityRole="button" accessibilityLabel="Retry loading the calendar">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.legend}>
        {LEGEND.map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[l.dot ? styles.legendDot : styles.legendSwatch, { backgroundColor: l.color, borderColor: l.border }]} />
            <Text style={styles.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>

      {selectedKey ? (
        <View style={styles.detail} testID="calendar-selected-day">
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>{formatDateLabel(selectedKey)}{selectedKey === todayKey ? '  ·  Today' : ''}</Text>
            {selectedDay ? <Text style={styles.detailAvail}>{AVAILABILITY_LABEL[selectedDay.availability] || selectedDay.availability}</Text> : null}
          </View>

          {selectedDay?.scheduleConflict ? (
            <View style={styles.conflictBox}>
              <Text style={styles.conflictText}>
                Conflict: a booking is scheduled on a day marked as leave/unavailable. Update your availability or ask the admin to reassign.
              </Text>
            </View>
          ) : null}

          {!selectedDay || (selectedDay.bookings || []).length === 0 ? (
            <Text style={styles.emptyText}>{selectedDay ? 'No bookings on this date' : 'No schedule data for this date'}</Text>
          ) : (
            selectedDay.bookings.map((b) => {
              const start = minsToLabel(b.startMinutes);
              const end = minsToLabel(b.endMinutes);
              return (
                <TouchableOpacity
                  key={b._id}
                  onPress={() => onOpenBooking && onOpenBooking(b._id)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Open booking ${b.poojaName || 'Pooja'}`}
                  style={[styles.bookingRow, b.actionable && styles.bookingRowActionable]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bookingName} numberOfLines={1}>{b.poojaName || 'Pooja'}</Text>
                    <Text style={styles.bookingMeta}>
                      {start ? `${start}${end ? ` – ${end}` : ''}` : (b.scheduledTime || 'Time not set')}
                      {b.customerName ? ` · ${b.customerName}` : ''}
                    </Text>
                    <Text style={[styles.bookingStatus, b.actionable && { color: '#2563EB' }]}>
                      {BOOKING_STATUS_LABEL[b.status] || b.status}{b.bookingNumber ? ` · #${b.bookingNumber}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.base, gap: SPACING.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  navRow: { flexDirection: 'row', gap: 4 },
  navBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundAlt },
  weekRow: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', position: 'relative' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  dayText: { fontSize: 12, fontWeight: '600' },
  today: { borderWidth: 2, borderColor: COLORS.primary },
  selected: { borderWidth: 2, borderColor: COLORS.primaryDark },
  bookingDot: { position: 'absolute', bottom: 3, right: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#2563EB' },
  conflictDot: { position: 'absolute', top: 3, left: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#DC2626' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,249,0.6)' },
  errorBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, borderRadius: 10, backgroundColor: COLORS.errorBg },
  errorText: { flex: 1, fontSize: 12, color: COLORS.error, fontWeight: '600' },
  retryText: { fontSize: 12, fontWeight: '800', color: COLORS.primaryDark },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  legendText: { fontSize: 11, color: COLORS.textSecondary },
  detail: { gap: SPACING.sm, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  detailHeader: { gap: 2 },
  detailTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  detailAvail: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  conflictBox: { padding: 10, borderRadius: 10, backgroundColor: COLORS.errorBg },
  conflictText: { fontSize: 12, color: COLORS.error },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 10 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: COLORS.backgroundAlt },
  bookingRowActionable: { backgroundColor: COLORS.infoBg },
  bookingName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  bookingMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  bookingStatus: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
});
