import React, { useState, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../../store/themeStore';

const DEFAULT_REGION = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 0.5, longitudeDelta: 0.5 };

// "Pin stays centered, drag the map underneath it" picker — same pattern
// Uber/Swiggy use for address confirmation. Simpler and more reliable than a
// draggable Marker. Reads the final center via onRegionChangeComplete.
//   visible       – boolean
//   initialCoords – { latitude, longitude } | null
//   onConfirm     – ({ latitude, longitude }) => void
//   onClose       – () => void
export default function MapPicker({ visible, initialCoords, onConfirm, onClose }) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const mapRef = useRef(null);

  const [region, setRegion] = useState(
    initialCoords?.latitude ? { ...initialCoords, latitudeDelta: 0.02, longitudeDelta: 0.02 } : DEFAULT_REGION
  );
  const [locating, setLocating] = useState(false);

  const handleUseCurrentLocation = async () => {
    try {
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Toast.show({ type: 'error', text1: 'Location permission denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 500);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not fetch current location' });
    } finally {
      setLocating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]}>Pick Your Location</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={region}
            onRegionChangeComplete={setRegion}
          />
          <View pointerEvents="none" style={styles.centerPin}>
            <Ionicons name="location" size={40} color={C.primary} />
          </View>
        </View>

        <View style={[styles.footer, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <TouchableOpacity style={[styles.locateBtn, { borderColor: C.border }]} onPress={handleUseCurrentLocation} disabled={locating}>
            <Ionicons name="navigate" size={16} color={C.primary} />
            <Text style={[styles.locateText, { color: C.text }]}>{locating ? 'Locating…' : 'Use My Current Location'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: C.primary }]}
            onPress={() => onConfirm({ latitude: region.latitude, longitude: region.longitude })}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmText}>Confirm Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontWeight: '700' },
  centerPin: {
    position: 'absolute', top: '50%', left: '50%',
    marginLeft: -20, marginTop: -40, alignItems: 'center',
  },
  footer: { padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  locateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 12,
  },
  locateText: { fontSize: 13, fontWeight: '600' },
  confirmBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
