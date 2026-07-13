import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useThemeStore } from '../../store/themeStore';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Thin, theme-aware wrapper around react-native-chart-kit's LineChart, reused
// across the dashboard's revenue/bookings/orders trend charts.
//   title      – card title
//   series     – [{ date: 'YYYY-MM-DD', value: number }]
//   formatValue – (n) => string, for the y-axis/label formatting (defaults to plain number)
export default function DashboardChart({ title, series = [], formatValue }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  if (series.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={[styles.title, { color: C.text }]}>{title}</Text>
        <Text style={{ color: C.textSecondary, fontSize: 13, marginTop: 12 }}>No data yet</Text>
      </View>
    );
  }

  const labelEvery = Math.max(1, Math.floor(series.length / 6));
  const labels = series.map((s, i) => (i % labelEvery === 0 ? s.date.slice(5) : ''));
  const values = series.map((s) => s.value ?? 0);
  const fmt = formatValue || ((n) => String(Math.round(n)));

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.title, { color: C.text }]}>{title}</Text>
      <LineChart
        data={{ labels, datasets: [{ data: values }] }}
        width={SCREEN_WIDTH - 64}
        height={180}
        withInnerLines={false}
        withOuterLines={false}
        withShadow={false}
        formatYLabel={fmt}
        chartConfig={{
          backgroundColor: C.surface,
          backgroundGradientFrom: C.surface,
          backgroundGradientTo: C.surface,
          decimalPlaces: 0,
          color: (opacity = 1) => C.primary + Math.round(opacity * 255).toString(16).padStart(2, '0'),
          labelColor: () => C.textSecondary,
          propsForDots: { r: '3', strokeWidth: '1', stroke: C.primary },
        }}
        bezier
        style={{ marginLeft: -16, marginTop: 8, borderRadius: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card:  { borderRadius: 16, borderWidth: 1, padding: 14 },
  title: { fontSize: 14, fontWeight: '700' },
});
