import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import { formatDateTime } from '../../utils/helpers';

// Vertical timeline driven by real event data (booking.auditLog,
// order.statusTimeline, shipment.shipmentHistory) rather than an inferred
// fixed "happy path" — avoids mismatches for cancelled/edge-case records.
//   events – [{ label, note, at }], rendered oldest-first
export default function Timeline({ events = [] }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  if (events.length === 0) {
    return <Text style={{ color: C.textSecondary, fontSize: 13 }}>No activity yet</Text>;
  }

  return (
    <View>
      {events.map((ev, i) => {
        const isLast = i === events.length - 1;
        return (
          <View key={i} style={styles.row}>
            <View style={styles.dotCol}>
              <View style={[styles.dot, { backgroundColor: C.primary }]}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
              {!isLast && <View style={[styles.line, { backgroundColor: C.border }]} />}
            </View>
            <View style={[styles.content, !isLast && { paddingBottom: 16 }]}>
              <Text style={[styles.label, { color: C.text }]}>{ev.label}</Text>
              {ev.note ? <Text style={[styles.note, { color: C.textSecondary }]}>{ev.note}</Text> : null}
              {ev.at ? <Text style={[styles.time, { color: C.textSecondary }]}>{formatDateTime(ev.at)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row:     { flexDirection: 'row' },
  dotCol:  { alignItems: 'center', width: 24 },
  dot:     { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  line:    { width: 2, flex: 1, marginTop: 2 },
  content: { flex: 1, marginLeft: 10 },
  label:   { fontSize: 13, fontWeight: '700' },
  note:    { fontSize: 12, marginTop: 2, lineHeight: 17 },
  time:    { fontSize: 11, marginTop: 3 },
});
