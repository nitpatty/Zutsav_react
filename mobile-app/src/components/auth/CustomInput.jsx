import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AUTH_COLORS } from './colors';

export default function CustomInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  rightIcon,
  onRightIconPress,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  returnKeyType = 'next',
  onSubmitEditing,
  style,
}) {
  return (
    <View style={[styles.wrap, style]}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={AUTH_COLORS.placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      {rightIcon && (
        <TouchableOpacity style={styles.iconBtn} onPress={onRightIconPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={rightIcon} size={20} color={AUTH_COLORS.placeholder} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH_COLORS.inputBg,
    borderWidth: 1.3,
    borderColor: AUTH_COLORS.inputBorder,
    borderRadius: 16,
    paddingHorizontal: 18,
    shadowColor: '#B8863B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: AUTH_COLORS.inputText,
  },
  iconBtn: {
    paddingLeft: 8,
    paddingVertical: 10,
  },
});
