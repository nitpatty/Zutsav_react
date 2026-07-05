import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api, { imageUrl } from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import NotificationBell from '../../components/NotificationBell';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout, refreshUser } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [uploading, setUploading] = useState(false);

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: 'Gallery permission denied' }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      setUploading(true);
      const form = new FormData();
      form.append('photo', { uri: asset.uri, type: 'image/jpeg', name: 'avatar.jpg' });
      await api.post('/users/profile/photo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await refreshUser();
      Toast.show({ type: 'success', text1: 'Photo updated' });
    } catch {
      Toast.show({ type: 'error', text1: 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const sections = [
    {
      title: 'Personal',
      items: [
        { icon: 'person-outline',    label: 'Personal Information', onPress: () => navigation.navigate('PersonalInfo') },
        { icon: 'location-outline',  label: 'Saved Addresses',      onPress: () => navigation.navigate('AddressBook') },
        { icon: 'lock-closed-outline', label: 'Change Password',    onPress: () => navigation.navigate('ChangePassword') },
      ],
    },
    {
      title: 'Activity',
      items: [
        { icon: 'receipt-outline',       label: 'My Orders',      onPress: () => navigation.navigate('ShopTab', { screen: 'Orders' }) },
        { icon: 'calendar-outline',      label: 'My Bookings',    onPress: () => navigation.navigate('BookingsTab') },
        { icon: 'notifications-outline', label: 'Notifications', onPress: () => navigation.navigate('Notifications') },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: 'settings-outline', label: 'Settings', onPress: () => navigation.navigate('Settings') },
      ],
    },
    {
      title: 'Privacy & Security',
      items: [
        { icon: 'trash-outline', label: 'Delete Account', onPress: () => navigation.navigate('DeleteAccount'), danger: true },
      ],
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Profile" showBack={false} right={<NotificationBell color={C.text} />} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Avatar + info */}
        <View style={[styles.heroSection, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarWrap} activeOpacity={0.85}>
            {user?.profilePhoto ? (
              <Image source={{ uri: imageUrl(user.profilePhoto) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: C.primary + '20' }]}>
                <Text style={[styles.avatarInitial, { color: C.primary }]}>
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <View style={[styles.cameraIcon, { backgroundColor: C.primary }]}>
              <Ionicons name={uploading ? 'hourglass' : 'camera'} size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: C.text }]}>{user?.name}</Text>
            <Text style={[styles.userPhone, { color: C.textSecondary }]}>{user?.phone}</Text>
            {user?.email && <Text style={[styles.userEmail, { color: C.textSecondary }]}>{user.email}</Text>}
            <View style={[styles.roleBadge, { backgroundColor: C.primary + '20' }]}>
              <Text style={[styles.roleText, { color: C.primary }]}>{user?.role === 'pandit' ? 'Pandit' : 'Devotee'}</Text>
            </View>
            <TouchableOpacity style={[styles.editBtn, { borderColor: C.border }]} onPress={() => navigation.navigate('PersonalInfo')}>
              <Ionicons name="pencil" size={14} color={C.text} />
              <Text style={[styles.editBtnText, { color: C.text }]}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu sections */}
        {sections.map((section) => (
          <View key={section.title} style={{ marginTop: 16 }}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{section.title}</Text>
            <View style={[styles.menuSection, { backgroundColor: C.surface, borderColor: C.border }]}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, idx < section.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon} size={20} color={item.danger ? '#DC2626' : C.text} />
                  <Text style={[styles.menuLabel, { color: item.danger ? '#DC2626' : C.text }]}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={[styles.logoutBtn, { borderColor: '#DC262640' }]} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1 },
  heroSection: {
    padding: 24, alignItems: 'center', gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap:        { position: 'relative' },
  avatar:            { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
  avatarInitial:     { fontSize: 34, fontWeight: '800' },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  userInfo:          { alignItems: 'center', gap: 4 },
  userName:          { fontSize: 20, fontWeight: '800' },
  userPhone:         { fontSize: 14 },
  userEmail:         { fontSize: 13 },
  roleBadge:         { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  roleText:          { fontSize: 12, fontWeight: '700' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 8,
  },
  editBtnText:       { fontSize: 13, fontWeight: '600' },
  sectionTitle:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginHorizontal: 20, marginBottom: 6 },
  menuSection:       { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16,
  },
  menuLabel:         { flex: 1, fontSize: 15, fontWeight: '500' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, margin: 16, marginTop: 24, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14,
  },
  logoutText:        { color: '#DC2626', fontSize: 15, fontWeight: '700' },
});
