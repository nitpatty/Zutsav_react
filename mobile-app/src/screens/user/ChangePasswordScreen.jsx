import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n';
import { apiErrorMessage } from '../../utils/apiMessage';

// Matches website validation exactly: new password min 6 chars, must match confirm.
export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);

  const toggle = (key) => setShow((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    if (!currentPassword) { Toast.show({ type: 'error', text1: t('profile.enterCurrentPassword') }); return; }
    if (newPassword.length < 6) { Toast.show({ type: 'error', text1: t('profile.newPasswordMin') }); return; }
    if (newPassword !== confirmPassword) { Toast.show({ type: 'error', text1: t('auth.passwordsMismatch') }); return; }

    try {
      setSaving(true);
      await api.patch('/users/change-password', { currentPassword, newPassword });
      Toast.show({ type: 'success', text1: t('profile.passwordChanged') });
      navigation.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: apiErrorMessage(err, t('profile.changePasswordFailed')) });
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'current', label: t('profile.currentPassword'), value: currentPassword, onChange: setCurrentPassword, placeholder: t('profile.currentPasswordPlaceholder') },
    { key: 'next',    label: t('profile.newPassword'), value: newPassword, onChange: setNewPassword, placeholder: t('auth.passwordHint') },
    { key: 'confirm', label: t('profile.confirmNewPassword'), value: confirmPassword, onChange: setConfirmPassword, placeholder: t('profile.reenterNewPassword') },
  ];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('settings.changePassword')} />
      <View style={{ padding: 16, gap: 14 }}>
        {fields.map((f) => (
          <View key={f.key}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{f.label}</Text>
            <View style={[styles.pwdRow, { borderColor: C.border }]}>
              <TextInput
                style={[styles.pwdInput, { color: C.text }]}
                value={f.value}
                onChangeText={f.onChange}
                placeholder={f.placeholder}
                placeholderTextColor={C.textSecondary}
                secureTextEntry={!show[f.key]}
              />
              <TouchableOpacity onPress={() => toggle(f.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={show[f.key] ? 'eye-off' : 'eye'} size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: C.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>{saving ? t('profile.updating') : t('profile.updatePassword')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  fieldLabel:  { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  pwdRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  pwdInput:    { flex: 1, fontSize: 14 },
  saveBtn:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
