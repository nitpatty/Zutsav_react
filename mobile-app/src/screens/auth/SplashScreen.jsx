import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, StatusBar } from 'react-native';
import { useAuthStore } from '../../store/authStore';

export default function SplashScreen({ navigation }) {
  const { ready, user } = useAuthStore();

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (user) {
        // RootNavigator handles role-based routing
      } else {
        navigation.replace('Login');
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [ready, user]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B1F3B" />
      <View style={styles.logoWrap}>
        <Text style={styles.brand}>Zutsav</Text>
        <Text style={styles.tagline}>Sacred Rituals, Modern Convenience</Text>
      </View>
      <View style={styles.decorRow}>
        <View style={[styles.dot, { backgroundColor: '#D4AF37' }]} />
        <View style={[styles.dot, { backgroundColor: '#D4AF37', opacity: 0.6 }]} />
        <View style={[styles.dot, { backgroundColor: '#D4AF37', opacity: 0.3 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B1F3B',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  logoWrap: { alignItems: 'center' },
  brand: {
    fontSize: 48,
    fontWeight: '800',
    color: '#D4AF37',
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  decorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
