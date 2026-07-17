import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, X, RefreshCw, GripVertical, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getImageUrl } from '../../config';

const MAX_SIZE = 8 * 1024 * 1024;
const validate = (file) => {
  if (!file.type.startsWith('image/')) { toast.error(`${file.name} is not an image`); return false; }
  if (file.size > MAX_SIZE) { toast.error(`${file.name} is over 8MB`); return false; }
  return true;
};

// Temple cover image (single) + gallery (existing URLs, reorderable/removable
// via native drag-and-drop, plus newly-added pending files) uploader.
// Existing gallery images are preserved individually (not wholesale-replaced)
// — updateTemple sends the kept order back as `existingImages` and appends
// any new files, per temple.controller.js's incremental-merge behaviour.
export default function TempleImageUploader({
  coverUrl, coverFile, onCoverFileChange, onCoverClear,
  existingImages, onExistingImagesChange,
  newImages, onNewImagesChange,
  maxGallery = 8,
}) {
  const coverInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const dragIndexRef = useRef(null);
  const [newPreviews, setNewPreviews] = useState([]);
  const [coverPreview, setCoverPreview] = useState(null);

  useEffect(() => {
    const urls = newImages.map((f) => URL.createObjectURL(f));
    setNewPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [newImages]);

  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const totalGallery = existingImages.length + newImages.length;

  const addNewFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(validate);
    if (!incoming.length) return;
    if (totalGallery + incoming.length > maxGallery) {
      toast.error(`Up to ${maxGallery} gallery images allowed`);
      onNewImagesChange([...newImages, ...incoming.slice(0, Math.max(0, maxGallery - totalGallery))]);
      return;
    }
    onNewImagesChange([...newImages, ...incoming]);
  };

  const handleCoverPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !validate(file)) return;
    onCoverFileChange(file);
  };

  const removeExisting = (i) => onExistingImagesChange(existingImages.filter((_, idx) => idx !== i));
  const removeNew = (i) => onNewImagesChange(newImages.filter((_, idx) => idx !== i));

  const handleDragStart = (i) => { dragIndexRef.current = i; };
  const handleDrop = (i) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from === null || from === i) return;
    const next = [...existingImages];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    onExistingImagesChange(next);
  };

  return (
    <div className="space-y-6">
      {/* Cover image */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Cover Image</p>
        <div className="flex items-center gap-3">
          <div className="relative w-24 h-24 rounded-xl overflow-hidden border shrink-0" style={{ borderColor: 'var(--t-border)' }}>
            {coverPreview || coverUrl ? (
              <img src={coverPreview || getImageUrl(coverUrl)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl bg-saffron-50">🛕</div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => coverInputRef.current?.click()}
              className="text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-saffron-50 transition-colors" style={{ borderColor: 'var(--t-border)' }}>
              <RefreshCw size={12} /> {coverUrl || coverFile ? 'Replace' : 'Upload'}
            </button>
            {(coverUrl || coverFile) && (
              <button type="button" onClick={() => { onCoverClear(); }}
                className="text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors">
                <X size={12} /> Remove
              </button>
            )}
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverPick} />
          </div>
        </div>
      </div>

      {/* Gallery */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Gallery Images ({totalGallery}/{maxGallery})</p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addNewFiles(e.dataTransfer.files); }}
          onClick={() => galleryInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-5 cursor-pointer transition-colors text-center hover:border-saffron-300"
          style={{ borderColor: 'var(--t-border)' }}
        >
          <UploadCloud size={18} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-600">Drag &amp; drop images or click to browse</p>
          <p className="text-[10px] text-gray-400">JPG, PNG, WEBP — max 8MB each</p>
          <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { addNewFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {(existingImages.length > 0 || newImages.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {existingImages.map((url, i) => (
              <div key={url + i} draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                className="relative w-16 h-16 rounded-lg overflow-hidden border group shrink-0 cursor-grab active:cursor-grabbing"
                style={{ borderColor: 'var(--t-border)' }}
              >
                <img src={getImageUrl(url)} alt="" className="w-full h-full object-cover" />
                <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/90 text-gray-500 flex items-center justify-center">
                  <GripVertical size={10} />
                </span>
                <button type="button" onClick={() => removeExisting(i)} title="Delete"
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white/90 text-red-500 flex items-center justify-center hover:bg-white transition-colors">
                  <X size={10} />
                </button>
              </div>
            ))}
            {newImages.map((file, i) => (
              <div key={file.name + i} className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-saffron-300 group shrink-0">
                {newPreviews[i] && <img src={newPreviews[i]} alt="" className="w-full h-full object-cover" />}
                <span className="absolute bottom-0 inset-x-0 bg-saffron-500 text-white text-[8px] font-semibold text-center py-0.5">NEW</span>
                <button type="button" onClick={() => removeNew(i)} title="Delete"
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white/90 text-red-500 flex items-center justify-center hover:bg-white transition-colors">
                  <X size={10} />
                </button>
              </div>
            ))}
            {totalGallery < maxGallery && (
              <button type="button" onClick={() => galleryInputRef.current?.click()}
                className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-gray-300 hover:text-saffron-500 hover:border-saffron-300 transition-colors shrink-0"
                style={{ borderColor: 'var(--t-border)' }}>
                <Plus size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
