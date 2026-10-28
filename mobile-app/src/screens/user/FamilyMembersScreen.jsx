import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import { useTranslation, useFormatters } from '../../i18n';
import { relationshipLabel } from '../../utils/familyLabels';

/* ── Relationship options ─────────────────────────────────────────────── */
const RELATIONSHIPS = [
  'Father', 'Mother', 'Son', 'Daughter', 'Spouse',
  'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Other',
];

/* ── Family member card ──────────────────────────────────────────────── */
function FamilyMemberCard({ member, onEdit, onDelete, C }) {
  const { t } = useTranslation();
  const { formatDateWithOptions } = useFormatters();
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const formattedDob = member.dateOfBirth
    ? formatDateWithOptions(new Date(member.dateOfBirth), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <View style={[styles.memberCard, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: C.primary }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: C.text }]} numberOfLines={1}>
          {member.name}
        </Text>
        <Text style={[styles.memberRelation, { color: C.textSecondary }]}>
          {relationshipLabel(member.relationship, t)}
        </Text>
        {formattedDob && (
          <Text style={[styles.memberDob, { color: C.textLight }]}>
            📅 {formattedDob}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onEdit(member)}
          style={[styles.actionBtn, { backgroundColor: C.primary + '15' }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('family.editLabel', { name: member.name })}
        >
          <Ionicons name="pencil" size={14} color={C.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDelete(member)}
          style={[styles.actionBtn, { backgroundColor: (C.error || '#DC2626') + '15' }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('family.deleteLabel', { name: member.name })}
        >
          <Ionicons name="trash-outline" size={14} color={C.error || '#DC2626'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */
function EmptyState({ onAdd, C }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.emptyContainer, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
      <View style={[styles.emptyIcon, { backgroundColor: C.primary + '15' }]}>
        <Ionicons name="people-outline" size={40} color={C.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: C.text }]}>{t('family.emptyTitle')}</Text>
      <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
        {t('family.emptySub')}
      </Text>
      <TouchableOpacity
        onPress={onAdd}
        style={[styles.addButton, { backgroundColor: C.primary }]}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.addButtonText}>{t('family.addTitle')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ── Main screen ─────────────────────────────────────────────────────── */
export default function FamilyMembersScreen() {
  const { t } = useTranslation();
  const tRef = useRef(t); // read at call time so a language switch never changes fetchMembers (and so never refetches)
  tRef.current = t;
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await api.get('/users/family-members');
      setMembers(data.familyMembers || []);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: tRef.current('family.loadFailed'),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Refresh when coming back from form screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchMembers();
    });
    return unsubscribe;
  }, [navigation, fetchMembers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMembers();
  };

  const handleEdit = (member) => {
    navigation.navigate('FamilyMemberForm', { member });
  };

  const handleDelete = (member) => {
    Alert.alert(
      t('family.deleteTitle'),
      t('family.deleteConfirm', { name: member.name, relationship: relationshipLabel(member.relationship, t) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('address.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/users/family-members/${member._id}`);
              setMembers((prev) => prev.filter((m) => m._id !== member._id));
              Toast.show({
                type: 'success',
                text1: t('family.removed'),
              });
            } catch (err) {
              Toast.show({
                type: 'error',
                text1: err.response?.data?.message || t('family.deleteFailed'),
              });
            }
          },
        },
      ]
    );
  };

  const handleAdd = () => {
    navigation.navigate('FamilyMemberForm', { member: null });
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title={t('profile.familyMembers')}
        showBack
        right={
          members.length > 0 ? (
            <TouchableOpacity onPress={handleAdd} style={styles.headerAddBtn}>
              <Ionicons name="add-circle" size={28} color={C.primary} />
            </TouchableOpacity>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>
            {t('family.loading')}
          </Text>
        </View>
      ) : members.length === 0 ? (
        <EmptyState onAdd={handleAdd} C={C} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
          }
        >
          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            {t('family.subtitle')}
          </Text>

          {/* Member list */}
          {members.map((member) => (
            <FamilyMemberCard
              key={member._id}
              member={member}
              onEdit={handleEdit}
              onDelete={handleDelete}
              C={C}
            />
          ))}

          {/* Add button at bottom */}
          <TouchableOpacity
            onPress={handleAdd}
            style={[styles.addBottomBtn, { backgroundColor: C.primary + '10', borderColor: C.primary }]}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color={C.primary} />
            <Text style={[styles.addBottomBtnText, { color: C.primary }]}>
              {t('family.addAnother')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1 },
  headerAddBtn: { padding: 4 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 13 },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
  },
  memberRelation: {
    fontSize: 13,
  },
  memberDob: {
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  addBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 6,
  },
  addBottomBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
