import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../store/themeStore';

export default function ScreenHeader({ title, subtitle, showBack = true, right, onBack }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const handleBack = () => { if (onBack) { onBack(); } else { navigation.goBack(); } };

  return (
    <View style={[styles.container, { backgroundColor: C.surface, paddingTop: insets.top + 4, borderBottomColor: C.border }]}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={C.surface} />
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}

        <View style={styles.center}>
          <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: C.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>

        <View style={styles.rightSlot}>{right || null}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { borderBottomWidth: StyleSheet.hairlineWidth },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 10, minHeight: 48 },
  backBtn:    { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  center:     { flex: 1, alignItems: 'center' },
  rightSlot:  { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: 16, fontWeight: '700' },
  subtitle:   { fontSize: 12, marginTop: 1 },
});
