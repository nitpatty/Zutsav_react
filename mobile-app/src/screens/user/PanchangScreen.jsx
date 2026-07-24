import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate } from '../../utils/helpers';
import ScreenHeader from '../../components/ScreenHeader';
import { COLORS, SHADOW } from '../../theme/tokens';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const toDateStr = (d) => d.toISOString().split('T')[0];

const asItems = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isToday = (d) => {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
};

const MOON_PHASES = {
  'New Moon': { icon: 'moon-outline', color: '#6B7280' },
  'Waxing Crescent': { icon: 'moon', color: '#D97706' },
  'First Quarter': { icon: 'moon', color: '#D97706' },
  'Waxing Gibbous': { icon: 'moon', color: '#D97706' },
  'Full Moon': { icon: 'moon', color: '#2563EB' },
  'Waning Gibbous': { icon: 'moon', color: '#7C3AED' },
  'Last Quarter': { icon: 'moon', color: '#7C3AED' },
  'Waning Crescent': { icon: 'moon', color: '#7C3AED' },
};

function formatTimeRange(start, end) {
  if (!start) return '';
  if (end === 'Next Day' || end?.toLowerCase?.() === 'next day') return `${start} – Next Day`;
  if (end) return `${start} – ${end}`;
  return start;
}

// ── Components ──────────────────────────────────────────────────────────────────

function SectionHeader({ title, icon, color }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={[styles.sectionAccent, { backgroundColor: color || COLORS.primary }]} />
      {icon && <Ionicons name={icon} size={16} color={color || COLORS.primary} style={{ marginRight: 6 }} />}
      <Text style={[styles.sectionTitle, { color: COLORS.text }]}>{title}</Text>
    </View>
  );
}

function ShimmerBlock({ style }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return <Animated.View style={[styles.skeleton, { opacity }, style]} />;
}

