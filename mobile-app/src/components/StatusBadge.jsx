import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatStatus } from '../utils/helpers';

export default function StatusBadge({ status, colorMap = {}, small = false }) {
  const color = colorMap[status] || '#6B7280';
  return (
    <View style={[
      styles.badge,
      small && styles.small,
      { backgroundColor: color + '20', borderColor: color + '60' },
    ]}>
      <Text style={[styles.text, small && styles.smallText, { color }]}>
        {formatStatus(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  small:     { paddingHorizontal: 8, paddingVertical: 2 },
  text:      { fontSize: 12, fontWeight: '700' },
  smallText: { fontSize: 10 },
});
