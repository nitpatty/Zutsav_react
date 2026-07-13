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
import { useAuthStore } from './src/store/authStore';
import { useThemeStore } from './src/store/themeStore';
import { setupFCM } from './src/utils/fcm';
import { toastConfig } from './src/utils/toastConfig';

export default function App() {
  const { hydrate } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    hydrate();
    setupFCM();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style={theme.dark ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
          <RootNavigator />
          <Toast config={toastConfig} />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
