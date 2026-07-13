import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Modal, TextInput, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate } from '../../utils/helpers';
import { saveCache, loadCache } from '../../utils/offlineCache';
import useOnReconnect from '../../hooks/useOnReconnect';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, dayOfWeek 0=Sun..6=Sat
const DAY_NAMES = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

const toTimeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const timeToDate = (t) => {
  const d = new Date();
  if (t) { const [h, m] = t.split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); }
  return d;
};

export default function PanditAvailabilityScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toggling,  setToggling]  = useState(false);
  const [isAvailableForBookings, setIsAvailableForBookings] = useState(true);
  const [weekly,    setWeekly]    = useState({}); // { [dayOfWeek]: { enabled, slots:[{start,end}] } }
  const [specialDates, setSpecialDates] = useState([]);
  const [blockedPeriods, setBlockedPeriods] = useState([]);

  // Add-slot modal (weekly)
  const [slotModal, setSlotModal] = useState(null); // dayOfWeek or null
  const [slotStart, setSlotStart] = useState(new Date());
  const [slotEnd,   setSlotEnd]   = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker,   setShowEndPicker]   = useState(false);

  // Add special date modal
  const [specialModal, setSpecialModal] = useState(false);
  const [specialDate,  setSpecialDate]  = useState(new Date());
  const [specialType,  setSpecialType]  = useState('unavailable');
  const [showSpecialDatePicker, setShowSpecialDatePicker] = useState(false);
  const [specialSaving, setSpecialSaving] = useState(false);

  // Add blocked period modal
  const [blockModal,  setBlockModal]  = useState(false);
  const [blockStart,  setBlockStart]  = useState(new Date());
  const [blockEnd,    setBlockEnd]    = useState(new Date());
  const [showBlockStartPicker, setShowBlockStartPicker] = useState(false);
  const [showBlockEndPicker,   setShowBlockEndPicker]   = useState(false);
  const [blockTitle,  setBlockTitle]  = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);

  const applyPandit = (p) => {
    setIsAvailableForBookings(p?.isAvailableForBookings ?? true);
    const weeklyMap = {};
    DAY_ORDER.forEach((d) => { weeklyMap[d] = { enabled: false, slots: [] }; });
    (p?.weeklySchedule || []).forEach((d) => { weeklyMap[d.dayOfWeek] = { enabled: d.enabled, slots: d.slots || [] }; });
    setWeekly(weeklyMap);
    setSpecialDates(p?.specialDates || []);
    setBlockedPeriods(p?.blockedPeriods || []);
  };

  const load = async () => {
    try {
      const { data } = await api.get('/pandits/me');
      applyPandit(data.pandit);
      saveCache('availability', data.pandit);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load availability' });
      const cached = await loadCache('availability');
      if (cached) applyPandit(cached.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useOnReconnect(load);

  const handleToggleMaster = async (val) => {
    setIsAvailableForBookings(val);
    try {
      setToggling(true);
      await api.patch('/pandits/me/toggle-availability', { isAvailableForBookings: val });
      Toast.show({ type: 'success', text1: val ? 'You are now accepting bookings' : 'You are now unavailable for new bookings' });
    } catch (err) {
      setIsAvailableForBookings(!val);
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Update failed' });
    } finally { setToggling(false); }
  };

  const toggleDayEnabled = (day) => {
    setWeekly((prev) => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  };

  const removeSlot = (day, idx) => {
    setWeekly((prev) => ({ ...prev, [day]: { ...prev[day], slots: prev[day].slots.filter((_, i) => i !== idx) } }));
  };

  const openSlotModal = (day) => {
    setSlotStart(new Date()); setSlotEnd(new Date());
    setSlotModal(day);
  };

  const confirmAddSlot = () => {
    const start = toTimeStr(slotStart);
    const end = toTimeStr(slotEnd);
    if (start >= end) {
      Toast.show({ type: 'error', text1: 'End time must be after start time' });
      return;
    }
    setWeekly((prev) => ({ ...prev, [slotModal]: { ...prev[slotModal], slots: [...prev[slotModal].slots, { start, end }] } }));
    setSlotModal(null);
  };

  const handleSaveWeekly = async () => {
    try {
      setSaving(true);
      const weeklySchedule = DAY_ORDER.map((d) => ({ dayOfWeek: d, enabled: weekly[d].enabled, slots: weekly[d].slots }));
      await api.put('/pandits/me/weekly-schedule', { weeklySchedule });
      Toast.show({ type: 'success', text1: 'Weekly schedule saved' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  const handleAddSpecialDate = async () => {
    try {
      setSpecialSaving(true);
      await api.post('/pandits/me/special-dates', { date: specialDate.toISOString(), type: specialType, slots: [] });
      Toast.show({ type: 'success', text1: 'Special date added' });
      setSpecialModal(false);
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed to add' });
    } finally { setSpecialSaving(false); }
  };

  const handleDeleteSpecialDate = async (id) => {
    try {
      await api.delete(`/pandits/me/special-dates/${id}`);
      setSpecialDates((prev) => prev.filter((s) => s._id !== id));
    } catch {
      Toast.show({ type: 'error', text1: 'Could not delete' });
    }
  };

  const handleAddBlock = async () => {
    if (blockEnd < blockStart) {
      Toast.show({ type: 'error', text1: 'End date must be after start date' });
      return;
    }
    try {
      setBlockSaving(true);
      await api.post('/pandits/me/block', {
        startDate: blockStart.toISOString(), endDate: blockEnd.toISOString(),
        title: blockTitle.trim(), reason: blockReason.trim(),
      });
      Toast.show({ type: 'success', text1: 'Leave period added' });
      setBlockModal(false);
      setBlockTitle(''); setBlockReason('');
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed to add' });
    } finally { setBlockSaving(false); }
  };

  const handleDeleteBlock = async (id) => {
    try {
      await api.delete(`/pandits/me/block/${id}`);
      setBlockedPeriods((prev) => prev.filter((b) => b._id !== id));
    } catch {
      Toast.show({ type: 'error', text1: 'Could not delete' });
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Availability" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Available for Bookings</Text>
              <Text style={[styles.cardSub, { color: C.textSecondary }]}>Master switch — turn off to stop receiving new bookings</Text>
            </View>
            <Switch value={isAvailableForBookings} onValueChange={handleToggleMaster} disabled={toggling} trackColor={{ true: C.primary }} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Weekly Schedule</Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            {DAY_ORDER.map((day) => {
              const d = weekly[day] || { enabled: false, slots: [] };
              return (
                <View key={day} style={[styles.dayRow, { borderColor: C.border }]}>
                  <View style={styles.dayHeader}>
                    <Text style={[styles.dayName, { color: C.text }]}>{DAY_NAMES[day]}</Text>
                    <Switch value={d.enabled} onValueChange={() => toggleDayEnabled(day)} trackColor={{ true: C.primary }} />
                  </View>
                  {d.enabled && (
                    <View style={styles.slotsWrap}>
                      {d.slots.map((s, i) => (
                        <View key={i} style={[styles.slotChip, { borderColor: C.border, backgroundColor: C.background }]}>
                          <Text style={[styles.slotText, { color: C.text }]}>{s.start}–{s.end}</Text>
                          <TouchableOpacity onPress={() => removeSlot(day, i)}>
                            <Ionicons name="close-circle" size={16} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity style={[styles.addSlotBtn, { borderColor: C.primary }]} onPress={() => openSlotModal(day)}>
                        <Ionicons name="add" size={14} color={C.primary} />
                        <Text style={[styles.addSlotText, { color: C.primary }]}>Add Slot</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSaveWeekly} disabled={saving} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Weekly Schedule'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Special Dates / Leave</Text>
            <TouchableOpacity onPress={() => { setSpecialDate(new Date()); setSpecialType('unavailable'); setSpecialModal(true); }}>
              <Ionicons name="add-circle" size={24} color={C.primary} />
            </TouchableOpacity>
          </View>
          {specialDates.length === 0 ? (
            <Text style={[styles.emptyText, { color: C.textSecondary }]}>No special dates set</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 10 }}>
              {specialDates.map((s) => (
                <View key={s._id} style={[styles.listRow, { borderColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listRowTitle, { color: C.text }]}>{formatDate(s.date)}</Text>
                    <Text style={[styles.listRowSub, { color: C.textSecondary }]}>{s.type === 'custom' ? 'Custom hours' : 'Full day unavailable'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteSpecialDate(s._id)}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Blocked Dates (Extended Leave)</Text>
            <TouchableOpacity onPress={() => { setBlockStart(new Date()); setBlockEnd(new Date()); setBlockTitle(''); setBlockReason(''); setBlockModal(true); }}>
              <Ionicons name="add-circle" size={24} color={C.primary} />
            </TouchableOpacity>
          </View>
          {blockedPeriods.length === 0 ? (
            <Text style={[styles.emptyText, { color: C.textSecondary }]}>No blocked periods</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 10 }}>
              {blockedPeriods.map((b) => (
                <View key={b._id} style={[styles.listRow, { borderColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listRowTitle, { color: C.text }]}>{formatDate(b.startDate)} – {formatDate(b.endDate)}</Text>
                    {(b.title || b.reason) ? <Text style={[styles.listRowSub, { color: C.textSecondary }]} numberOfLines={1}>{b.title || b.reason}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteBlock(b._id)}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add slot modal */}
      <Modal visible={slotModal !== null} transparent animationType="slide" onRequestClose={() => setSlotModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Add Time Slot</Text>
            <View style={styles.timeRow}>
              <TouchableOpacity style={[styles.timeBtn, { borderColor: C.border }]} onPress={() => setShowStartPicker(true)}>
                <Text style={{ color: C.text }}>{toTimeStr(slotStart)}</Text>
              </TouchableOpacity>
              <Text style={{ color: C.textSecondary }}>to</Text>
              <TouchableOpacity style={[styles.timeBtn, { borderColor: C.border }]} onPress={() => setShowEndPicker(true)}>
                <Text style={{ color: C.text }}>{toTimeStr(slotEnd)}</Text>
              </TouchableOpacity>
            </View>
            {showStartPicker && (
              <DateTimePicker value={slotStart} mode="time" onChange={(e, d) => { setShowStartPicker(Platform.OS === 'ios'); if (e.type === 'set' && d) setSlotStart(d); }} />
            )}
            {showEndPicker && (
              <DateTimePicker value={slotEnd} mode="time" onChange={(e, d) => { setShowEndPicker(Platform.OS === 'ios'); if (e.type === 'set' && d) setSlotEnd(d); }} />
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setSlotModal(null)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: C.primary }]} onPress={confirmAddSlot}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add special date modal */}
      <Modal visible={specialModal} transparent animationType="slide" onRequestClose={() => setSpecialModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Add Special Date</Text>
            <TouchableOpacity style={[styles.timeBtn, { borderColor: C.border, alignSelf: 'stretch', alignItems: 'center' }]} onPress={() => setShowSpecialDatePicker(true)}>
              <Text style={{ color: C.text }}>{formatDate(specialDate)}</Text>
            </TouchableOpacity>
            {showSpecialDatePicker && (
              <DateTimePicker value={specialDate} mode="date" minimumDate={new Date()} onChange={(e, d) => { setShowSpecialDatePicker(Platform.OS === 'ios'); if (e.type === 'set' && d) setSpecialDate(d); }} />
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.segBtn, { borderColor: C.border }, specialType === 'unavailable' && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setSpecialType('unavailable')}>
                <Text style={{ color: specialType === 'unavailable' ? '#fff' : C.text, fontWeight: '700', fontSize: 13 }}>Full Day Off</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segBtn, { borderColor: C.border }, specialType === 'custom' && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setSpecialType('custom')}>
                <Text style={{ color: specialType === 'custom' ? '#fff' : C.text, fontWeight: '700', fontSize: 13 }}>Custom Hours</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setSpecialModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: C.primary }]} onPress={handleAddSpecialDate} disabled={specialSaving}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{specialSaving ? 'Saving…' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add blocked period modal */}
      <Modal visible={blockModal} transparent animationType="slide" onRequestClose={() => setBlockModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Add Blocked Period</Text>
            <View style={styles.timeRow}>
              <TouchableOpacity style={[styles.timeBtn, { borderColor: C.border, flex: 1 }]} onPress={() => setShowBlockStartPicker(true)}>
                <Text style={{ color: C.text }}>{formatDate(blockStart)}</Text>
              </TouchableOpacity>
              <Text style={{ color: C.textSecondary }}>to</Text>
              <TouchableOpacity style={[styles.timeBtn, { borderColor: C.border, flex: 1 }]} onPress={() => setShowBlockEndPicker(true)}>
                <Text style={{ color: C.text }}>{formatDate(blockEnd)}</Text>
              </TouchableOpacity>
            </View>
            {showBlockStartPicker && (
              <DateTimePicker value={blockStart} mode="date" minimumDate={new Date()} onChange={(e, d) => { setShowBlockStartPicker(Platform.OS === 'ios'); if (e.type === 'set' && d) setBlockStart(d); }} />
            )}
            {showBlockEndPicker && (
              <DateTimePicker value={blockEnd} mode="date" minimumDate={blockStart} onChange={(e, d) => { setShowBlockEndPicker(Platform.OS === 'ios'); if (e.type === 'set' && d) setBlockEnd(d); }} />
            )}
            <TextInput
              style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Title (e.g. Family trip)"
              placeholderTextColor={C.textSecondary}
              value={blockTitle}
              onChangeText={setBlockTitle}
            />
            <TextInput
              style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.background, height: 70 }]}
              placeholder="Reason"
              placeholderTextColor={C.textSecondary}
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setBlockModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: C.primary }]} onPress={handleAddBlock} disabled={blockSaving}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{blockSaving ? 'Saving…' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  card:       { borderRadius: 16, borderWidth: 1, padding: 16 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle:  { fontSize: 15, fontWeight: '700' },
  cardSub:    { fontSize: 12, marginTop: 2 },
  emptyText:  { fontSize: 13, marginTop: 8 },
  dayRow:     { borderWidth: 1, borderRadius: 12, padding: 10 },
  dayHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName:    { fontSize: 14, fontWeight: '600' },
  slotsWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slotChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  slotText:   { fontSize: 12, fontWeight: '600' },
  addSlotBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderStyle: 'dashed' },
  addSlotText:{ fontSize: 12, fontWeight: '600' },
  saveBtn:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  saveBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  listRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  listRowTitle: { fontSize: 13, fontWeight: '700' },
  listRowSub: { fontSize: 12, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  timeRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' },
  timeBtn:    { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  segBtn:     { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  modalBtns:  { flexDirection: 'row', gap: 12 },
  cancelBtn:  { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtn:  { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
