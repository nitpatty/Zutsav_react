import { Linking } from 'react-native';
import Toast from 'react-native-toast-message';

// Shared Call / WhatsApp / Open Maps helpers — no equivalent pattern existed
// anywhere in the app before, so these are built once and reused across admin
// booking/pandit quick actions.

export async function callPhone(phone) {
  if (!phone) { Toast.show({ type: 'error', text1: 'No phone number available' }); return; }
  try {
    await Linking.openURL(`tel:${phone}`);
  } catch {
    Toast.show({ type: 'error', text1: 'Could not open dialer' });
  }
}

export async function openWhatsApp(phone, message) {
  if (!phone) { Toast.show({ type: 'error', text1: 'No phone number available' }); return; }
  const digits = phone.replace(/\D/g, '').slice(-10);
  const url = `https://wa.me/91${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  try {
    await Linking.openURL(url);
  } catch {
    Toast.show({ type: 'error', text1: 'Could not open WhatsApp' });
  }
}

export async function openMaps(address) {
  if (!address) { Toast.show({ type: 'error', text1: 'No address available' }); return; }
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Toast.show({ type: 'error', text1: 'Could not open Maps' });
  }
}
