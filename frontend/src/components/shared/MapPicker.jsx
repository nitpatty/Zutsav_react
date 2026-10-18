import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader } from 'lucide-react';
import { reverseGeocodeLocation } from '../../services/geocodingService';

// Leaflet is loaded dynamically to avoid SSR issues and to inject CSS
let L = null;
let leafletLoaded = false;
let leafletCallbacks = [];

const loadLeaflet = () => {
  if (leafletLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    leafletCallbacks.push(resolve);
    if (leafletCallbacks.length > 1) return; // already loading

    // Inject Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then((mod) => {
      L = mod.default;
      // Fix default marker icon paths broken by bundlers
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      leafletLoaded = true;
      leafletCallbacks.forEach((cb) => cb());
      leafletCallbacks = [];
    });
  });
};

/**
 * MapPicker — Leaflet-based OpenStreetMap with a draggable pin.
 * Geocoding (forward + reverse) is handled entirely by
 * ../../services/geocodingService — this component only renders the map
 * and reports the coordinates the user ends up with.
 *
 * Props:
 *   lat, lng            — coordinates (default: India center, used only as the
 *                         initial MAP VIEW when no real location is known)
 *   hasPin              — whether a marker exists for the given coordinates.
 *                         Pass false when the stored location is unknown/null —
 *                         the map then shows NO pin (so an unset location is
 *                         never mistaken for the centre-of-India), and the pin
 *                         is created on the first click/drag. Default true.
 *   onPinMove(lat, lng, address) — called when pin is dragged / map clicked
 *   height              — CSS height string (default: '360px')
 *   readOnly            — disable dragging
 */
export default function MapPicker({ lat = 20.5937, lng = 78.9629, hasPin = true, onPinMove, height = '360px', readOnly = false }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerRef    = useRef(null);
  const ensureMarkerRef = useRef(null);
  const [ready, setReady]     = useState(false);

  useEffect(() => {
    loadLeaflet().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    if (mapRef.current) return; // already initialised

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom:   13,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const buildMarker = (mLat, mLng) => {
      const marker = L.marker([mLat, mLng], { draggable: !readOnly }).addTo(map);
      if (!readOnly) {
        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          const { displayName } = await reverseGeocodeLocation(pos.lat, pos.lng);
          onPinMove && onPinMove(pos.lat, pos.lng, displayName);
        });
      }
      markerRef.current = marker;
      return marker;
    };
    ensureMarkerRef.current = buildMarker;

    if (hasPin && Number.isFinite(lat) && Number.isFinite(lng)) buildMarker(lat, lng);

    if (!readOnly) {
      map.on('click', async (e) => {
        const marker = markerRef.current || ensureMarkerRef.current(e.latlng.lat, e.latlng.lng);
        marker.setLatLng(e.latlng);
        const { displayName } = await reverseGeocodeLocation(e.latlng.lat, e.latlng.lng);
        onPinMove && onPinMove(e.latlng.lat, e.latlng.lng, displayName);
      });
    }

    mapRef.current    = map;
    markerRef.current = markerRef.current || null;
  }, [ready]);

  // Update marker position when lat/lng props change externally (e.g. address/pincode lookup)
  useEffect(() => {
    if (!mapRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const marker = markerRef.current || (ensureMarkerRef.current && ensureMarkerRef.current(lat, lng));
    if (!marker) return;
    const pos = [lat, lng];
    marker.setLatLng(pos);
    mapRef.current.setView(pos, 15);
  }, [lat, lng]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current    = null;
        markerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height }}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <Loader size={24} className="animate-spin text-saffron-500" />
        </div>
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {!readOnly && ready && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm text-xs text-gray-600 px-3 py-1 rounded-full shadow flex items-center gap-1 z-[1000] pointer-events-none">
          <MapPin size={11} className="text-saffron-500" /> Click map or drag pin to set location
        </div>
      )}
    </div>
  );
}
