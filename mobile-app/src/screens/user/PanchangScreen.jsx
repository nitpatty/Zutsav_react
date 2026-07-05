import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function toDateStr(d) { return d.toISOString().split('T')[0]; }

function JumpToDateModal({ visible, onClose, onSelect, initialDate }) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [vy, setVY] = useState(initialDate.getFullYear());
  const [vm, setVM] = useState(initialDate.getMonth());

  const firstDay = new Date(vy, vm, 1).getDay();
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  const today = new Date();

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => vm === 0 ? (setVM(11), setVY((y) => y - 1)) : setVM((m) => m - 1)}>
              <Ionicons name="chevron-back" size={20} color={C.primary} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: C.text }]}>{monthNames[vm]} {vy}</Text>
            <TouchableOpacity onPress={() => vm === 11 ? (setVM(0), setVY((y) => y + 1)) : setVM((m) => m + 1)}>
              <Ionicons name="chevron-forward" size={20} color={C.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.calDaysRow}>
            {DAYS.map((d) => <Text key={d} style={[styles.calDayLabel, { color: C.textSecondary }]}>{d}</Text>)}
          </View>
          <View style={styles.calGrid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={styles.calCell} />;
              const isToday = today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === day;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.calCell}
                  onPress={() => onSelect(new Date(vy, vm, day))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.calDayNum, { color: isToday ? C.primary : C.text }]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RahuKaalCard({ rahuKaal, C }) {
  if (!rahuKaal) return null;
  return (
    <View style={[styles.card, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
      <View style={styles.cardRow}>
        <View style={[styles.iconWrap, { backgroundColor: '#FEE2E2' }]}>
          <Ionicons name="warning" size={18} color="#DC2626" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { color: '#B91C1C' }]}>Rahu Kaal · Avoid</Text>
          <Text style={[styles.cardValue, { color: '#991B1B' }]}>{rahuKaal.start} – {rahuKaal.end}</Text>
        </View>
      </View>
    </View>
  );
}

export default function PanchangScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [panchang,     setPanchang]     = useState(null);
  const [weekPanchang, setWeekPanchang] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [date,         setDate]         = useState(new Date());
  const [view,         setView]         = useState('daily'); // 'daily' | 'weekly'
  const [pickerVisible, setPickerVisible] = useState(false);

  const fetchDaily = async (d = date, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/panchang?date=${toDateStr(d)}`);
      setPanchang(data.panchang || data.data || null);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load Panchang' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchWeekly = async (d = date, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/panchang/week?date=${toDateStr(d)}`);
      setWeekPanchang(data.panchang || data.data || []);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load weekly Panchang' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (view === 'daily') fetchDaily(date);
    else fetchWeekly(date);
  }, [view]);

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
    if (view === 'daily') fetchDaily(d);
    else fetchWeekly(d);
  };

  const handleJumpTo = (d) => {
    setDate(d);
    setPickerVisible(false);
    if (view === 'daily') fetchDaily(d);
    else fetchWeekly(d);
  };

  const handleSelectWeekDay = (d) => {
    setDate(d);
    setView('daily');
    fetchDaily(d);
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (view === 'daily') fetchDaily(date, true);
    else fetchWeekly(date, true);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Panchang" showBack={false} />

      <View style={[styles.viewToggleRow, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => setView('daily')} style={[styles.toggleBtn, view === 'daily' && { backgroundColor: C.primary }]}>
          <Text style={{ color: view === 'daily' ? '#fff' : C.textSecondary, fontSize: 12, fontWeight: '700' }}>Daily</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setView('weekly')} style={[styles.toggleBtn, view === 'weekly' && { backgroundColor: C.primary }]}>
          <Text style={{ color: view === 'weekly' ? '#fff' : C.textSecondary, fontSize: 12, fontWeight: '700' }}>Weekly</Text>
        </TouchableOpacity>
      </View>

      {/* Date navigation */}
      <View style={[styles.dateNav, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPickerVisible(true)} style={{ flex: 1, alignItems: 'center' }} activeOpacity={0.7}>
          <Text style={[styles.dateText, { color: C.text }]}>{formatDate(date, 'EEEE, dd MMMM yyyy')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeDate(1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {loading ? <LoadingSpinner fullScreen /> : view === 'daily' ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {panchang ? (
            <>
              {panchang.tithi && <PanchangCard title="Tithi" value={panchang.tithi} icon="moon" C={C} />}
              {panchang.nakshatra && <PanchangCard title="Nakshatra" value={panchang.nakshatra} icon="star" C={C} />}
              {panchang.yoga && <PanchangCard title="Yoga" value={panchang.yoga} icon="sparkles" C={C} />}
              {panchang.karana && <PanchangCard title="Karana" value={panchang.karana} icon="triangle" C={C} />}
              {panchang.sunrise && <PanchangCard title="Sunrise" value={panchang.sunrise} icon="sunny" C={C} />}
              {panchang.sunset && <PanchangCard title="Sunset" value={panchang.sunset} icon="partly-sunny" C={C} />}
              <RahuKaalCard rahuKaal={panchang.rahuKaal} C={C} />
              {panchang.muhurta && (
                <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <Text style={[styles.cardTitle, { color: C.text }]}>Brahma Muhurta</Text>
                  <Text style={{ color: C.primary, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{panchang.muhurta}</Text>
                </View>
              )}
            </>
          ) : (
            <Text style={[styles.noData, { color: C.textSecondary }]}>Panchang data not available for this date</Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {weekPanchang.map((p, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.weekCard, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => { const d = new Date(date); d.setDate(d.getDate() + i); handleSelectWeekDay(d); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.weekDate, { color: C.text }]}>{p.date}</Text>
              <View style={styles.weekRow}>
                {p.tithi && <Text style={[styles.weekMeta, { color: C.textSecondary }]}>Tithi: {p.tithi}</Text>}
                {p.nakshatra && <Text style={[styles.weekMeta, { color: C.textSecondary }]}>Nakshatra: {p.nakshatra}</Text>}
              </View>
              {p.rahuKaal && (
                <Text style={styles.weekRahu}>Rahu Kaal: {p.rahuKaal.start} – {p.rahuKaal.end}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <JumpToDateModal
        visible={pickerVisible}
        initialDate={date}
        onClose={() => setPickerVisible(false)}
        onSelect={handleJumpTo}
      />
    </View>
  );
}

function PanchangCard({ title, value, icon, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.cardRow}>
        <View style={[styles.iconWrap, { backgroundColor: C.primary + '18' }]}>
          <Ionicons name={icon} size={18} color={C.primary} />
        </View>
        <View>
          <Text style={[styles.cardLabel, { color: C.textSecondary }]}>{title}</Text>
          <Text style={[styles.cardValue, { color: C.text }]}>{value}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  viewToggleRow:{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  toggleBtn:    { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn:       { padding: 8 },
  dateText:     { fontSize: 14, fontWeight: '700' },
  card:         { borderRadius: 16, borderWidth: 1, padding: 14 },
  cardRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:     { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardLabel:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue:    { fontSize: 16, fontWeight: '700', marginTop: 2 },
  cardTitle:    { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  noData:       { textAlign: 'center', marginTop: 32, fontSize: 14 },
  weekCard:     { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  weekDate:     { fontSize: 14, fontWeight: '700' },
  weekRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  weekMeta:     { fontSize: 12 },
  weekRahu:     { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle:   { fontSize: 15, fontWeight: '700' },
  calDaysRow:   { flexDirection: 'row' },
  calDayLabel:  { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  calGrid:      { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:      { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  calDayNum:    { fontSize: 13, fontWeight: '500' },
});
