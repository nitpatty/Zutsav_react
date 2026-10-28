import React, { useState, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../../store/themeStore';
import { isEmbeddedMapAvailable, sanitizeCoords, TILE_MAP_SAVED_ZOOM, TILE_MAP_DEFAULT_ZOOM } from '../../utils/mapConfig';
import OsmTileMap from './OsmTileMap';
import { formatPinLabel } from '../../utils/locationPin';
import { useTranslation } from '../../i18n';

const DEFAULT_REGION = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 0.5, longitudeDelta: 0.5 };

// "Pin stays centered, drag the map underneath it" picker — same pattern
// Uber/Swiggy use for address confirmation. Simpler and more reliable than a
// draggable Marker. Reads the final center via onRegionChangeComplete.
//   visible       – boolean
//   initialCoords – { latitude, longitude } | null     (read every time the picker OPENS)
//   onConfirm     – ({ latitude, longitude }, { source: 'saved' | 'gps' | 'map' }) => void
//   onClose       – () => void
//
// The body below only exists while the modal is open, so each opening starts from the coordinates passed in at
// that moment — never from what an earlier opening left behind.
export default function MapPicker({ visible, initialCoords, onConfirm, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible ? <PickerBody initialCoords={initialCoords} onConfirm={onConfirm} onClose={onClose} /> : null}
    </Modal>
  );
}

function PickerBody({ initialCoords, onConfirm, onClose }) {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const mapRef = useRef(null);

  // Saved coordinates may be strings, NaN or out of range (API / form data) — never hand those to the native map.
  const start = sanitizeCoords(initialCoords);
  // `react-native-maps` is Google-backed on Android and Zutsav has no Google Maps setup, so it is never mounted there (it would
  // fail or show a blank grey map). Android gets the keyless OpenStreetMap tile map instead (same provider as the website's picker);
  // iOS keeps Apple Maps. Both work the same way: the pin stays centred and the map moves underneath it.
  const mapAvailable = isEmbeddedMapAvailable();

  const [region, setRegion] = useState(
    start ? { ...start, latitudeDelta: 0.02, longitudeDelta: 0.02 } : DEFAULT_REGION
  );
  const [locating, setLocating] = useState(false);
  // Tile map only (Android): zoom level, and whether no tile could be loaded (offline / blocked) — then the "map unavailable" state shows.
  const [zoom, setZoom] = useState(start ? TILE_MAP_SAVED_ZOOM : TILE_MAP_DEFAULT_ZOOM);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [tileAttempt, setTileAttempt] = useState(0);
  // When opened without a saved location the map shows the default India-wide
  // view. Confirming that untouched view would silently save the centre of
  // India as the user's location, so confirm stays disabled until the user
  // actually pans the map or taps "Use My Current Location".
  const [userMoved, setUserMoved] = useState(!!start);
  // Where the current point came from: 'saved' (passed in), 'gps' or 'map' (panned). null = nothing chosen yet.
  const [source, setSource] = useState(start ? 'saved' : null);

  const handleUseCurrentLocation = async () => {
    try {
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Toast.show({ type: 'error', text1: t('location.permissionDenied') });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const fix = sanitizeCoords({ latitude: pos?.coords?.latitude, longitude: pos?.coords?.longitude });
      if (!fix) throw new Error('invalid position');
      const next = { ...fix, latitudeDelta: 0.02, longitudeDelta: 0.02 };
      setRegion(next);
      setZoom(TILE_MAP_SAVED_ZOOM);
      setUserMoved(true);
      setSource('gps');
      mapRef.current?.animateToRegion(next, 500);
    } catch {
      Toast.show({ type: 'error', text1: t('location.locateFailed') });
    } finally {
      setLocating(false);
    }
  };

  // The user dragged the tile map, or tapped a point on it: that point is now under the pin and is the selection.
  const handleTileCenterChange = (point) => {
    setRegion((r) => ({ ...r, latitude: point.latitude, longitude: point.longitude }));
    setUserMoved(true);
    setSource('map');
  };

  const handleConfirm = () => {
    const point = sanitizeCoords({ latitude: region.latitude, longitude: region.longitude });
    if (!userMoved || !point) {
      Toast.show({ type: 'error', text1: t('location.confirmInvalid') });
      return;
    }
    onConfirm(point, { source: source || 'map' });
  };

  const selection = userMoved ? sanitizeCoords({ latitude: region.latitude, longitude: region.longitude }) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.text }]}>{t('location.mapTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ flex: 1 }}>
        {mapAvailable ? (
          <>
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={region}
              onRegionChangeComplete={setRegion}
              onPanDrag={() => { setUserMoved(true); setSource('map'); }}
            />
            <View pointerEvents="none" style={styles.centerPin}>
              <Ionicons name="location" size={40} color={C.primary} />
            </View>
          </>
        ) : tilesFailed ? (
          <View style={styles.unavailable} testID="map-unavailable">
            <Ionicons name="map-outline" size={44} color={C.border} />
            <Text style={[styles.unavailableTitle, { color: C.text }]}>{t('location.mapUnavailable')}</Text>
            <Text style={[styles.hint, { color: C.textSecondary }]}>
              {t('location.mapUnavailableHint')}
            </Text>
            <TouchableOpacity
              style={[styles.locateBtn, { borderColor: C.border, paddingHorizontal: 20 }]}
              onPress={() => { setTilesFailed(false); setTileAttempt((n) => n + 1); }}
              accessibilityRole="button"
              accessibilityLabel={t('location.tryAgainLabel')}
            >
              <Text style={[styles.locateText, { color: C.text }]}>{t('location.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <OsmTileMap
            key={tileAttempt}
            center={{ latitude: region.latitude, longitude: region.longitude }}
            zoom={zoom}
            onCenterChange={handleTileCenterChange}
            onZoomChange={setZoom}
            onFailure={() => setTilesFailed(true)}
            markerColor={C.primary}
            zoomInLabel={t('location.zoomIn')}
            zoomOutLabel={t('location.zoomOut')}
          />
        )}
      </View>

      <View style={[styles.footer, { backgroundColor: C.surface, borderTopColor: C.border }]}>
        {selection ? (
          <Text style={[styles.hint, { color: C.text }]} testID="picker-selection">
            {formatPinLabel(selection, source, t)}
          </Text>
        ) : mapAvailable || !tilesFailed ? (
          <Text style={[styles.hint, { color: C.textSecondary }]}>
            {t('location.dragHint')}
          </Text>
        ) : null}
        <TouchableOpacity style={[styles.locateBtn, { borderColor: C.border }]} onPress={handleUseCurrentLocation} disabled={locating}>
          <Ionicons name="navigate" size={16} color={C.primary} />
          <Text style={[styles.locateText, { color: C.text }]}>{locating ? t('location.locating') : t('location.useCurrent')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: C.primary }, !userMoved && styles.confirmDisabled]}
          onPress={handleConfirm}
          disabled={!userMoved}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmText}>{t('location.confirm')}</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  confirmDisabled: { opacity: 0.5 },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, textAlign: 'center', marginBottom: 2 },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  unavailableTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
