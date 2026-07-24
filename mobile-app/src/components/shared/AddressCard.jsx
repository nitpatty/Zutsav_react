import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';

const LABEL_ICON = { Home: 'home', Office: 'business', Other: 'location' };

// Presentational card for one saved address — used both in the picker
// (booking/checkout) and the manager (Address Book) modes of AddressPicker.
export default function AddressCard({ address, selected, onSelect, onEdit, onDelete }) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const icon = LABEL_ICON[address.label] || 'location';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: selected ? C.primary + '0D' : C.surface, shadowColor: C.shadow || '#000' },
        selected && { borderWidth: 1.5, borderColor: C.primary },
      ]}
      onPress={onSelect}
      activeOpacity={onSelect ? 0.88 : 1}
      disabled={!onSelect}
    >
      <View style={[styles.iconWrap, { backgroundColor: C.primary + '17' }]}>
        <Ionicons name={icon} size={18} color={C.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: C.text }]}>{address.label || 'Home'}</Text>
          {address.isDefault && (
            <View style={[styles.defaultBadge, { backgroundColor: C.primary + '20' }]}>
              <Text style={[styles.defaultBadgeText, { color: C.primary }]}>Default</Text>
            </View>
          )}
        </View>
        <Text style={[styles.addrText, { color: C.textSecondary }]} numberOfLines={2}>{address.address}</Text>
        {(address.city || address.state || address.pincode) && (
          <Text style={[styles.addrSub, { color: C.textLight }]}>
            {[address.city, address.state, address.pincode].filter(Boolean).join(', ')}
          </Text>
        )}
      </View>

      {onSelect && (
        <View style={[styles.radio, { borderColor: selected ? C.primary : C.border }]}>
          {selected && <View style={[styles.radioDot, { backgroundColor: C.primary }]} />}
        </View>
      )}
      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={17} color={C.textSecondary} />
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={17} color={C.error || '#DC2626'} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 18, padding: 14,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  iconWrap:  { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  radio:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  radioDot:  { width: 10, height: 10, borderRadius: 5 },
  labelRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label:     { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  defaultBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  defaultBadgeText: { fontSize: 9, fontWeight: '700' },
  addrText:  { fontSize: 13, lineHeight: 18, marginTop: 3 },
  addrSub:   { fontSize: 11, marginTop: 2 },
  actionBtn: { padding: 4 },
});
