import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';
import AddressPicker from '../../components/shared/AddressPicker';

export default function AddressBookScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;
  // Local no-op value/onChange — manager mode has no selection concept,
  // AddressPicker just needs a stable value object to satisfy its props.
  const [value] = useState({});

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Saved Addresses" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <AddressPicker mode="manager" value={value} onChange={() => {}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
