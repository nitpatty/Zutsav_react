import React, { useRef, useState } from 'react';
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
import { useTranslation } from '../../i18n';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false);   // state lags a re-render; the ref makes a double tap a no-op

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: t('profile.galleryDenied') }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      setUploading(true);
      const form = new FormData();
      form.append('photo', { uri: asset.uri, type: 'image/jpeg', name: 'avatar.jpg' });
      await api.post('/users/profile/photo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      try {
        await refreshUser();
      } catch {
        // Upload succeeded; only the profile re-fetch failed (refreshUser rethrows
        // transient errors instead of logging the user out). Don't report "failed".
        Toast.show({ type: 'info', text1: t('profile.photoUpdated'), text2: t('profile.photoRefreshFailed') });
        return;
      }
      Toast.show({ type: 'success', text1: t('profile.photoUpdated') });
    } catch {
      Toast.show({ type: 'error', text1: t('profile.uploadFailed') });
    } finally {
      setUploading(false);
    }
  };

  // Same flow as the website's "Remove" (ProfilePhoto.jsx): confirm first, then DELETE the existing photo endpoint.
  const handleRemoveAvatar = async () => {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    try {
      await api.delete('/users/profile/photo');
      try {
        await refreshUser();
      } catch {
        // The photo is removed; only the profile re-fetch failed (refreshUser rethrows transient errors).
        Toast.show({ type: 'info', text1: t('profile.photoRemoved'), text2: t('profile.photoRefreshFailed') });
        return;
      }
      Toast.show({ type: 'success', text1: t('profile.photoRemoved') });
    } catch {
      Toast.show({ type: 'error', text1: t('profile.photoRemoveFailed') });
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  };

  const confirmRemoveAvatar = () => {
    if (removingRef.current || uploading) return;
    Alert.alert(t('profile.removePhotoTitle'), t('profile.removePhotoConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.removePhoto'), style: 'destructive', onPress: handleRemoveAvatar },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('settings.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), style: 'destructive', onPress: logout },
    ]);
  };

  const sections = [
    {
      title: t('profile.sectionPersonal'),
      items: [
        { icon: 'person-outline',    label: t('profile.personalInfo'), onPress: () => navigation.navigate('PersonalInfo') },
        { icon: 'location-outline',  label: t('profile.savedAddresses'),      onPress: () => navigation.navigate('AddressBook') },
        { icon: 'people-outline',    label: t('profile.familyMembers'),       onPress: () => navigation.navigate('FamilyMembers') },
        { icon: 'lock-closed-outline', label: t('settings.changePassword'),    onPress: () => navigation.navigate('ChangePassword') },
      ],
    },
    {
      title: t('profile.sectionActivity'),
      items: [
        { icon: 'receipt-outline',       label: t('profile.myOrders'),      onPress: () => navigation.navigate('ShopTab', { screen: 'Orders' }) },
        { icon: 'calendar-outline',      label: t('profile.myBookings'),    onPress: () => navigation.navigate('BookingsTab') },
        { icon: 'gift-outline',          label: t('profile.myReferrals'),   onPress: () => navigation.navigate('MyReferrals') },
        { icon: 'wallet-outline',        label: t('profile.wallet'),         onPress: () => navigation.navigate('Wallet') },
        { icon: 'notifications-outline', label: t('settings.notifications'), onPress: () => navigation.navigate('Notifications') },
      ],
    },
    {
      title: t('profile.sectionPreferences'),
      items: [
        { icon: 'settings-outline', label: t('settings.title'), onPress: () => navigation.navigate('Settings') },
      ],
    },
    {
      title: t('profile.sectionPrivacy'),
      items: [
        { icon: 'trash-outline', label: t('settings.deleteAccount'), onPress: () => navigation.navigate('DeleteAccount'), danger: true },
      ],
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('nav.profile')} showBack={false} right={<NotificationBell color={C.text} />} />

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
          {user?.profilePhoto ? (
            <TouchableOpacity
              onPress={confirmRemoveAvatar}
              disabled={removing || uploading}
              style={[styles.removePhotoBtn, (removing || uploading) && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.removePhoto')}
              accessibilityState={{ disabled: removing || uploading }}
              activeOpacity={0.85}
            >
              <Ionicons name={removing ? 'hourglass' : 'trash-outline'} size={13} color="#fff" />
              <Text style={styles.removePhotoText}>{t('profile.removePhoto')}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userPhone}>{user?.phone}</Text>
            {user?.email && <Text style={styles.userEmail}>{user.email}</Text>}
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role === 'pandit' ? t('auth.pandit') : t('auth.devotee')}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('PersonalInfo')} activeOpacity={0.85}>
              <Ionicons name="pencil" size={13} color="#fff" />
              <Text style={styles.editBtnText}>{t('profile.editProfile')}</Text>
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
            title={t('settings.logout')}
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
  removePhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
  },
  removePhotoText:   { fontSize: 12, fontWeight: '700', color: '#fff' },
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
