import 'react-native-gesture-handler';
import { LogBox } from 'react-native';
import React, { useEffect } from 'react';

LogBox.ignoreLogs([
  'getExpoPushTokenAsync without specifying a projectId',
  'Calling getExpoPushTokenAsync without',
]);
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import RootNavigator from './src/navigation/RootNavigator';
import { I18nProvider, useLanguageStore } from './src/i18n';
import { useAuthStore } from './src/store/authStore';
import { useThemeStore } from './src/store/themeStore';
import { setupFCM } from './src/utils/fcm';
import { toastConfig } from './src/utils/toastConfig';

// ── Deep-link configuration ───────────────────────────────────────────────
// Handles:
//   zutsav://register?ref=CODE   (app scheme)
//   https://www.zutsav.com/register?ref=CODE  (web URL)
// When the app is opened via a referral link, the referral code is passed as
// a route param to the Register screen so it can be pre-filled.
const linking = {
  prefixes: ['zutsav://', 'https://www.zutsav.com', 'https://zutsav.com'],
  config: {
    screens: {
      Auth: {
        screens: {
          Register: 'register',
        },
      },
    },
  },
  // Extract referral code from query params and attach as route params
  async getInitialURL() {
    const { Linking } = require('react-native');
    const url = await Linking.getInitialURL();
    return url;
  },
  // Subscribe to incoming links while the app is running
  subscribe(listener) {
    const { Linking } = require('react-native');
    const sub = Linking.addEventListener('url', ({ url }) => listener(url));
    return () => sub?.remove();
  },
  // Custom function to extract referral code from the URL and add it as
  // a route param when navigating to Register
  async subscribeToNotifications() {},
};

// Helper: extract `ref` query param from a URL string
function extractReferralCode(url) {
  if (!url) return null;
  try {
    // Handle both zutsav://register?ref=CODE and https://...?ref=CODE
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return null;
    const queryString = url.substring(queryStart + 1);
    const params = new URLSearchParams(queryString);
    return params.get('ref') || null;
  } catch {
    return null;
  }
}

// Wrap NavigationContainer to inject referral code into Register screen params
function AppNavigation({ theme }) {
  const { user } = useAuthStore();

  return (
    <NavigationContainer
      linking={linking}
      fallback={null}
      onStateChange={() => {}}
      onReady={() => {
        // Check for initial URL with referral code on cold start
        const { Linking } = require('react-native');
        Linking.getInitialURL().then((url) => {
          const refCode = extractReferralCode(url);
          if (refCode && !user) {
            // The linking config handles screen navigation;
            // we store the ref code so RegisterScreen can pick it up.
            global.__zutsav_referral_code = refCode;
          }
        }).catch(() => {});
      }}
    >
      <StatusBar style={theme.dark ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
      <RootNavigator />
      <Toast config={toastConfig} />
    </NavigationContainer>
  );
}

export default function App() {
  const { hydrate } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    hydrate();
    setupFCM();
    useLanguageStore.getState().hydrate();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AppNavigation theme={theme} />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
