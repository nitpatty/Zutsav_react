import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';

const AUDIENCES = [
  { key: 'user',   label: 'Users' },
  { key: 'pandit', label: 'Pandits' },
  { key: 'all',    label: 'Everyone' },
];

export default function AdminCommunicationScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [audience, setAudience] = useState('user');
  const [title,    setTitle]    = useState('');
  const [message,  setMessage]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [recipientCount, setRecipientCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);

  const fetchCount = useCallback(async (aud) => {
    try {
      setCountLoading(true);
      if (aud === 'all') {
        const [u, p] = await Promise.all([
          api.get('/admin/users', { params: { role: 'user', limit: 1 } }),
          api.get('/admin/users', { params: { role: 'pandit', limit: 1 } }),
        ]);
        setRecipientCount((u.data.total || 0) + (p.data.total || 0));
      } else {
        const { data } = await api.get('/admin/users', { params: { role: aud, limit: 1 } });
        setRecipientCount(data.total || 0);
      }
    } catch {
      setRecipientCount(null);
    } finally {
      setCountLoading(false);
    }
  }, []);

  useEffect(() => { fetchCount(audience); }, [audience]);

  const handleSend = () => {
    if (!title.trim() || !message.trim()) {
      Toast.show({ type: 'error', text1: 'Title and message are required' });
      return;
    }
    Alert.alert(
      'Send Broadcast',
      `Send this message to ${recipientCount != null ? recipientCount : ''} recipient${recipientCount === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', style: 'destructive', onPress: sendBroadcast },
      ]
    );
  };

  const sendBroadcast = async () => {
    try {
      setSending(true);
      const { data } = await api.post('/admin/broadcast', { audience, title: title.trim(), message: message.trim() });
      Toast.show({ type: 'success', text1: `Sent to ${data.sentCount} recipient${data.sentCount === 1 ? '' : 's'}` });
      setTitle('');
      setMessage('');
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not send broadcast' });
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.root, { backgroundColor: C.background }]}>
        <ScreenHeader title="Communication Center" showBack={false} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 32 }}>
          <Text style={[styles.label, { color: C.text }]}>Audience</Text>
          <View style={styles.segmentRow}>
            {AUDIENCES.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.segment, { borderColor: C.border }, audience === a.key && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => setAudience(a.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentText, { color: audience === a.key ? '#fff' : C.text }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.recipientPreview, { color: C.textSecondary }]}>
            {countLoading ? 'Calculating recipients…' : recipientCount != null ? `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}` : ''}
          </Text>

          <Text style={[styles.label, { color: C.text }]}>Title</Text>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Notification title…"
            placeholderTextColor={C.textSecondary}
            maxLength={100}
          />
          <Text style={[styles.counter, { color: C.textSecondary }]}>{title.length}/100</Text>

          <Text style={[styles.label, { color: C.text }]}>Message</Text>
          <TextInput
            style={[styles.textarea, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]}
            value={message}
            onChangeText={setMessage}
            placeholder="Write your message…"
            placeholderTextColor={C.textSecondary}
            multiline
            maxLength={500}
          />
          <Text style={[styles.counter, { color: C.textSecondary }]}>{message.length}/500</Text>

          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: C.primary }, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            disabled={sending}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send Broadcast'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segment: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '700' },
  recipientPreview: { fontSize: 12, marginTop: -8 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14 },
  textarea: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 120, textAlignVertical: 'top' },
  counter: { fontSize: 11, textAlign: 'right', marginTop: -12 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
