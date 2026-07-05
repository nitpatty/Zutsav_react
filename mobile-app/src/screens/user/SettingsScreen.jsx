import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';

const THEMES = [
  { id: 'spiritual', label: 'Sacred Spiritual', color: '#1B1F3B' },
  { id: 'executive', label: 'Modern Executive', color: '#1E3A5F' },
  { id: 'dark',      label: 'Dark Mode',        color: '#111827' },
  { id: 'minimal',   label: 'Minimal White',    color: '#6B7280' },
];

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { theme, setTheme, themeId } = useThemeStore();
  const C = theme.colors;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Appearance</Text>
          {THEMES.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.item, { borderBottomColor: C.border }]}
              onPress={() => setTheme(t.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.themeColor, { backgroundColor: t.color }]} />
              <Text style={[styles.itemLabel, { color: C.text }]}>{t.label}</Text>
              {themeId === t.id && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Account</Text>
          <TouchableOpacity style={[styles.item, { borderBottomColor: C.border }]} onPress={() => navigation.navigate('Notifications')} activeOpacity={0.8}>
            <Ionicons name="notifications-outline" size={20} color={C.text} />
            <Text style={[styles.itemLabel, { color: C.text }]}>Notifications</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('DeleteAccount')} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
            <Text style={[styles.itemLabel, { color: '#DC2626' }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>About</Text>
          <View style={styles.item}>
            <Ionicons name="information-circle-outline" size={20} color={C.text} />
            <Text style={[styles.itemLabel, { color: C.text }]}>Version</Text>
            <Text style={[styles.itemValue, { color: C.textSecondary }]}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  section:      { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 14, paddingBottom: 6 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemLabel:    { flex: 1, fontSize: 15, fontWeight: '500' },
  itemValue:    { fontSize: 14 },
  themeColor:   { width: 22, height: 22, borderRadius: 11 },
});
