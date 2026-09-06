import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import api, { imageUrl } from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import NotificationBell from '../../components/NotificationBell';
import { OutlineButton } from '../../components/shared/AppButton';

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
        { icon: 'people-outline',    label: 'Family Members',       onPress: () => navigation.navigate('FamilyMembers') },
        { icon: 'lock-closed-outline', label: 'Change Password',    onPress: () => navigation.navigate('ChangePassword') },
      ],
    },
    {
      title: 'Activity',
      items: [
        { icon: 'receipt-outline',       label: 'My Orders',      onPress: () => navigation.navigate('ShopTab', { screen: 'Orders' }) },
        { icon: 'calendar-outline',      label: 'My Bookings',    onPress: () => navigation.navigate('BookingsTab') },
        { icon: 'gift-outline',          label: 'My Referrals',   onPress: () => navigation.navigate('MyReferrals') },
        { icon: 'wallet-outline',        label: 'Wallet',         onPress: () => navigation.navigate('Wallet') },
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
        <LinearGradient colors={[C.primary, C.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroSection}>
          <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarWrap} activeOpacity={0.85}>
            {user?.profilePhoto ? (
              <Image source={{ uri: imageUrl(user.profilePhoto) }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <View style={[styles.cameraIcon, { backgroundColor: '#fff' }]}>
              <Ionicons name={uploading ? 'hourglass' : 'camera'} size={13} color={C.primaryDark} />
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userPhone}>{user?.phone}</Text>
            {user?.email && <Text style={styles.userEmail}>{user.email}</Text>}
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role === 'pandit' ? 'Pandit' : 'Devotee'}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('PersonalInfo')} activeOpacity={0.85}>
              <Ionicons name="pencil" size={13} color="#fff" />
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Menu sections */}
        {sections.map((section) => (
          <View key={section.title} style={{ marginTop: 20 }}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{section.title}</Text>
            <View style={[styles.menuSection, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, idx < section.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight }]}
                  onPress={item.onPress}
                  activeOpacity={0.75}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: (item.danger ? (C.error || '#DC2626') : C.primary) + '15' }]}>
                    <Ionicons name={item.icon} size={18} color={item.danger ? (C.error || '#DC2626') : C.primary} />
                  </View>
                  <Text style={[styles.menuLabel, { color: item.danger ? (C.error || '#DC2626') : C.text }]}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.textLight} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ marginHorizontal: 16, marginTop: 24 }}>
          <OutlineButton
            title="Logout"
            icon={<Ionicons name="log-out-outline" size={18} color={C.error || '#DC2626'} />}
            onPress={handleLogout}
            tone={C.error || '#DC2626'}
            C={C}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1 },
  heroSection: {
    padding: 28, paddingTop: 32, alignItems: 'center', gap: 14,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
  },
  avatarWrap:        { position: 'relative' },
  avatar:            { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' },
  avatarPlaceholder: {
    width: 92, height: 92, borderRadius: 46, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarInitial:     { fontSize: 34, fontWeight: '800', color: '#fff' },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  userInfo:          { alignItems: 'center', gap: 3 },
  userName:          { fontSize: 20, fontWeight: '800', color: '#fff' },
  userPhone:         { fontSize: 13.5, color: 'rgba(255,255,255,0.85)' },
  userEmail:         { fontSize: 12.5, color: 'rgba(255,255,255,0.7)' },
  roleBadge:         { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.22)' },
  roleText:          { fontSize: 11.5, fontWeight: '700', color: '#fff' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10,
  },
  editBtnText:       { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  sectionTitle:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginHorizontal: 20, marginBottom: 8 },
  menuSection: {
    marginHorizontal: 16, borderRadius: 18, overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  menuIconWrap:      { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel:         { flex: 1, fontSize: 14.5, fontWeight: '600' },
});
