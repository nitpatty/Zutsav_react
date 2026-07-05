import React from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';

// Items are either a bottom-tab shortcut (navigate into the nested AdminTabs
// navigator) or a drawer-only screen registered directly on the Drawer.
const ITEMS = [
  { label: 'Dashboard',          icon: 'stats-chart-outline',   tab: 'AdminDashboardTab' },
  { label: 'Action Center',      icon: 'flash-outline',         screen: 'ActionCenter' },
  { label: 'Global Search',      icon: 'search-outline',        screen: 'GlobalSearch' },
  { label: 'Bookings',           icon: 'calendar-outline',      tab: 'AdminBookingsTab' },
  { label: 'Orders',             icon: 'cube-outline',          tab: 'AdminOrdersTab' },
  { label: 'Refunds',            icon: 'cash-outline',          screen: 'Refunds' },
  { label: 'Pandits',            icon: 'people-outline',        screen: 'Pandits' },
  { label: 'Users',              icon: 'person-outline',        screen: 'Users' },
  { label: 'Blogs',               icon: 'newspaper-outline',     screen: 'Blogs' },
  { label: 'Communication',      icon: 'megaphone-outline',     screen: 'Communication' },
  { label: 'Referral Analytics', icon: 'git-network-outline',   screen: 'ReferralAnalytics' },
  { label: 'Analytics',          icon: 'bar-chart-outline',     screen: 'Analytics' },
  { label: 'System Health',      icon: 'pulse-outline',         screen: 'SystemHealth' },
  { label: 'Profile',            icon: 'person-circle-outline', tab: 'AdminProfileTab' },
];

export default function AdminDrawerContent(props) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ backgroundColor: C.background }}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <View style={[styles.avatar, { backgroundColor: C.primary + '20' }]}>
          <Text style={[styles.avatarInitial, { color: C.primary }]}>{user?.name?.charAt(0)?.toUpperCase() || 'A'}</Text>
        </View>
        <Text style={[styles.name, { color: C.text }]}>{user?.name}</Text>
        <View style={[styles.badge, { backgroundColor: C.primary + '20' }]}>
          <Text style={[styles.badgeText, { color: C.primary }]}>Admin</Text>
        </View>
      </View>

      {ITEMS.map((item) => (
        <DrawerItem
          key={item.label}
          label={item.label}
          icon={({ color, size }) => <Ionicons name={item.icon} size={size} color={color} />}
          labelStyle={{ color: C.text, fontSize: 14, fontWeight: '600' }}
          onPress={() => {
            if (item.tab) props.navigation.navigate('AdminTabs', { screen: item.tab });
            else props.navigation.navigate(item.screen);
          }}
        />
      ))}

      <DrawerItem
        label="Logout"
        icon={({ size }) => <Ionicons name="log-out-outline" size={size} color="#DC2626" />}
        labelStyle={{ color: '#DC2626', fontSize: 14, fontWeight: '700' }}
        onPress={handleLogout}
      />
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  header:       { alignItems: 'center', padding: 20, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  avatar:       { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarInitial:{ fontSize: 22, fontWeight: '800' },
  name:         { fontSize: 16, fontWeight: '700' },
  badge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText:    { fontSize: 11, fontWeight: '700' },
});
