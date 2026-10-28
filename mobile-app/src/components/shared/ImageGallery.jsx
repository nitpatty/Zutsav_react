import React, { useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, Modal, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTranslation } from '../../i18n';

// Thumbnail strip + full-screen swipeable viewer, built only from core React
// Native (no new dependency). `images` are raw upload paths or absolute URLs.
// An image that fails to load shows a placeholder instead of a blank box, and an
// empty list renders a plain "no images" note — never a fabricated picture.
export default function ImageGallery({ images = [], emptyText }) {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { width, height } = useWindowDimensions();
  const [viewerIndex, setViewerIndex] = useState(null);
  const [failed, setFailed] = useState({});

  const markFailed = (i) => setFailed((f) => ({ ...f, [i]: true }));

  if (!images.length) {
    return (
      <View style={styles.emptyRow}>
        <Ionicons name="image-outline" size={14} color={C.textSecondary} />
        <Text style={{ color: C.textSecondary, fontSize: 12 }}>{emptyText ?? t('gallery.empty')}</Text>
      </View>
    );
  }

  const Placeholder = ({ style }) => (
    <View style={[style, styles.placeholder, { backgroundColor: C.border + '55' }]}>
      <Ionicons name="image-outline" size={28} color={C.textSecondary} />
    </View>
  );

  return (
    <View>
      <FlatList
        data={images}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p, i) => `${p}-${i}`}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onPress={() => setViewerIndex(index)}
            activeOpacity={0.85}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('gallery.openPhoto', { n: index + 1, total: images.length })}
          >
            {failed[index]
              ? <Placeholder style={styles.thumb} />
              : <Image source={{ uri: imageUrl(item) }} style={styles.thumb} resizeMode="cover" onError={() => markFailed(index)} />}
          </TouchableOpacity>
        )}
      />

      <Modal visible={viewerIndex !== null} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        <View style={styles.viewer}>
          {viewerIndex !== null && (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              initialScrollIndex={viewerIndex}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              onMomentumScrollEnd={(e) => setViewerIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              keyExtractor={(p, i) => `full-${p}-${i}`}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item, index }) => (
                <View style={{ width, height, justifyContent: 'center' }}>
                  {failed[index]
                    ? <Placeholder style={{ width, height: width * 0.75 }} />
                    : <Image source={{ uri: imageUrl(item) }} style={{ width, height: height * 0.7 }} resizeMode="contain" onError={() => markFailed(index)} />}
                </View>
              )}
            />
          )}
          <TouchableOpacity style={styles.close} onPress={() => setViewerIndex(null)} accessibilityRole="button" accessibilityLabel={t('gallery.closeViewer')}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {viewerIndex !== null && <Text style={styles.counter}>{viewerIndex + 1} / {images.length}</Text>}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb:       { width: 160, height: 110, borderRadius: 12 },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  emptyRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewer:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  close:       { position: 'absolute', top: 48, right: 20, padding: 8 },
  counter:     { position: 'absolute', bottom: 40, alignSelf: 'center', color: '#fff', fontSize: 14, fontWeight: '600' },
});
