import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';

// Presentational card for one saved address — used both in the picker
// (booking/checkout) and the manager (Address Book) modes of AddressPicker.
export default function AddressCard({ address, selected, onSelect, onEdit, onDelete }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: selected ? C.primary : C.border, backgroundColor: selected ? C.primary + '10' : C.surface }]}
      onPress={onSelect}
      activeOpacity={onSelect ? 0.8 : 1}
      disabled={!onSelect}
    >
      {onSelect ? (
        <View style={[styles.radio, { borderColor: selected ? C.primary : C.border }]}>
          {selected && <View style={[styles.radioDot, { backgroundColor: C.primary }]} />}
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: C.text }]}>{address.label || 'Home'}</Text>
          {address.isDefault && (
            <View style={[styles.defaultBadge, { backgroundColor: C.primary + '20' }]}>
              <Text style={[styles.defaultBadgeText, { color: C.primary }]}>Default</Text>
            </View>
          )}
        </View>
        <Text style={[styles.addrText, { color: C.textSecondary }]}>{address.address}</Text>
        {(address.city || address.state || address.pincode) && (
          <Text style={[styles.addrSub, { color: C.textSecondary }]}>
            {[address.city, address.state, address.pincode].filter(Boolean).join(', ')}
          </Text>
        )}
      </View>

      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={18} color={C.textSecondary} />
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1.5, borderRadius: 14, padding: 12,
  },
  radio:            { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  radioDot:         { width: 10, height: 10, borderRadius: 5 },
  labelRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label:            { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  defaultBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  defaultBadgeText: { fontSize: 9, fontWeight: '700' },
  addrText:         { fontSize: 13, lineHeight: 18, marginTop: 2 },
  addrSub:          { fontSize: 11, marginTop: 2 },
  actionBtn:        { padding: 4 },
});
