import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../../store/themeStore';
import { useTranslation, AVAILABLE_LOCALES, getTranslator } from '../../i18n';
import { changeLanguage } from '../../i18n/languagePreference';

/**
 * Language list for Settings. It lists only the locales that really have a dictionary (AVAILABLE_LOCALES), never
 * the whole supported-code catalogue, and shows each language by its native name. Choosing one switches the UI
 * immediately, persists it on the device and — when signed in — asks the backend to remember it. A failed
 * server sync keeps the local choice and shows a non-blocking notice in the NEW language.
 */
export default function LanguagePicker() {
  const { theme } = useThemeStore();
  const { language } = useTranslation();
  const C = theme.colors;

  const choose = async (code) => {
    const result = await changeLanguage(code);
    if (result.changed && !result.synced && result.reason === 'request-failed') {
      Toast.show({ type: 'info', text1: getTranslator(code)('settings.languageSaveFailed') });
    }
  };

  return (
    <View>
      {AVAILABLE_LOCALES.map((l) => {
        const selected = l.code === language;
        return (
          <TouchableOpacity
            key={l.code}
            style={[styles.item, { borderBottomColor: C.border }]}
            onPress={() => choose(l.code)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${l.native} (${l.name})`}
          >
            <Text style={[styles.native, { color: C.text }]}>{l.native}</Text>
            <Text style={[styles.name, { color: C.textSecondary }]}>{l.name}</Text>
            {selected && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  native: { fontSize: 15, fontWeight: '600' },
  name:   { flex: 1, fontSize: 13 },
});
