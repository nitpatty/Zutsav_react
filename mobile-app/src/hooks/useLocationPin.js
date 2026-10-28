import { useState, useCallback } from 'react';
import { makePin, pinCoordsForSave } from '../utils/locationPin';

/**
 * Pin state for screens that own their address form (User profile, address-book sheet, Pandit address).
 * Rules live in utils/locationPin.js. Usage:
 *   const pin = useLocationPin(initialCoords);
 *   search / GPS / map confirm  → pin.select(coords, 'search' | 'gps' | 'map')
 *   loading or opening a saved address → pin.reset(coords)           (never stale)
 *   manual edit of an address field    → pin.markStale()
 *   saving                             → { ...pin.coordsForSave() }   (both numbers, or both null)
 * Programmatic fills (search components, pincode lookup) must NOT call markStale.
 */
export default function useLocationPin(initialCoords = null) {
  const [pin, setPin] = useState(() => makePin(initialCoords, 'saved'));

  const select = useCallback((coords, source) => setPin(makePin(coords, source)), []);
  const reset = useCallback((coords) => setPin(makePin(coords, 'saved')), []);
  const markStale = useCallback(() => setPin((p) => (p && !p.stale ? { ...p, stale: true } : p)), []);
  const coordsForSave = useCallback(() => pinCoordsForSave(pin), [pin]);

  return {
    coords: pin ? pin.coords : null,
    source: pin ? pin.source : null,
    stale: !!(pin && pin.stale),
    select,
    reset,
    markStale,
    coordsForSave,
  };
}
