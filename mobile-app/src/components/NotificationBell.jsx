import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useNotificationStore } from '../store/notificationStore';
import { useThemeStore } from '../store/themeStore';

export default function NotificationBell({ color, notifScreen = 'Notifications' }) {
  const navigation = useNavigation();
  const { unreadCount } = useNotificationStore();
  const { theme } = useThemeStore();
  const iconColor = color || theme.colors.text;

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => navigation.navigate(notifScreen)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="notifications-outline" size={24} color={iconColor} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:       { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  badge:     {
    position:'absolute', top: 4, right: 4,
    backgroundColor:'#DC2626', borderRadius:8,
    minWidth:16, height:16, justifyContent:'center', alignItems:'center', paddingHorizontal:2,
  },
  badgeText: { color:'#fff', fontSize:9, fontWeight:'700' },
});
