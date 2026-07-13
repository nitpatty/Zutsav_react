import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import ScreenHeader from '../../components/ScreenHeader';

const WELCOME = { id: 'welcome', role: 'assistant', content: 'Namaste! I am your AI spiritual guide. Ask me anything about Hindu rituals, poojas, festivals, or spiritual guidance.' };

// Same example prompts as the website (frontend/src/pages/AIAssistant.jsx).
const SUGGESTED_PROMPTS = [
  'Which pooja should I do for career growth?',
  'What is the significance of Ekadashi?',
  'Tell me about Rudrabhishek and its benefits',
  'Best muhurat for Griha Pravesh this month',
  'What is Kaal Sarp Dosh and how to remedy it?',
  'Explain the 16 Samskaras in Hinduism',
];

const REVEAL_MS_PER_WORD = 18;

export default function AIAssistantScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const flatRef = useRef(null);
  const revealTimer = useRef(null);

  const [messages,  setMessages]  = useState([WELCOME]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const scrollBottom = () => setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

  useEffect(() => { scrollBottom(); }, [messages.length]);
  useEffect(() => () => { if (revealTimer.current) clearInterval(revealTimer.current); }, []);

  // Reveals `fullText` progressively into the message with id `msgId`, word by
  // word — gives the feel of a streaming reply over the single JSON response
  // the backend actually returns (the backend/website don't truly stream either).
  const revealReply = (msgId, fullText) => {
    const words = fullText.split(' ');
    let count = 0;
    if (revealTimer.current) clearInterval(revealTimer.current);
    revealTimer.current = setInterval(() => {
      count += 1;
      const partial = words.slice(0, count).join(' ');
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: partial } : m)));
      if (count >= words.length) clearInterval(revealTimer.current);
    }, REVEAL_MS_PER_WORD);
  };

  const send = async (text) => {
    if (!text || loading) return;
    setInput('');

    const userMsg = { id: Date.now().toString(), role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const history = updatedMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', text: m.content }))
        .slice(-20);
      const { data } = await api.post('/ai/chat', { history });

      const assistantId = Date.now().toString() + '_r';
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);
      revealReply(assistantId, data.reply || '');
    } catch (err) {
      Toast.show({ type: 'error', text1: 'AI unavailable. Try again.' });
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => send(input.trim());

  const handleNewChat = () => {
    if (revealTimer.current) clearInterval(revealTimer.current);
    setMessages([WELCOME]);
    setInput('');
  };

  const isWelcomeOnly = messages.length === 1 && messages[0].id === 'welcome';

  const renderItem = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble, {
        backgroundColor: isUser ? C.primary : C.surface,
        borderColor: isUser ? 'transparent' : C.border,
        alignSelf: isUser ? 'flex-end' : 'flex-start',
      }]}>
        {!isUser && (
          <View style={[styles.aiAvatar, { backgroundColor: C.primary + '20' }]}>
            <Text style={{ fontSize: 14 }}>🕉</Text>
          </View>
        )}
        <Text style={[styles.bubbleText, { color: isUser ? '#fff' : C.text }]}>{item.content}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={[styles.root, { backgroundColor: C.background }]}>
        <ScreenHeader
          title="AI Spiritual Guide"
          right={
            !isWelcomeOnly ? (
              <TouchableOpacity onPress={handleNewChat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="refresh" size={20} color={C.text} />
              </TouchableOpacity>
            ) : null
          }
        />
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollBottom}
          ListFooterComponent={
            <View>
              {loading && (
                <View style={[styles.bubble, styles.aiBubble, { backgroundColor: C.surface, borderColor: C.border, alignSelf: 'flex-start' }]}>
                  <ActivityIndicator size="small" color={C.primary} />
                </View>
              )}
              {isWelcomeOnly && !loading && (
                <View style={styles.suggestions}>
                  <Text style={[styles.suggestionsTitle, { color: C.textSecondary }]}>Try asking:</Text>
                  {SUGGESTED_PROMPTS.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.suggestionChip, { borderColor: C.border, backgroundColor: C.surface }]}
                      onPress={() => send(p)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.suggestionText, { color: C.text }]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          }
        />
        <View style={[styles.inputRow, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about rituals, poojas, festivals…"
            placeholderTextColor={C.textSecondary}
            multiline
            maxLength={1000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: input.trim() ? C.primary : C.border }]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color={input.trim() ? '#fff' : C.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  bubble: {
    maxWidth: '80%', borderRadius: 18, padding: 12,
    borderWidth: 1, flexDirection: 'row', gap: 8,
  },
  userBubble: { borderBottomRightRadius: 4 },
  aiBubble:   { borderBottomLeftRadius: 4, alignItems: 'flex-start' },
  aiAvatar:   { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  bubbleText: { fontSize: 14, lineHeight: 20, flex: 1 },
  suggestions:      { marginTop: 8, gap: 8 },
  suggestionsTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  suggestionChip:   { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  suggestionText:   { fontSize: 13, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
  },
});
