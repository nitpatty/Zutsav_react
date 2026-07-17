import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getImageUrl } from '../../config';

// Single-image dropzone for Kit.image (a single string field, uploadKits.single('image'))
// — deliberately not a reuse of ProductMediaUploader, which is gallery/array-shaped.
// Works with one pending File; in edit mode falls back to the kit's already-saved
// image until a new file is chosen (matching the update route's replace-on-upload behavior).
// A persisted currentImage has no "delete" affordance — the backend only ever
// replaces the image on new upload, it has no way to unset it to empty.
export default function KitImageUploader({ currentImage, file, onFileChange }) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error(`${f.name} is not an image`); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is over 5MB`); return; }
    onFileChange(f);
  };

  const displayUrl = preview || (!file && currentImage ? getImageUrl(currentImage) : null);

  if (displayUrl) {
    return (
      <div>
        <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'var(--t-border)' }}>
          <img src={displayUrl} alt="" className="w-full h-32 object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-white text-gray-800 text-xs font-semibold hover:bg-gray-100 transition-colors flex items-center gap-1.5">
              <RefreshCw size={12} /> Replace
            </button>
            {file && (
              <button type="button" onClick={() => onFileChange(null)}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors flex items-center gap-1.5">
                <X size={12} /> Undo
              </button>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {!file && currentImage && (
          <p className="text-[11px] text-gray-400 mt-1.5">Uploading a new image replaces this one.</p>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-colors text-center ${
        dragOver ? 'border-saffron-400 bg-saffron-50/50' : 'hover:border-saffron-300'
      }`}
      style={{ borderColor: dragOver ? undefined : 'var(--t-border)' }}
    >
      <UploadCloud size={20} className="text-saffron-500" />
      <p className="text-sm">
        <span className="text-saffron-600 font-semibold">Click to upload</span>
        <span className="text-gray-500"> or drag &amp; drop</span>
      </p>
      <p className="text-xs text-gray-400">PNG, JPG, WEBP (Max 5MB)</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
