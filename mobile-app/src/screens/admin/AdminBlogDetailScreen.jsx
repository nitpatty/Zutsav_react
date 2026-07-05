import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDateTime, blogStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import ScreenHeader from '../../components/ScreenHeader';

export default function AdminBlogDetailScreen({ route }) {
  const { blog: initialBlog } = route.params || {};
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [blog,   setBlog]   = useState(initialBlog);
  const [acting, setActing] = useState(false);
  const [rejectModal,  setRejectModal]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const act = async (fn, successMsg) => {
    try {
      setActing(true);
      const result = await fn();
      if (result?.blog) setBlog(result.blog);
      Toast.show({ type: 'success', text1: successMsg });
      return true;
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Action failed' });
      return false;
    } finally {
      setActing(false);
    }
  };

  const handleApprove = () => act(async () => {
    const { data } = await api.patch(`/admin/blogs/${blog._id}/approve`);
    return data;
  }, 'Blog approved');

  const handleReject = async () => {
    if (rejectReason.trim().length < 5) {
      Toast.show({ type: 'error', text1: 'Reason must be at least 5 characters' });
      return;
    }
    const ok = await act(async () => {
      const { data } = await api.patch(`/admin/blogs/${blog._id}/reject`, { reason: rejectReason.trim() });
      return data;
    }, 'Blog rejected');
    if (ok) { setRejectModal(false); setRejectReason(''); navigation.goBack(); }
  };

  const handleFeatureToggle = () => act(async () => {
    const { data } = await api.patch(`/admin/blogs/${blog._id}/feature`, { isFeatured: !blog.isFeatured });
    return data;
  }, blog.isFeatured ? 'Unfeatured' : 'Featured');

  const handleArchive = () => {
    Alert.alert('Archive Blog', 'Archive this blog? It will no longer be publicly visible.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => {
        const ok = await act(async () => {
          const { data } = await api.patch(`/admin/blogs/${blog._id}/archive`);
          return data;
        }, 'Blog archived');
        if (ok) navigation.goBack();
      } },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Blog', 'Permanently delete this blog? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const ok = await act(async () => {
          await api.delete(`/admin/blogs/${blog._id}`);
          return {};
        }, 'Blog deleted');
        if (ok) navigation.goBack();
      } },
    ]);
  };

  if (!blog) return null;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Blog Detail" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {blog.featuredImage ? (
          <Image source={{ uri: imageUrl(blog.featuredImage) }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: C.primary + '15' }]}>
            <Ionicons name="newspaper-outline" size={32} color={C.primary} />
          </View>
        )}

        <View style={styles.row}>
          <StatusBadge status={blog.status} colorMap={blogStatusColor} />
          {blog.category?.name && (
            <View style={[styles.catChip, { backgroundColor: C.primary + '15' }]}>
              <Text style={[styles.catText, { color: C.primary }]}>{blog.category.name}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { color: C.text }]}>{blog.title}</Text>

        <InfoCard title="Author" C={C}>
          <Row l="Name" v={blog.authorName || '—'} C={C} />
          <Row l="Role" v={blog.authorRole || '—'} C={C} />
        </InfoCard>

        {blog.excerpt ? (
          <InfoCard title="Excerpt" C={C}>
            <Text style={[styles.excerpt, { color: C.textSecondary }]}>{blog.excerpt}</Text>
          </InfoCard>
        ) : null}

        {(blog.tags || []).length > 0 && (
          <View style={styles.tagsRow}>
            {blog.tags.map((tag) => (
              <View key={tag} style={[styles.tagChip, { backgroundColor: C.background, borderColor: C.border }]}>
                <Text style={[styles.tagText, { color: C.textSecondary }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <InfoCard title="Stats" C={C}>
          <Row l="Views" v={String(blog.views || 0)} C={C} />
          <Row l="Likes" v={String(blog.likesCount || 0)} C={C} />
          <Row l="Comments" v={String(blog.commentsCount || 0)} C={C} />
          <Row l="Shares" v={String(blog.shares || 0)} C={C} />
        </InfoCard>

        {blog.reviewerName ? (
          <InfoCard title="Review Trail" C={C}>
            <Row l="Reviewed By" v={blog.reviewerName} C={C} />
            {blog.reviewedAt ? <Row l="Reviewed At" v={formatDateTime(blog.reviewedAt)} C={C} /> : null}
            {blog.rejectionReason ? <Row l="Rejection Reason" v={blog.rejectionReason} C={C} /> : null}
          </InfoCard>
        ) : null}

        {blog.status === 'pending_review' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#16A34A', flex: 1 }]} onPress={handleApprove} disabled={acting} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>{acting ? 'Please wait…' : 'Approve'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DC2626', flex: 1 }]} onPress={() => setRejectModal(true)} disabled={acting} activeOpacity={0.85}>
              <Ionicons name="close-circle" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}

        {blog.status === 'published' && (
          <>
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: C.border }]} onPress={handleFeatureToggle} disabled={acting} activeOpacity={0.85}>
              <Ionicons name={blog.isFeatured ? 'star' : 'star-outline'} size={18} color={C.text} />
              <Text style={{ color: C.text, fontWeight: '700' }}>{blog.isFeatured ? 'Unfeature' : 'Feature'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DC2626' }]} onPress={() => setRejectModal(true)} disabled={acting} activeOpacity={0.85}>
              <Ionicons name="close-circle" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Reject / Unpublish</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: C.border }]} onPress={handleArchive} disabled={acting} activeOpacity={0.85}>
              <Ionicons name="archive-outline" size={18} color={C.text} />
              <Text style={{ color: C.text, fontWeight: '700' }}>Archive</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#7F1D1D' }]} onPress={handleDelete} disabled={acting} activeOpacity={0.85}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>Delete Blog</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Reject Blog</Text>
            <TextInput
              style={[styles.reasonInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Reason for rejection (min 5 characters, shown to author)…"
              placeholderTextColor={C.textSecondary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: C.border }]} onPress={() => setRejectModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: '#DC2626' }]} onPress={handleReject} disabled={acting}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{acting ? 'Please wait…' : 'Confirm Reject'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoCard({ title, children, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.cardTitle, { color: C.text }]}>{title}</Text>
      <View style={{ gap: 6, marginTop: 6 }}>{children}</View>
    </View>
  );
}

function Row({ l, v, C }) {
  return (
    <View style={styles.rowItem}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{l}</Text>
      <Text style={[styles.rowVal, { color: C.text }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1 },
  cover: { width: '100%', height: 180, borderRadius: 16 },
  coverPlaceholder: { width: '100%', height: 180, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catChip:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catText:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  card:         { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  cardTitle:    { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowItem:      { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:     { fontSize: 13, flex: 1 },
  rowVal:       { fontSize: 13, fontWeight: '600', flex: 1.4, textAlign: 'right' },
  excerpt:      { fontSize: 13, lineHeight: 20 },
  tagsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  tagText:      { fontSize: 11, fontWeight: '600' },
  actionRow:    { flexDirection: 'row', gap: 12 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay:  { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 32, gap: 14,
  },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  reasonInput:   { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  modalBtns:     { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  modalConfirmBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