function PanchangSkeleton() {
  return (
    <View style={{ padding: 16, gap: 14 }}>
      <ShimmerBlock style={{ height: 80, borderRadius: 16 }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <ShimmerBlock style={{ flex: 1, height: 80, borderRadius: 16 }} />
        <ShimmerBlock style={{ flex: 1, height: 80, borderRadius: 16 }} />
      </View>
      <ShimmerBlock style={{ height: 60, borderRadius: 16 }} />
      <ShimmerBlock style={{ height: 60, borderRadius: 16 }} />
      <ShimmerBlock style={{ height: 60, borderRadius: 16 }} />
      <ShimmerBlock style={{ height: 80, borderRadius: 16 }} />
      <ShimmerBlock style={{ height: 80, borderRadius: 16 }} />
    </View>
  );
}

function DateHeroCard({ dateObj, panchang, C }) {
  const today = isToday(dateObj);
  const moonPhase = panchang?.moonPhase || '';
  const moonIcon = MOON_PHASES[moonPhase]?.icon || 'moon-outline';
  const moonColor = MOON_PHASES[moonPhase]?.color || C.textSecondary;
  return (
    <View style={[styles.heroCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.heroTop}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeMonth}>{formatDate(dateObj, 'MMM').toUpperCase()}</Text>
          <Text style={styles.dateBadgeDay}>{formatDate(dateObj, 'dd')}</Text>
          <Text style={styles.dateBadgeYear}>{formatDate(dateObj, 'yyyy')}</Text>
        </View>
        <View style={styles.heroInfo}>
          <Text style={[styles.heroWeekday, { color: C.text }]}>{formatDate(dateObj, 'EEEE')}</Text>
          <Text style={[styles.heroFullDate, { color: C.textSecondary }]}>{formatDate(dateObj, 'dd MMMM yyyy')}</Text>
          {moonPhase ? (
            <View style={styles.moonRow}>
              <Ionicons name={moonIcon} size={14} color={moonColor} />
              <Text style={[styles.moonText, { color: moonColor }]}>{moonPhase}</Text>
            </View>
          ) : null}
        </View>
        {today && (
          <View style={styles.todayBadge}>
            <Text style={styles.todayText}>Today</Text>
          </View>
        )}
      </View>
      <View style={[styles.heroMetaRow, { borderTopColor: C.border }]}>
        {panchang?.paksha ? <Text style={[styles.heroMeta, { color: C.textSecondary }]}>{panchang.paksha} Paksha</Text> : null}
        {panchang?.masa ? <Text style={[styles.heroMeta, { color: C.textSecondary }]}>{panchang.masa}</Text> : null}
        {panchang?.samvat ? <Text style={[styles.heroMeta, { color: C.textSecondary }]}>{panchang.samvat}</Text> : null}
        {panchang?.ritu ? <Text style={[styles.heroMeta, { color: C.textSecondary }]}>{panchang.ritu}</Text> : null}
        {panchang?.ayana ? <Text style={[styles.heroMeta, { color: C.textSecondary }]}>{panchang.ayana}</Text> : null}
        {panchang?.moonSign ? <Text style={[styles.heroMeta, { color: C.textSecondary }]}>Moon: {panchang.moonSign}</Text> : null}
        {panchang?.sunSign ? <Text style={[styles.heroMeta, { color: C.textSecondary }]}>Sun: {panchang.sunSign}</Text> : null}
      </View>
    </View>
  );
}

function QuickInfoCard({ icon, label, value, iconColor, C }) {
  if (!value) return null;
  return (
    <View style={[styles.quickCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[styles.quickIconWrap, { backgroundColor: (iconColor || C.primary) + '18' }]}>
        <Ionicons name={icon} size={18} color={iconColor || C.primary} />
      </View>
      <Text style={[styles.quickLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.quickValue, { color: C.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function TimedEntryCard({ name, start, end, color, C }) {
  if (!name) return null;
  return (
    <View style={[styles.timedCard, { backgroundColor: C.surface, borderColor: C.border, borderLeftColor: color || C.primary }]}>
      <Text style={[styles.timedName, { color: C.text }]}>{name}</Text>
      <Text style={[styles.timedRange, { color: C.textSecondary }]}>{formatTimeRange(start, end)}</Text>
    </View>
  );
}

function TimingPeriodCard({ name, start, end, tone }) {
  if (!name || !start) return null;
  const isAuspicious = tone === 'auspicious';
  const bg = isAuspicious ? '#F0FDF4' : '#FEF2F2';
  const border = isAuspicious ? '#BBF7D0' : '#FECACA';
  const iconColor = isAuspicious ? '#16A34A' : '#DC2626';
  const nameColor = isAuspicious ? '#166534' : '#991B1B';
  const timeColor = isAuspicious ? '#16A34A' : '#DC2626';
  return (
    <View style={[styles.timingCard, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.timingRow}>
        <Ionicons name="time-outline" size={16} color={iconColor} />
        <Text style={[styles.timingName, { color: nameColor }]}>{name}</Text>
        {!isAuspicious && (
          <View style={styles.avoidBadge}>
            <Text style={styles.avoidText}>Avoid</Text>
          </View>
        )}
      </View>
      <Text style={[styles.timingRange, { color: timeColor }]}>{formatTimeRange(start, end)}</Text>
    </View>
  );
}

function FestivalCard({ festival, C }) {
  if (!festival) return null;
  return (
    <View style={[styles.festivalCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.festivalTop}>
        <Text style={[styles.festivalName, { color: C.text }]}>{festival.name}</Text>
        {festival.dataType ? (
          <View style={[styles.festivalTypeBadge, { backgroundColor: C.primary + '20' }]}>
            <Text style={[styles.festivalTypeText, { color: C.primary }]}>{festival.dataType}</Text>
          </View>
        ) : null}
      </View>
      {festival.tithiDate ? (
        <Text style={[styles.festivalMeta, { color: C.textSecondary }]}>{festival.tithiDate}</Text>
      ) : null}
      {festival.description ? (
        <Text style={[styles.festivalDesc, { color: C.textSecondary }]} numberOfLines={2}>{festival.description}</Text>
      ) : null}
    </View>
  );
}

function JumpToDateModal({ visible, onClose, onSelect, initialDate }) {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [vy, setVY] = useState(initialDate.getFullYear());
  const [vm, setVM] = useState(initialDate.getMonth());

  const firstDay = new Date(vy, vm, 1).getDay();
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => (i < firstDay ? null : i - firstDay + 1));
  const today = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => (vm === 0 ? (setVM(11), setVY((y) => y - 1)) : setVM((m) => m - 1))}>
              <Ionicons name="chevron-back" size={20} color={C.primary} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: C.text }]}>{monthNames[vm]} {vy}</Text>
            <TouchableOpacity onPress={() => (vm === 11 ? (setVM(0), setVY((y) => y + 1)) : setVM((m) => m + 1))}>
              <Ionicons name="chevron-forward" size={20} color={C.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.calDaysRow}>
            {DAYS.map((d) => (
              <Text key={d} style={[styles.calDayLabel, { color: C.textSecondary }]}>{d}</Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={styles.calCell} />;
              const isT = today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === day;
              return (
                <TouchableOpacity key={i} style={styles.calCell} onPress={() => onSelect(new Date(vy, vm, day))} activeOpacity={0.7}>
                  <Text style={[styles.calDayNum, { color: isT ? C.primary : C.text }]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────────

export default function PanchangScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [panchang, setPanchang] = useState(null);
  const [cachedPanchang, setCachedPanchang] = useState(null);
  const [festivals, setFestivals] = useState([]);
  const [cachedFestivals, setCachedFestivals] = useState([]);
  const [weekPanchang, setWeekPanchang] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState('daily');
  const [pickerVisible, setPickerVisible] = useState(false);

  const fetchDaily = async (d = date) => {
    const ds = toDateStr(d);
    setLoading(true);
    try {
      const [panchRes, festRes] = await Promise.all([
        api.get(`/panchang?date=${ds}`),
        api.get(`/festivals?date=${ds}`),
      ]);
      const p = panchRes.data.panchang || panchRes.data.data || null;
      const f = festRes.data.festivals || [];
      setPanchang(p);
      setCachedPanchang(p);
      setFestivals(f);
      setCachedFestivals(f);
    } catch {
      if (cachedPanchang) {
        setPanchang(cachedPanchang);
        setFestivals(cachedFestivals);
      } else {
        setPanchang(null);
        setFestivals([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchWeekly = async (d = date) => {
    const ds = toDateStr(d);
    setLoading(true);
    try {
      const { data } = await api.get(`/panchang/week?date=${ds}`);
      setWeekPanchang(data.panchang || data.data || []);
    } catch {
      // Keep existing week data on error
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
    if (view === 'daily') fetchDaily(date);
    else fetchWeekly(date);
  };

  // ── Daily View ────────────────────────────────────────────────────────
  const tithiEntries = asItems(panchang?.tithiEntries).length > 0
    ? asItems(panchang?.tithiEntries)
    : (panchang?.tithi ? [{ name: panchang.tithi }] : []);
  const yogaEntries = asItems(panchang?.yogaEntries).length > 0
    ? asItems(panchang?.yogaEntries)
    : (panchang?.yoga ? [{ name: panchang.yoga }] : []);
  const karanaEntries = asItems(panchang?.karanaEntries).length > 0
    ? asItems(panchang?.karanaEntries)
    : (panchang?.karana ? [{ name: panchang.karana }] : []);
  const auspiciousTimings = asItems(panchang?.auspiciousTimings).filter((t) => t?.name && t?.start);
  const inauspiciousTimings = asItems(panchang?.inauspiciousTimings).filter((t) => t?.name && t?.start);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Panchang" showBack={false} />

      <View style={[styles.viewToggleRow, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => setView('daily')}
          style={[styles.toggleBtn, view === 'daily' && { backgroundColor: COLORS.primary }]}
        >
          <Text style={{ color: view === 'daily' ? '#fff' : C.textSecondary, fontSize: 12, fontWeight: '700' }}>Daily</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setView('weekly')}
          style={[styles.toggleBtn, view === 'weekly' && { backgroundColor: COLORS.primary }]}
        >
          <Text style={{ color: view === 'weekly' ? '#fff' : C.textSecondary, fontSize: 12, fontWeight: '700' }}>Weekly</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.dateNav, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => changeDate(view === 'weekly' ? -7 : -1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPickerVisible(true)} style={{ flex: 1, alignItems: 'center' }} activeOpacity={0.7}>
          <Text style={[styles.dateText, { color: C.text }]}>{formatDate(date, 'EEEE, dd MMM yyyy')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeDate(view === 'weekly' ? 7 : 1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {!isToday(date) && (
        <TouchableOpacity style={[styles.jumpTodayRow, { backgroundColor: C.surface, borderBottomColor: C.border }]} onPress={() => { const t = new Date(); setDate(t); if (view === 'daily') fetchDaily(t); else fetchWeekly(t); }} activeOpacity={0.7}>
          <Ionicons name="today-outline" size={16} color={COLORS.primary} />
          <Text style={[styles.jumpTodayText, { color: COLORS.primary }]}>Jump to Today</Text>
        </TouchableOpacity>
      )}

      {loading && !panchang && !weekPanchang.length ? (
        <PanchangSkeleton />
      ) : view === 'daily' ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {panchang ? (
            <>
              {/* ── Hero ────────────────────────────────────────── */}
              <DateHeroCard dateObj={date} panchang={panchang} C={C} />

              {/* ── Quick Info Grid ────────────────────────────── */}
              <View style={styles.quickGrid}>
                <QuickInfoCard icon="sunny" label="Sunrise" value={panchang.sunrise} iconColor="#D97706" C={C} />
                <QuickInfoCard icon="partly-sunny" label="Sunset" value={panchang.sunset} iconColor="#2563EB" C={C} />
              </View>
              <View style={styles.quickGrid}>
                <QuickInfoCard icon="star" label="Nakshatra" value={panchang.nakshatra} iconColor="#7C3AED" C={C} />
                <QuickInfoCard icon="moon-outline" label="Moon Phase" value={panchang.moonPhase} iconColor="#7C3AED" C={C} />
              </View>

              {/* ── Tithi Entries ──────────────────────────────── */}
              {tithiEntries.length > 0 && (
                <View style={styles.sectionBlock}>
                  <SectionHeader title="Tithi" icon="moon" color="#4F46E5" />
                  {tithiEntries.map((e, i) => (
                    <TimedEntryCard key={i} name={e.name} start={e.start} end={e.end} color="#4F46E5" C={C} />
                  ))}
                </View>
              )}

              {/* ── Yoga Entries ───────────────────────────────── */}
              {yogaEntries.length > 0 && (
                <View style={styles.sectionBlock}>
                  <SectionHeader title="Yoga" icon="sparkles" color="#059669" />
                  {yogaEntries.map((e, i) => (
                    <TimedEntryCard key={i} name={e.name} start={e.start} end={e.end} color="#059669" C={C} />
                  ))}
                </View>
              )}

              {/* ── Karana Entries ─────────────────────────────── */}
              {karanaEntries.length > 0 && (
                <View style={styles.sectionBlock}>
                  <SectionHeader title="Karana" icon="triangle" color="#D97706" />
                  {karanaEntries.map((e, i) => (
                    <TimedEntryCard key={i} name={e.name} start={e.start} end={e.end} color="#D97706" C={C} />
                  ))}
                </View>
              )}

              {/* ── Auspicious Timings ─────────────────────────── */}
              {auspiciousTimings.length > 0 && (
                <View style={styles.sectionBlock}>
                  <SectionHeader title="Auspicious Timings" icon="time-outline" color="#16A34A" />
                  {auspiciousTimings.map((t, i) => (
                    <TimingPeriodCard key={i} name={t.name} start={t.start} end={t.end} tone="auspicious" />
                  ))}
                </View>
              )}

              {/* ── Inauspicious Timings ───────────────────────── */}
              {inauspiciousTimings.length > 0 && (
                <View style={styles.sectionBlock}>
                  <SectionHeader title="Inauspicious Timings" icon="warning-outline" color="#DC2626" />
                  {inauspiciousTimings.map((t, i) => (
                    <TimingPeriodCard key={i} name={t.name} start={t.start} end={t.end} tone="inauspicious" />
                  ))}
                </View>
              )}

              {/* ── Festivals ──────────────────────────────────── */}
              {festivals.length > 0 && (
                <View style={styles.sectionBlock}>
                  <SectionHeader title="Festivals" icon="calendar" color={COLORS.primary} />
                  {festivals.map((f) => (
                    <FestivalCard key={f._id || f.name} festival={f} C={C} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={48} color={C.textSecondary} />
              <Text style={[styles.emptyText, { color: C.textSecondary }]}>Panchang temporarily unavailable</Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => fetchDaily(date)}
                activeOpacity={0.8}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {weekPanchang.length > 0 ? (
            weekPanchang.map((p, i) => {
              const weekDate = new Date(date);
              weekDate.setDate(weekDate.getDate() + i);
              return p ? (
                <TouchableOpacity
                  key={i}
                  style={[styles.weekCard, { backgroundColor: C.surface, borderColor: C.border }, isToday(weekDate) && { borderColor: COLORS.primary }]}
                  onPress={() => handleSelectWeekDay(weekDate)}
                  activeOpacity={0.85}
                >
                  <View style={styles.weekCardTop}>
                    <Text style={[styles.weekDate, { color: C.text }]}>{formatDate(weekDate, 'EEE, dd MMM')}</Text>
                    {isToday(weekDate) && (
                      <View style={[styles.weekTodayBadge, { backgroundColor: COLORS.primary + '20' }]}>
                        <Text style={[styles.weekTodayText, { color: COLORS.primary }]}>Today</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.weekRow}>
                    {p.tithi ? (
                      <View style={styles.weekChip}>
                        <Text style={[styles.weekChipLabel, { color: C.textSecondary }]}>Tithi</Text>
                        <Text style={[styles.weekChipValue, { color: C.text }]}>{p.tithi}</Text>
                      </View>
                    ) : null}
                    {p.nakshatra ? (
                      <View style={styles.weekChip}>
                        <Text style={[styles.weekChipLabel, { color: C.textSecondary }]}>Nakshatra</Text>
                        <Text style={[styles.weekChipValue, { color: C.text }]}>{p.nakshatra}</Text>
                      </View>
                    ) : null}
                  </View>
                  {p.rahuKaal?.start ? (
                    <Text style={styles.weekRahu}>Rahu Kaal: {p.rahuKaal.start} – {p.rahuKaal.end}</Text>
                  ) : null}
                  {p.sunrise ? (
                    <Text style={[styles.weekSun, { color: C.textSecondary }]}>Sunrise: {p.sunrise}  Sunset: {p.sunset}</Text>
                  ) : null}
                </TouchableOpacity>
              ) : (
                <View key={i} style={[styles.weekCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <Text style={[styles.emptyText, { color: C.textSecondary }]}>Unavailable</Text>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={48} color={C.textSecondary} />
              <Text style={[styles.emptyText, { color: C.textSecondary }]}>Week data unavailable</Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => fetchWeekly(date)}
                activeOpacity={0.8}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      <JumpToDateModal visible={pickerVisible} initialDate={date} onClose={() => setPickerVisible(false)} onSelect={handleJumpTo} />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  viewToggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },

  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  navBtn: { padding: 8 },
  dateText: { fontSize: 14, fontWeight: '700' },

  jumpTodayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  jumpTodayText: { fontSize: 13, fontWeight: '600' },

  // Hero
  heroCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', ...SHADOW.card },
  heroTop: { flexDirection: 'row', padding: 16, gap: 14, alignItems: 'center' },
  dateBadge: { width: 60, alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 6 },
  dateBadgeMonth: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
  dateBadgeDay: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  dateBadgeYear: { fontSize: 10, fontWeight: '600', color: '#fff', opacity: 0.85 },
  heroInfo: { flex: 1 },
  heroWeekday: { fontSize: 18, fontWeight: '800' },
  heroFullDate: { fontSize: 12, marginTop: 2 },
  moonRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  moonText: { fontSize: 12, fontWeight: '600' },
  todayBadge: { backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  todayText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  heroMeta: { fontSize: 12, fontWeight: '600' },

  // Quick info
  quickGrid: { flexDirection: 'row', gap: 12 },
  quickCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14, alignItems: 'center', gap: 6 },
  quickIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  quickValue: { fontSize: 15, fontWeight: '700' },

  // Sections
  sectionBlock: { gap: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  sectionAccent: { width: 3, height: 18, borderRadius: 2, marginRight: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },

  // Timed entries
  timedCard: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, padding: 14 },
  timedName: { fontSize: 15, fontWeight: '700' },
  timedRange: { fontSize: 12, marginTop: 4, fontWeight: '500' },

  // Timing periods
  timingCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timingName: { fontSize: 14, fontWeight: '700', flex: 1 },
  avoidBadge: { backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  avoidText: { color: '#DC2626', fontSize: 10, fontWeight: '700' },
  timingRange: { fontSize: 13, fontWeight: '600', marginTop: 4, marginLeft: 22 },

  // Festival
  festivalCard: { borderRadius: 16, borderWidth: 1, padding: 14 },
  festivalTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  festivalName: { fontSize: 14, fontWeight: '700', flex: 1 },
  festivalTypeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  festivalTypeText: { fontSize: 10, fontWeight: '700' },
  festivalMeta: { fontSize: 12, marginTop: 4 },
  festivalDesc: { fontSize: 12, marginTop: 4, lineHeight: 17 },

  // Week view
  weekCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  weekCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekDate: { fontSize: 14, fontWeight: '700' },
  weekTodayBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  weekTodayText: { fontSize: 10, fontWeight: '700' },
  weekRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekChip: { gap: 2 },
  weekChipLabel: { fontSize: 10, fontWeight: '600' },
  weekChipValue: { fontSize: 13, fontWeight: '700' },
  weekRahu: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  weekSun: { fontSize: 11 },

  // Empty / Error
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Skeleton
  skeleton: { backgroundColor: '#E5E7EB' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 15, fontWeight: '700' },
  calDaysRow: { flexDirection: 'row' },
  calDayLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  calDayNum: { fontSize: 13, fontWeight: '500' },
});