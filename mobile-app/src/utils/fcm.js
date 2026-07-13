import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export const setupFCM = async () => {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:             'Zutsav Notifications',
      importance:       Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#D4AF37',
      sound:            'default',
    });
    await Notifications.setNotificationChannelAsync('bookings', {
      name:             'Booking Updates',
      importance:       Notifications.AndroidImportance.HIGH,
      sound:            'default',
    });
    await Notifications.setNotificationChannelAsync('orders', {
      name:             'Order Updates',
      importance:       Notifications.AndroidImportance.HIGH,
    });
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )).data;
    return token;
  } catch {
    return null;
  }
};

export const addNotificationListener = (handler) =>
  Notifications.addNotificationReceivedListener(handler);

export const addResponseListener = (handler) =>
  Notifications.addNotificationResponseReceivedListener(handler);
