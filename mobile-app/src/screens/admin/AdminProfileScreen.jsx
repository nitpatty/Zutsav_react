import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';

const THEMES = [
  { id: 'spiritual', label: 'Sacred Spiritual', color: '#1B1F3B' },
  { id: 'executive', label: 'Modern Executive', color: '#1E3A5F' },
  { id: 'dark',      label: 'Dark Mode',        color: '#111827' },
  { id: 'minimal',   label: 'Minimal White',    color: '#6B7280' },
];

export default function AdminProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuthStore();
  const { theme, setTheme, themeId } = useThemeStore();
  const C = theme.colors;

  const handleLogout = () =>
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Profile" showBack={false} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        <View style={[styles.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[styles.avatar, { backgroundColor: C.primary + '20' }]}>
            <Text style={[styles.avatarText, { color: C.primary }]}>
              {user?.name?.charAt(0)?.toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: C.text }]}>{user?.name}</Text>
            <Text style={[styles.phone, { color: C.textSecondary }]}>{user?.phone}</Text>
            {user?.email ? <Text style={[styles.email, { color: C.textSecondary }]}>{user.email}</Text> : null}
          </View>
          <View style={[styles.adminBadge, { backgroundColor: C.primary + '20' }]}>
            <Text style={[styles.adminBadgeText, { color: C.primary }]}>Admin</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Personal</Text>
        <View style={[styles.menuSection, { backgroundColor: C.surface, borderColor: C.border }]}>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
            onPress={() => navigation.navigate('PersonalInfo')}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={20} color={C.text} />
            <Text style={[styles.menuLabel, { color: C.text }]}>Personal Information</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('ChangePassword')}
            activeOpacity={0.7}
          >
            <Ionicons name="lock-closed-outline" size={20} color={C.text} />
            <Text style={[styles.menuLabel, { color: C.text }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Appearance</Text>
        <View style={[styles.menuSection, { backgroundColor: C.surface, borderColor: C.border }]}>
          {THEMES.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.menuItem, i < THEMES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
              onPress={() => setTheme(t.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.themeColor, { backgroundColor: t.color }]} />
              <Text style={[styles.menuLabel, { color: C.text }]}>{t.label}</Text>
              {themeId === t.id && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: '#DC262640' }]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: 16, padding: 16, borderRadius: 16, borderWidth: 1,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:    { fontSize: 22, fontWeight: '800' },
  name:          { fontSize: 16, fontWeight: '700' },
  email:         { fontSize: 12, marginTop: 2 },
  phone:         { fontSize: 12, marginTop: 1 },
  adminBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  adminBadgeText:{ fontSize: 11, fontWeight: '700' },
  sectionTitle:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginHorizontal: 20, marginBottom: 6, marginTop: 8 },
  menuSection:   { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuItem:      { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  menuLabel:     { flex: 1, fontSize: 15, fontWeight: '500' },
  themeColor:    { width: 20, height: 20, borderRadius: 10 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, margin: 16, marginTop: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14,
  },
  logoutText:    { color: '#DC2626', fontSize: 15, fontWeight: '700' },
});
