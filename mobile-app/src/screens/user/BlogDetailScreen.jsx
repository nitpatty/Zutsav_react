import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, RefreshControl, TextInput, Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, timeAgo } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function BlogDetailScreen({ route }) {
  const { slug, blog: blogParam } = route.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [blog,       setBlog]       = useState(blogParam || null);
  const [loading,    setLoading]    = useState(!blogParam);
  const [refreshing, setRefreshing] = useState(false);
  const [comments,   setComments]   = useState([]);
  const [commLoading,setCommLoading]= useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting,    setPosting]    = useState(false);
  const [sharing,    setSharing]    = useState(false);

  const liked      = !!blog?.isLiked;
  const bookmarked = !!blog?.isBookmarked;

  const fetchBlog = async (silent = false) => {
    if (!slug) return;
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/blogs/${slug}`);
      setBlog(data.data || data.blog);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load blog' });
    } finally { setLoading(false); setRefreshing(false); }
  };

  const fetchComments = async () => {
    if (!blog?._id) return;
    try {
      setCommLoading(true);
      const { data } = await api.get(`/blogs/${blog._id}/comments`);
      setComments(data.data || data.comments || []);
    } catch {} finally { setCommLoading(false); }
  };

  useEffect(() => {
    if (!blogParam && slug) fetchBlog();
  }, [slug]);

  useEffect(() => {
    if (blog?._id) fetchComments();
  }, [blog?._id]);

  const handleLike = async () => {
    try {
      const { data } = await api.post(`/blogs/${blog._id}/like`);
      setBlog((prev) => ({ ...prev, isLiked: data.liked, likesCount: data.likesCount }));
    } catch {
      Toast.show({ type: 'error', text1: 'Could not update like' });
    }
  };

  const handleBookmark = async () => {
    try {
      const { data } = await api.post(`/blogs/${blog._id}/bookmark`);
      setBlog((prev) => ({ ...prev, isBookmarked: data.bookmarked }));
      Toast.show({ type: 'success', text1: data.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not update bookmark' });
    }
  };

  const handleShare = async () => {
    try {
      setSharing(true);
      const { data } = await api.post(`/blogs/${blog._id}/share`);
      setBlog((prev) => ({ ...prev, shares: data.shares }));
      await Share.share({ message: `${blog.title}\n${data.shareUrl}`, url: data.shareUrl });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not share this post' });
    } finally {
      setSharing(false);
    }
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    try {
      setPosting(true);
      const { data } = await api.post(`/blogs/${blog._id}/comments`, { content: newComment.trim() });
      setComments((prev) => [data.data || data.comment, ...prev]);
      setNewComment('');
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Comment failed' });
    } finally { setPosting(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!blog) return null;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBlog(true); }} tintColor={C.primary} />}
      >
        {blog.featuredImage ? (
          <Image source={{ uri: imageUrl(blog.featuredImage) }} style={styles.cover} resizeMode="cover" />
        ) : null}

        <View style={{ padding: 20, gap: 12 }}>
          {blog.category && (
            <View style={[styles.catChip, { backgroundColor: C.primary + '15' }]}>
              <Text style={[styles.catText, { color: C.primary }]}>{blog.category?.name}</Text>
            </View>
          )}

          <Text style={[styles.title, { color: C.text }]}>{blog.title}</Text>

          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: C.textSecondary }]}>
              {blog.authorName || 'Zutsav Team'} · {formatDate(blog.publishedAt || blog.createdAt)}
            </Text>
            {blog.readingTime && (
              <Text style={[styles.metaText, { color: C.textSecondary }]}>{blog.readingTime} min read</Text>
            )}
          </View>

          {/* Tags */}
          {blog.tags?.length > 0 && (
            <View style={styles.tags}>
              {blog.tags.map((tag) => (
                <View key={tag} style={[styles.tagChip, { backgroundColor: C.border }]}>
                  <Text style={[styles.tagText, { color: C.textSecondary }]}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Content (plain text rendering) */}
          {blog.content ? (
            <Text style={[styles.content, { color: C.text }]}>{blog.content}</Text>
          ) : null}

          {/* Like / Bookmark / Share */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: liked ? C.primary : C.border, backgroundColor: liked ? C.primary + '15' : 'transparent' }]}
              onPress={handleLike}
              activeOpacity={0.8}
            >
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? C.primary : C.textSecondary} />
              <Text style={[styles.actionBtnText, { color: liked ? C.primary : C.textSecondary }]}>
                {blog.likesCount || 0}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: bookmarked ? C.primary : C.border, backgroundColor: bookmarked ? C.primary + '15' : 'transparent' }]}
              onPress={handleBookmark}
              activeOpacity={0.8}
            >
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? C.primary : C.textSecondary} />
              <Text style={[styles.actionBtnText, { color: bookmarked ? C.primary : C.textSecondary }]}>
                {bookmarked ? 'Saved' : 'Save'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: C.border }]}
              onPress={handleShare}
              disabled={sharing}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={20} color={C.textSecondary} />
              <Text style={[styles.actionBtnText, { color: C.textSecondary }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Comments section */}
        <View style={[styles.commentsSection, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <Text style={[styles.commentsTitle, { color: C.text }]}>Comments ({comments.length})</Text>

          {/* Add comment */}
          <View style={styles.addComment}>
            <TextInput
              style={[styles.commentInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Share your thoughts…"
              placeholderTextColor={C.textSecondary}
              multiline
            />
            <TouchableOpacity
              style={[styles.commentBtn, { backgroundColor: newComment.trim() ? C.primary : '#9CA3AF' }]}
              onPress={handleComment}
              disabled={posting || !newComment.trim()}
              activeOpacity={0.85}
            >
              <Ionicons name={posting ? 'hourglass' : 'send'} size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {commLoading ? <LoadingSpinner /> : (
            comments.map((c) => (
              <View key={c._id} style={[styles.commentCard, { borderBottomColor: C.border }]}>
                <View style={styles.commentTop}>
                  <Text style={[styles.commentAuthor, { color: C.text }]}>
                    {c.authorName || 'Anonymous'}
                  </Text>
                  <Text style={[styles.commentTime, { color: C.textSecondary }]}>{timeAgo(c.createdAt)}</Text>
                </View>
                <Text style={[styles.commentText, { color: C.textSecondary }]}>{c.content}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1 },
  cover:          { width: '100%', height: 240 },
  catChip:        { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  catText:        { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title:          { fontSize: 22, fontWeight: '900', lineHeight: 30 },
  metaRow:        { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  metaText:       { fontSize: 13 },
  tags:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  tagText:        { fontSize: 12 },
  content:        { fontSize: 15, lineHeight: 26 },
  actionsRow:     { flexDirection: 'row', gap: 10 },
  actionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  actionBtnText:  { fontSize: 13, fontWeight: '600' },
  commentsSection:{ padding: 20, gap: 14, borderTopWidth: 1 },
  commentsTitle:  { fontSize: 16, fontWeight: '800' },
  addComment:     { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  commentInput: {
    flex: 1, borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, maxHeight: 80, textAlignVertical: 'top',
  },
  commentBtn:     { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  commentCard:    { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  commentTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commentAuthor:  { fontSize: 14, fontWeight: '700' },
  commentTime:    { fontSize: 11 },
  commentText:    { fontSize: 14, lineHeight: 20 },
});
