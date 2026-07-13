import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, daysUntil } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function CountdownBadge({ date, C }) {
  const diff = daysUntil(date);
  if (diff < 0 || diff > 14) return null;
  return (
    <View style={[styles.countdownBadge, { backgroundColor: diff === 0 ? '#DC2626' : C.primary }]}>
      <Text style={styles.countdownText}>{diff === 0 ? 'Today!' : `${diff}d`}</Text>
    </View>
  );
}

function MonthCalendar({ year, month, festivals, selectedDay, onSelectDay, C }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  const dayHasFestival = (d) => festivals.some((f) => new Date(f.date).getDate() === d);
  const today = new Date();
  const isToday = (d) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <View style={[styles.calendar, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.calDaysRow}>
        {DAYS.map((d) => <Text key={d} style={[styles.calDayLabel, { color: C.textSecondary }]}>{d}</Text>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={styles.calCell} />;
          const has = dayHasFestival(day);
          const sel = selectedDay === day;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.calCell, sel && { backgroundColor: C.primary, borderRadius: 10 }]}
              onPress={() => onSelectDay(sel ? null : day)}
              activeOpacity={0.7}
            >
              <Text style={[styles.calDayNum, { color: sel ? '#fff' : isToday(day) ? C.primary : C.text }]}>{day}</Text>
              {has && <View style={[styles.calDot, { backgroundColor: sel ? '#fff' : C.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function FestivalsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [view,       setView]       = useState('timeline'); // 'timeline' | 'calendar'
  const [search,      setSearch]     = useState('');
  const [selectedDay, setSelectedDay]= useState(null);

  const [festivals, setFestivals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/festivals', { params: { year: viewYear, month: viewMonth + 1 } });
      setFestivals(data.data || data.festivals || []);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load festivals' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { setSelectedDay(null); fetch(); }, [viewYear, viewMonth]);

  const goPrevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1); };
  const goNextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1); };

  const visibleFestivals = useMemo(() => {
    let list = festivals;
    if (selectedDay) list = list.filter((f) => new Date(f.date).getDate() === selectedDay);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => (f.name || '').toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q));
    }
    return list;
  }, [festivals, selectedDay, search]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('FestivalDetail', { festival: item })}
      activeOpacity={0.85}
    >
      <View style={[styles.iconWrap, { backgroundColor: C.primary + '18' }]}>
        <Ionicons name="flame" size={22} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: C.text }]}>{item.name || item.tithiDate || 'Panchang'}</Text>
        {item.date && <Text style={[styles.date, { color: C.primary }]}>{formatDate(item.date, 'EEEE, dd MMMM yyyy')}</Text>}
        {item.description && <Text style={[styles.desc, { color: C.textSecondary }]} numberOfLines={2}>{item.description}</Text>}
      </View>
      {item.date && <CountdownBadge date={item.date} C={C} />}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Festivals" />

      <View style={[styles.monthNav, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={goPrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={C.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: C.text }]}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={goNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={20} color={C.primary} />
        </TouchableOpacity>
        <View style={styles.viewToggle}>
          <TouchableOpacity onPress={() => setView('timeline')} style={[styles.toggleBtn, view === 'timeline' && { backgroundColor: C.primary }]}>
            <Ionicons name="list" size={16} color={view === 'timeline' ? '#fff' : C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setView('calendar')} style={[styles.toggleBtn, view === 'calendar' && { backgroundColor: C.primary }]}>
            <Ionicons name="calendar" size={16} color={view === 'calendar' ? '#fff' : C.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchWrap, { borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search this month's festivals…"
            placeholderTextColor={C.textSecondary}
          />
        </View>
      </View>

      {loading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={visibleFestivals}
          keyExtractor={(f) => f._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
          ListHeaderComponent={view === 'calendar' ? (
            <MonthCalendar year={viewYear} month={viewMonth} festivals={festivals} selectedDay={selectedDay} onSelectDay={setSelectedDay} C={C} />
          ) : null}
          ListHeaderComponentStyle={{ marginBottom: 12 }}
          ListEmptyComponent={<EmptyState icon="calendar-outline" title="No festivals found" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  monthLabel: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  viewToggle: { flexDirection: 'row', gap: 4 },
  toggleBtn:  { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput:{ flex: 1, fontSize: 13 },
  card:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  name:     { fontSize: 15, fontWeight: '700' },
  date:     { fontSize: 13, fontWeight: '600', marginTop: 2 },
  desc:     { fontSize: 12, lineHeight: 18, marginTop: 4 },
  countdownBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  countdownText:  { fontSize: 10, fontWeight: '800', color: '#fff' },
  calendar:   { borderRadius: 16, borderWidth: 1, padding: 10 },
  calDaysRow: { flexDirection: 'row' },
  calDayLabel:{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  calGrid:    { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:    { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  calDayNum:  { fontSize: 13, fontWeight: '500' },
  calDot:     { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
