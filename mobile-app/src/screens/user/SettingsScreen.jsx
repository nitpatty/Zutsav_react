import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import ScreenHeader from '../../components/ScreenHeader';
import LanguagePicker from '../../components/shared/LanguagePicker';
import { useTranslation } from '../../i18n';

const THEMES = [
  { id: 'spiritual', labelKey: 'settings.themeSpiritual', color: '#1B1F3B' },
  { id: 'executive', labelKey: 'settings.themeExecutive', color: '#1E3A5F' },
  { id: 'dark',      labelKey: 'settings.themeDark',      color: '#111827' },
  { id: 'minimal',   labelKey: 'settings.themeMinimal',   color: '#6B7280' },
];

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { theme, setTheme, themeId } = useThemeStore();
  const { logout } = useAuthStore();
  const { t } = useTranslation();
  const C = theme.colors;

  const handleLogout = () => {
    Alert.alert(
      t('settings.logoutTitle'),
      t('settings.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('settings.title')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t('settings.appearance')}</Text>
          {THEMES.map((th) => (
            <TouchableOpacity
              key={th.id}
              style={[styles.item, { borderBottomColor: C.border }]}
              onPress={() => setTheme(th.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.themeColor, { backgroundColor: th.color }]} />
              <Text style={[styles.itemLabel, { color: C.text }]}>{t(th.labelKey)}</Text>
              {themeId === th.id && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t('settings.language')}</Text>
          <LanguagePicker />
        </View>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t('settings.account')}</Text>
          <TouchableOpacity style={[styles.item, { borderBottomColor: C.border }]} onPress={() => navigation.navigate('ChangePassword')} activeOpacity={0.8}>
            <Ionicons name="lock-closed-outline" size={20} color={C.text} />
            <Text style={[styles.itemLabel, { color: C.text }]}>{t('settings.changePassword')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.item, { borderBottomColor: C.border }]} onPress={() => navigation.navigate('Notifications')} activeOpacity={0.8}>
            <Ionicons name="notifications-outline" size={20} color={C.text} />
            <Text style={[styles.itemLabel, { color: C.text }]}>{t('settings.notifications')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.item, { borderBottomColor: C.border }]} onPress={() => navigation.navigate('DeleteAccount')} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
            <Text style={[styles.itemLabel, { color: '#DC2626' }]}>{t('settings.deleteAccount')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.item} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            <Text style={[styles.itemLabel, { color: '#DC2626' }]}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t('settings.legalResources')}</Text>
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('LegalResources')} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('settings.legalResources')}>
            <Ionicons name="document-text-outline" size={20} color={C.text} />
            <Text style={[styles.itemLabel, { color: C.text }]}>{t('settings.legalResources')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{t('settings.about')}</Text>
          <View style={styles.item}>
            <Ionicons name="information-circle-outline" size={20} color={C.text} />
            <Text style={[styles.itemLabel, { color: C.text }]}>{t('settings.version')}</Text>
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
