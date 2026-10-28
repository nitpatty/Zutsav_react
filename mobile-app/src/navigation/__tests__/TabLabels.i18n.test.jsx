import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import UserNavigator from '../UserNavigator';
import PanditNavigator from '../PanditNavigator';
import { useLanguageStore } from '../../i18n/languageStore';
import { DICTIONARIES } from '../../i18n/locales';

// The real navigators with the tab bar reduced to its labels: each <Tab.Screen> renders `options.title`, which is
// what the bottom bar shows. Route names (the API of navigation) are rendered next to them to prove they never change.
jest.mock('@react-navigation/bottom-tabs', () => {
  const R = require('react');
  const { Text: T, View } = require('react-native');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }) => R.createElement(View, null, children),
      Screen: ({ name, options }) => R.createElement(T, { testID: `tab-${name}` }, options.title),
    }),
  };
});
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../utils/socket', () => ({
  connectSocket: jest.fn(async () => null), disconnectSocket: jest.fn(), onNotification: jest.fn(() => () => {}),
}));

const label = (route) => screen.getByTestId(`tab-${route}`).props.children;
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

describe('User tab labels', () => {
  it('English is unchanged', () => {
    render(<UserNavigator />);
    expect(['HomeTab', 'BookingsTab', 'ShopTab', 'ProfileTab'].map(label)).toEqual(['Home', 'Bookings', 'Shop', 'Profile']);
  });

  it('follow the language, immediately, for every available language', async () => {
    render(<UserNavigator />);
    for (const code of Object.keys(DICTIONARIES)) {
      await setLang(code);
      const d = DICTIONARIES[code].nav;
      expect(['HomeTab', 'BookingsTab', 'ShopTab', 'ProfileTab'].map(label)).toEqual([d.home, d.bookings, d.shop, d.profile]);
    }
  });

  it('route names are never translated', async () => {
    await setLang('hi');
    render(<UserNavigator />);
    ['HomeTab', 'BookingsTab', 'ShopTab', 'ProfileTab'].forEach((route) => expect(screen.getByTestId(`tab-${route}`)).toBeTruthy());
    expect(label('HomeTab')).toBe(DICTIONARIES.hi.nav.home);
  });
});

describe('Pandit tab labels', () => {
  it('English is unchanged', () => {
    render(<PanditNavigator />);
    expect(label('PanditHomeTab')).toBe('Dashboard');
    expect(label('PanditBookingsTab')).toBe('Bookings');
    expect(label('PanditReferralTab')).toBe('Referrals');
    expect(label('PanditProfileTab')).toBe('Profile');
  });

  it('follow the language, immediately', async () => {
    render(<PanditNavigator />);
    await setLang('ta');
    const d = DICTIONARIES.ta.nav;
    expect(label('PanditHomeTab')).toBe(d.dashboard);
    expect(label('PanditBookingsTab')).toBe(d.bookings);
    expect(label('PanditReferralTab')).toBe(d.referrals);
    expect(label('PanditProfileTab')).toBe(d.profile);
  });
});
