import React, { useRef, useState } from 'react';
import { View, Image, Text, TouchableOpacity, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OSM_TILE_URL, OSM_TILE_USER_AGENT, OSM_COPYRIGHT_URL, OSM_ATTRIBUTION } from '../../utils/mapConfig';
import {
  MIN_ZOOM, MAX_ZOOM, clampZoom, panCenter, pinchSteps, pointAt, tileUrl, visibleTiles,
} from '../../utils/slippyMap';

// Interactive map for Android (the Google-backed react-native-maps view needs a Google key Zutsav does not have, and the Ola Maps
// SDK is native-only — see docs/MAPS_ARCHITECTURE_AUDIT.md). It draws real OpenStreetMap raster tiles — the same provider and tiling
// the website's Leaflet picker uses — with plain React Native views, so it needs no new dependency, no API key and no native change.
//
//   center, zoom        – what is shown (controlled by the parent, like the picker's `region`)
//   onCenterChange(p, { gesture: 'pan' | 'tap' })  – the user dragged the map, or tapped a point (which becomes the new centre/pin)
//   onZoomChange(z)     – zoom buttons or pinch
//   onFailure()         – no tile could be loaded (offline / blocked): the parent shows its "map unavailable" state
//   zoomInLabel, zoomOutLabel – accessibility labels (translated by the parent)
// The pin is fixed in the middle of the view; the map moves underneath it ("Uber-style"), exactly like the iOS picker. Gestures:
// drag = pan, tap = move the pin there, two fingers = pinch zoom (whole steps), and the +/- buttons. OpenStreetMap's required
// attribution is shown and links to its copyright page.

const ZERO = { dx: 0, dy: 0 };
const TAP_SLOP = 8;                                           // px of finger travel that still counts as a tap
const FAILURE_ERRORS = 4;                                     // tile errors, with no tile ever loaded, before reporting failure

const fingerDistance = (touches) => Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);

export default function OsmTileMap({
  center, zoom, onCenterChange, onZoomChange, onFailure, markerColor = '#D4AF37', zoomInLabel, zoomOutLabel,
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState(ZERO);
  const [loadedTiles, setLoadedTiles] = useState(0);
  const failedRef = useRef({ errors: 0, reported: false });

  // The responder callbacks are created once per render but must see the latest props; the gesture bookkeeping lives in a ref.
  const latest = useRef({});
  latest.current = { center, zoom, size, onCenterChange, onZoomChange };
  const g = useRef({ startX: 0, startY: 0, dx: 0, dy: 0, moved: false, pinching: false, pinchStart: 0, pinchEnd: 0 });
  const resetGesture = () => { g.current = { startX: 0, startY: 0, dx: 0, dy: 0, moved: false, pinching: false, pinchStart: 0, pinchEnd: 0 }; setOffset(ZERO); };

  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e) => {
      g.current = { ...g.current, startX: e.nativeEvent.pageX, startY: e.nativeEvent.pageY, dx: 0, dy: 0, moved: false, pinching: false };
    },
    onResponderMove: (e) => {
      const { touches = [], pageX, pageY } = e.nativeEvent;
      const s = g.current;
      if (touches.length >= 2) {
        const d = fingerDistance(touches);
        if (!s.pinching) { s.pinching = true; s.pinchStart = d; }
        s.pinchEnd = d;
        s.moved = true;
        return;
      }
      if (s.pinching) return;                                  // one finger lifted mid-pinch: wait for release
      const dx = pageX - s.startX;
      const dy = pageY - s.startY;
      if (!s.moved && Math.hypot(dx, dy) < TAP_SLOP) return;   // still a tap
      s.moved = true; s.dx = dx; s.dy = dy;
      setOffset({ dx, dy });
    },
    onResponderRelease: (e) => {
      const { center: c, zoom: z, size: sz, onCenterChange: moveTo, onZoomChange: zoomTo } = latest.current;
      const s = g.current;
      if (s.pinching) {
        const steps = pinchSteps(s.pinchStart, s.pinchEnd);
        if (steps && zoomTo) zoomTo(clampZoom(z + steps));
      } else if (s.moved) {
        if (moveTo) moveTo(panCenter(c, z, s.dx, s.dy), { gesture: 'pan' });
      } else if (moveTo && sz.width > 0) {
        moveTo(pointAt({ center: c, zoom: z, width: sz.width, height: sz.height, px: e.nativeEvent.locationX, py: e.nativeEvent.locationY }), { gesture: 'tap' });
      }
      resetGesture();
    },
    onResponderTerminate: resetGesture,
  };

  const tiles = visibleTiles({ center, zoom, width: size.width, height: size.height, offset });

  const handleTileError = () => {
    const f = failedRef.current;
    f.errors += 1;
    if (!f.reported && loadedTiles === 0 && f.errors >= FAILURE_ERRORS) { f.reported = true; if (onFailure) onFailure(); }
  };

  return (
    <View style={styles.root} testID="osm-map">
      <View
        style={styles.surface}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        accessibilityLabel="Map"
        {...responder}
      >
        {tiles.map((t) => (
          <Image
            key={t.key}
            testID="osm-tile"
            pointerEvents="none"
            source={{ uri: tileUrl(OSM_TILE_URL, t.z, t.x, t.y), headers: { 'User-Agent': OSM_TILE_USER_AGENT } }}
            style={[styles.tile, { left: t.left, top: t.top }]}
            resizeMode="stretch"
            fadeDuration={0}
            onLoad={() => setLoadedTiles((n) => n + 1)}
            onError={handleTileError}
          />
        ))}
      </View>

      {loadedTiles === 0 && size.width > 0 ? (
        <View style={styles.loading} pointerEvents="none" testID="osm-loading">
          <ActivityIndicator color="#555" />
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.pin} testID="map-marker">
        <Ionicons name="location" size={40} color={markerColor} />
      </View>

      <View style={styles.zoomControls}>
        <TouchableOpacity
          style={[styles.zoomBtn, zoom >= MAX_ZOOM && styles.zoomDisabled]}
          onPress={() => onZoomChange && onZoomChange(clampZoom(zoom + 1))}
          disabled={zoom >= MAX_ZOOM}
          accessibilityRole="button"
          accessibilityLabel={zoomInLabel || 'Zoom in'}
          testID="map-zoom-in"
        >
          <Ionicons name="add" size={22} color="#222" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.zoomBtn, zoom <= MIN_ZOOM && styles.zoomDisabled]}
          onPress={() => onZoomChange && onZoomChange(clampZoom(zoom - 1))}
          disabled={zoom <= MIN_ZOOM}
          accessibilityRole="button"
          accessibilityLabel={zoomOutLabel || 'Zoom out'}
          testID="map-zoom-out"
        >
          <Ionicons name="remove" size={22} color="#222" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.attribution}
        onPress={() => Linking.openURL(OSM_COPYRIGHT_URL)}
        accessibilityRole="link"
        accessibilityLabel={OSM_ATTRIBUTION}
        testID="osm-attribution"
      >
        <Text style={styles.attributionText}>{OSM_ATTRIBUTION}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E5E3DF', overflow: 'hidden' },       // OSM's own land colour while tiles load
  surface: { flex: 1, overflow: 'hidden' },
  tile: { position: 'absolute', width: 256, height: 256 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -40, alignItems: 'center' },
  zoomControls: { position: 'absolute', right: 12, top: 12, gap: 8 },
  zoomBtn: {
    width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.25)',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  zoomDisabled: { opacity: 0.4 },
  attribution: { position: 'absolute', right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, paddingVertical: 3 },
  attributionText: { fontSize: 10, color: '#333' },
});
