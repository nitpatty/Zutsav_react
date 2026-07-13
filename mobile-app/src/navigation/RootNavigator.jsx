import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import AuthNavigator from './AuthNavigator';
import UserNavigator from './UserNavigator';
import PanditNavigator from './PanditNavigator';
import AdminNavigator from './AdminNavigator';
import { connectSocket, disconnectSocket, onNotification } from '../utils/socket';
import { useNotificationStore } from '../store/notificationStore';
import { useCartStore } from '../store/cartStore';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, ready } = useAuthStore();
  const { loadTheme }   = useThemeStore();
  const { addRealtime, fetchUnreadCount } = useNotificationStore();
  const { load: loadCart } = useCartStore();

  useEffect(() => { loadTheme(); }, []);

  useEffect(() => {
    if (!user) { disconnectSocket(); return; }
    connectSocket().then((sock) => {
      if (!sock) return;
      const off = onNotification((n) => addRealtime(n));
      return () => off();
    });
    fetchUnreadCount();
    if (user.role === 'user') loadCart();
  }, [user]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF8E7' }}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'admin') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Admin" component={AdminNavigator} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'pandit') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Pandit" component={PanditNavigator} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="User" component={UserNavigator} />
    </Stack.Navigator>
  );
}
