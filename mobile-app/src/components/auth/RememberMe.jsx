import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { Ionicons } from '@expo/vector-icons';
import { AUTH_COLORS } from './colors';

export default function RememberMe({ checked, onToggle }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity style={styles.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
      </View>
      <Text style={styles.label}>{t('auth.rememberMe')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.4,
    borderColor: AUTH_COLORS.checkboxBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: AUTH_COLORS.ring.gold,
    borderColor: AUTH_COLORS.ring.gold,
  },
  label: { fontSize: 13.5, color: AUTH_COLORS.rememberText },
});
