import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import Field from '../../components/shared/FormField';

export default function PanditBlogEditorScreen({ route }) {
  const { blog } = route.params || {};
  const isEditing = Boolean(blog?._id);
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [loadingCats, setLoadingCats] = useState(true);
  const [categories, setCategories] = useState([]);
  const [title,    setTitle]    = useState(blog?.title || '');
  const [content,  setContent]  = useState(blog?.content || '');
  const [categoryId, setCategoryId] = useState(blog?.category?._id || blog?.category || null);
  const [tags,      setTags]    = useState((blog?.tags || []).join(', '));
  const [featuredImage, setFeaturedImage] = useState(blog?.featuredImage || '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get('/blogs/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => {})
      .finally(() => setLoadingCats(false));
  }, []);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: 'Gallery permission denied' }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      setUploadingImage(true);
      const form = new FormData();
      form.append('image', { uri: asset.uri, type: 'image/jpeg', name: 'featured.jpg' });
      const { data } = await api.post('/blogs/upload-image', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFeaturedImage(data.url);
    } catch {
      Toast.show({ type: 'error', text1: 'Image upload failed' });
    } finally { setUploadingImage(false); }
  };

  const save = async (action) => {
    if (!title.trim()) { Toast.show({ type: 'error', text1: 'Title is required' }); return; }
    if (!content.trim()) { Toast.show({ type: 'error', text1: 'Content is required' }); return; }
    try {
      setSaving(true);
      const body = {
        title: title.trim(),
        content: content.trim(),
        category: categoryId || undefined,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        featuredImage: featuredImage || undefined,
        action,
      };
      if (isEditing) {
        await api.put(`/blogs/${blog._id}`, body);
      } else {
        await api.post('/blogs', body);
      }
      Toast.show({ type: 'success', text1: action === 'submit' ? 'Submitted for review' : 'Saved as draft' });
      navigation.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Save failed' });
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    Alert.alert('Delete Blog', 'This will permanently delete this blog. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          setDeleting(true);
          await api.delete(`/blogs/${blog._id}`);
          Toast.show({ type: 'success', text1: 'Blog deleted' });
          navigation.goBack();
        } catch (err) {
          Toast.show({ type: 'error', text1: err.response?.data?.message || 'Delete failed' });
        } finally { setDeleting(false); }
      } },
    ]);
  };

  if (loadingCats) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={isEditing ? 'Edit Blog' : 'Write Blog'} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={uploadingImage} activeOpacity={0.85}>
          {featuredImage ? (
            <Image source={{ uri: imageUrl(featuredImage) }} style={styles.imagePreview} />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name={uploadingImage ? 'hourglass-outline' : 'image-outline'} size={28} color={C.textSecondary} />
              <Text style={[styles.imagePlaceholderText, { color: C.textSecondary }]}>{uploadingImage ? 'Uploading…' : 'Add Featured Image'}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Field label="Title" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={title} onChangeText={setTitle} placeholder="Blog title…" placeholderTextColor={C.textSecondary} maxLength={200} />
        </Field>

        <Field label="Category" C={C}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c._id}
                style={[styles.pill, { borderColor: C.border }, categoryId === c._id && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => setCategoryId(categoryId === c._id ? null : c._id)}
              >
                <Text style={{ color: categoryId === c._id ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{c.icon ? `${c.icon} ` : ''}{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Field>

        <Field label="Tags (comma separated)" C={C}>
          <TextInput style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface }]} value={tags} onChangeText={setTags} placeholder="e.g. pooja, vedic, festival" placeholderTextColor={C.textSecondary} />
        </Field>

        <Field label="Content" C={C}>
          <TextInput
            style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface, height: 220, textAlignVertical: 'top' }]}
            value={content}
            onChangeText={setContent}
            placeholder="Write your blog content here…"
            placeholderTextColor={C.textSecondary}
            multiline
          />
        </Field>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: C.border }]} onPress={() => save(undefined)} disabled={saving}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{saving ? 'Saving…' : 'Save as Draft'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primary }]} onPress={() => save('submit')} disabled={saving} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>{saving ? 'Submitting…' : 'Submit for Review'}</Text>
          </TouchableOpacity>
        </View>

        {isEditing && (
          <TouchableOpacity style={[styles.deleteBtn, { borderColor: '#DC262640' }]} onPress={handleDelete} disabled={deleting}>
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>{deleting ? 'Deleting…' : 'Delete Blog'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  root:       { flex: 1 },
  imagePicker: { borderRadius: 16, overflow: 'hidden' },
  imagePreview: { width: '100%', height: 160 },
  imagePlaceholder: { width: '100%', height: 160, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 6 },
  imagePlaceholderText: { fontSize: 12, fontWeight: '600' },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pill:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  outlineBtn: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtn:    { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 13,
  },
});
