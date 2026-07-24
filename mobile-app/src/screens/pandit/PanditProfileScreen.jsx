import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';
import { COLORS } from '../../theme/tokens';
import { kycStatusColor } from '../../utils/helpers';
import { saveCache, loadCache } from '../../utils/offlineCache';
import useOnReconnect from '../../hooks/useOnReconnect';
import StatusBadge from '../../components/StatusBadge';
import ScreenHeader from '../../components/ScreenHeader';
import LoadingSpinner from '../../components/LoadingSpinner';

const MENU_ITEMS = [
  { key: 'personal',        label: 'Personal Details',              icon: 'person-outline',        nav: 'PanditPersonalInfo' },
  { key: 'address',         label: 'Address & Coverage',            icon: 'location-outline',      nav: 'PanditAddress' },
  { key: 'education',       label: 'Education',                     icon: 'school-outline',        nav: 'PanditEducation' },
  { key: 'specializations', label: 'Experience & Specializations',  icon: 'ribbon-outline',        nav: 'PanditSpecializations' },
  { key: 'poojas',          label: 'Pooja Services',                icon: 'flame-outline',         nav: 'PanditPoojaServices' },
  { key: 'family',          label: 'Family Information',            icon: 'people-outline',        nav: 'PanditFamilyInfo' },
  { key: 'bank',            label: 'Bank & UPI',                    icon: 'card-outline',          nav: 'PanditBankUPI' },
  { key: 'kyc',             label: 'KYC Verification',              icon: 'document-text-outline', nav: 'PanditKYC' },
  { key: 'settings',        label: 'Settings',                      icon: 'settings-outline',      nav: 'PanditSettings' },
];

const COMPLETION_FIELDS = [
  (p) => !!p.profilePhoto,
  (p) => !!p.fatherName,
  (p) => !!p.gender,
  (p) => !!p.dob,
  (p) => !!p.bio,
  (p) => !!p.address,
  (p) => (p.languages?.length || 0) > 0,
  (p) => (p.qualifications?.length || 0) > 0,
  (p) => (p.specializations?.length || 0) > 0,
  (p) => (p.selectedPoojas?.length || 0) > 0,
  (p) => Boolean(p.bankDetails?.accountNumber || p.upiDetails?.upiId),
  (p) => p.kycStatus === 'approved',
];

export default function PanditProfileScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [profile,   setProfile]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/pandits/me');
      setProfile(data.pandit);
      saveCache('profile', data.pandit);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load profile' });
      const cached = await loadCache('profile');
      if (cached) setProfile(cached.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));
  useOnReconnect(fetchProfile);

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
      const { data } = await api.post('/pandits/me/photo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setProfile(data.pandit);
      Toast.show({ type: 'success', text1: 'Photo updated' });
    } catch {
      Toast.show({ type: 'error', text1: 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  if (loading || !profile) return <LoadingSpinner fullScreen />;

  const completedCount = COMPLETION_FIELDS.filter((fn) => fn(profile)).length;
  const completionPct = Math.round((completedCount / COMPLETION_FIELDS.length) * 100);

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Profile" showBack={false} />
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 24 }}>
        <View style={[styles.heroSection, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarWrap} activeOpacity={0.85}>
            {profile.profilePhoto ? (
              <Image source={{ uri: imageUrl(profile.profilePhoto) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: C.primary + '20' }]}>
                <Text style={[styles.avatarInitial, { color: C.primary }]}>{profile.name?.charAt(0)?.toUpperCase() || 'P'}</Text>
              </View>
            )}
            <View style={[styles.cameraIcon, { backgroundColor: C.primary }]}>
              <Ionicons name={uploading ? 'hourglass' : 'camera'} size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: C.text }]}>{profile.name}</Text>
            <Text style={[styles.userPhone, { color: C.textSecondary }]}>{profile.phone}</Text>
            {profile.rating > 0 && (
              <Text style={[styles.userRating, { color: C.textSecondary }]}>{profile.rating.toFixed(1)} ★ ({profile.totalReviews || 0} reviews)</Text>
            )}
            <StatusBadge status={profile.kycStatus} colorMap={kycStatusColor} small />
          </View>

          <View style={styles.completionWrap}>
            <View style={[styles.completionTrack, { backgroundColor: C.border }]}>
              <View style={[styles.completionFill, { width: `${completionPct}%`, backgroundColor: completionPct >= 70 ? '#16A34A' : '#D97706' }]} />
            </View>
            <Text style={[styles.completionText, { color: C.textSecondary }]}>Profile {completionPct}% complete{completionPct < 70 ? ' — 70% needed to receive bookings' : ''}</Text>
          </View>
        </View>

        <View style={[styles.menuSection, { backgroundColor: C.surface, borderColor: C.border }]}>
          {MENU_ITEMS.map((item, idx) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.menuItem, idx < MENU_ITEMS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
              onPress={() => navigation.navigate(item.nav)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={20} color={C.text} />
              <Text style={[styles.menuLabel, { color: C.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1 },
  heroSection: {
    padding: 24, alignItems: 'center', gap: 12,
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
  userRating:        { fontSize: 13 },
  completionWrap:    { width: '100%', gap: 6, marginTop: 8 },
  completionTrack:   { height: 6, borderRadius: 3, overflow: 'hidden' },
  completionFill:    { height: '100%', borderRadius: 3 },
  completionText:    { fontSize: 11, textAlign: 'center' },
  menuSection:       { marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16,
  },
  menuLabel:         { flex: 1, fontSize: 15, fontWeight: '500' },
});
