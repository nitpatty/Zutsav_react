import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEMES = {
  spiritual: {
    id:     'spiritual',
    name:   'Sacred Spiritual',
    dark:   false,
    colors: {
      primary:         '#D4AF37',
      primaryDark:     '#B8962E',
      primaryLight:    '#F0D98C',
      secondary:       '#B91C1C',
      accent:          '#F97316',
      background:      '#FFF8E7',
      surface:         '#FFFFFF',
      card:            '#FFFDF5',
      text:            '#1C1917',
      textSecondary:   '#78716C',
      textLight:       '#A8A29E',
      border:          '#E8D48B',
      borderLight:     '#F5EDCC',
      error:           '#DC2626',
      success:         '#16A34A',
      warning:         '#D97706',
      info:            '#2563EB',
      tabBar:          '#FFFFFF',
      tabBarActive:    '#D4AF37',
      tabBarInactive:  '#A8A29E',
      header:          '#FFFFFF',
      shadow:          'rgba(212,175,55,0.15)',
    },
  },
  executive: {
    id:     'executive',
    name:   'Modern Executive',
    dark:   false,
    colors: {
      primary:         '#2D6A4F',
      primaryDark:     '#1B4332',
      primaryLight:    '#52B788',
      secondary:       '#1B4332',
      accent:          '#52B788',
      background:      '#F0F4F0',
      surface:         '#FFFFFF',
      card:            '#F8FAF8',
      text:            '#1A1A1A',
      textSecondary:   '#4A5568',
      textLight:       '#718096',
      border:          '#C3D9CB',
      borderLight:     '#E8F4EC',
      error:           '#E53E3E',
      success:         '#38A169',
      warning:         '#D69E2E',
      info:            '#3182CE',
      tabBar:          '#FFFFFF',
      tabBarActive:    '#2D6A4F',
      tabBarInactive:  '#718096',
      header:          '#2D6A4F',
      shadow:          'rgba(45,106,79,0.12)',
    },
  },
  dark: {
    id:     'dark',
    name:   'Dark Mode',
    dark:   true,
    colors: {
      primary:         '#D4AF37',
      primaryDark:     '#B8962E',
      primaryLight:    '#F0D98C',
      secondary:       '#F0C040',
      accent:          '#F97316',
      background:      '#0D0D0D',
      surface:         '#1A1A1A',
      card:            '#242424',
      text:            '#F5F5F0',
      textSecondary:   '#A0A0A0',
      textLight:       '#6B6B6B',
      border:          '#2E2E2E',
      borderLight:     '#252525',
      error:           '#FC8181',
      success:         '#68D391',
      warning:         '#F6E05E',
      info:            '#63B3ED',
      tabBar:          '#1A1A1A',
      tabBarActive:    '#D4AF37',
      tabBarInactive:  '#6B6B6B',
      header:          '#1A1A1A',
      shadow:          'rgba(0,0,0,0.5)',
    },
  },
  minimal: {
    id:     'minimal',
    name:   'Minimal White',
    dark:   false,
    colors: {
      primary:         '#374151',
      primaryDark:     '#1F2937',
      primaryLight:    '#6B7280',
      secondary:       '#111827',
      accent:          '#6366F1',
      background:      '#FFFFFF',
      surface:         '#F9FAFB',
      card:            '#FFFFFF',
      text:            '#111827',
      textSecondary:   '#6B7280',
      textLight:       '#9CA3AF',
      border:          '#E5E7EB',
      borderLight:     '#F3F4F6',
      error:           '#EF4444',
      success:         '#10B981',
      warning:         '#F59E0B',
      info:            '#3B82F6',
      tabBar:          '#FFFFFF',
      tabBarActive:    '#374151',
      tabBarInactive:  '#9CA3AF',
      header:          '#FFFFFF',
      shadow:          'rgba(0,0,0,0.08)',
    },
  },
};

export const useThemeStore = create((set, get) => ({
  themeId: 'spiritual',
  theme:   THEMES.spiritual,

  loadTheme: async () => {
    try {
      const saved = await AsyncStorage.getItem('zutsav_theme');
      if (saved && THEMES[saved]) {
        set({ themeId: saved, theme: THEMES[saved] });
      }
    } catch {}
  },

  setTheme: async (id) => {
    if (!THEMES[id]) return;
    await AsyncStorage.setItem('zutsav_theme', id);
    set({ themeId: id, theme: THEMES[id] });
  },

  allThemes: Object.values(THEMES),
}));
