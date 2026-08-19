import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';

/* ── Relationship options ─────────────────────────────────────────────── */
const RELATIONSHIPS = [
  'Father', 'Mother', 'Son', 'Daughter', 'Spouse',
  'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Other',
];

/* ── Main screen ─────────────────────────────────────────────────────── */
export default function FamilyMemberFormScreen({ route, navigation }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const member = route.params?.member;
  const isEditing = !!member;

  const [name, setName] = useState(member?.name || '');
  const [relationship, setRelationship] = useState(member?.relationship || '');
  const [dateOfBirth, setDateOfBirth] = useState(
    member?.dateOfBirth ? new Date(member.dateOfBirth) : null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!relationship) errs.relationship = 'Relationship is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        relationship,
        dateOfBirth: dateOfBirth ? dateOfBirth.toISOString() : null,
      };

      if (isEditing) {
        await api.patch(`/users/family-members/${member._id}`, payload);
        Toast.show({ type: 'success', text1: 'Family member updated!' });
      } else {
        await api.post('/users/family-members', payload);
        Toast.show({ type: 'success', text1: 'Family member added!' });
      }
      navigation.goBack();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: err.response?.data?.message || 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateOfBirth(selectedDate);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title={isEditing ? 'Edit Family Member' : 'Add Family Member'}
        showBack
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: C.textSecondary }]}>Full Name *</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: C.surface,
              color: C.text,
              borderColor: errors.name ? (C.error || '#DC2626') : C.borderLight,
            }]}
            placeholder="Enter full name"
            placeholderTextColor={C.textLight}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (errors.name) setErrors((prev) => ({ ...prev, name: null }));
            }}
          />
          {errors.name && (
            <Text style={[styles.errorText, { color: C.error || '#DC2626' }]}>
              {errors.name}
            </Text>
          )}
        </View>

        {/* Relationship */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: C.textSecondary }]}>Relationship *</Text>
          <View style={styles.relationshipGrid}>
            {RELATIONSHIPS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.relationshipChip,
                  {
                    backgroundColor: relationship === r ? C.primary : C.surface,
                    borderColor: relationship === r ? C.primary : C.borderLight,
                  },
                ]}
                onPress={() => {
                  setRelationship(r);
                  if (errors.relationship) setErrors((prev) => ({ ...prev, relationship: null }));
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.relationshipChipText,
                    { color: relationship === r ? '#fff' : C.text },
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.relationship && (
            <Text style={[styles.errorText, { color: C.error || '#DC2626' }]}>
              {errors.relationship}
            </Text>
          )}
        </View>

        {/* Date of Birth */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: C.textSecondary }]}>Date of Birth (optional)</Text>
          <TouchableOpacity
            style={[styles.dateInput, {
              backgroundColor: C.surface,
              borderColor: C.borderLight,
            }]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={18} color={C.textSecondary} />
            <Text style={[styles.dateText, { color: dateOfBirth ? C.text : C.textLight }]}>
              {dateOfBirth ? formatDate(dateOfBirth) : 'Select date of birth'}
            </Text>
            {dateOfBirth && (
              <TouchableOpacity onPress={() => setDateOfBirth(null)}>
                <Ionicons name="close-circle" size={18} color={C.textLight} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={dateOfBirth || new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
            />
          )}
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: C.primary }]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={isEditing ? 'checkmark-circle' : 'add-circle'} size={18} color="#fff" />
              <Text style={styles.submitBtnText}>
                {isEditing ? 'Update Member' : 'Add Member'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  errorText: {
    fontSize: 12,
    marginTop: 6,
  },
  relationshipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  relationshipChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  relationshipChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateText: {
    flex: 1,
    fontSize: 15,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 10,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
