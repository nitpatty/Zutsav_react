import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ToastBase = ({ text1, text2, icon, bg, iconColor }) => (
  <View style={[styles.container, { borderLeftColor: iconColor, backgroundColor: bg }]}>
    <Ionicons name={icon} size={20} color={iconColor} style={{ marginRight: 10 }} />
    <View style={{ flex: 1 }}>
      {text1 ? <Text style={styles.title}>{text1}</Text> : null}
      {text2 ? <Text style={styles.sub}>{text2}</Text> : null}
    </View>
  </View>
);

export const toastConfig = {
  success: ({ text1, text2 }) => (
    <ToastBase text1={text1} text2={text2} icon="checkmark-circle" bg="#F0FDF4" iconColor="#16A34A" />
  ),
  error: ({ text1, text2 }) => (
    <ToastBase text1={text1} text2={text2} icon="close-circle" bg="#FEF2F2" iconColor="#DC2626" />
  ),
  info: ({ text1, text2 }) => (
    <ToastBase text1={text1} text2={text2} icon="information-circle" bg="#EFF6FF" iconColor="#2563EB" />
  ),
  warning: ({ text1, text2 }) => (
    <ToastBase text1={text1} text2={text2} icon="warning" bg="#FFFBEB" iconColor="#D97706" />
  ),
};

const styles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    alignItems:     'center',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderRadius:   12,
    borderLeftWidth: 4,
    elevation:      4,
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.12,
    shadowRadius:   6,
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: 14, fontWeight: '700', color: '#1C1917' },
  sub:   { fontSize: 12, color: '#78716C', marginTop: 2 },
});
