import React, { useRef, useState, useCallback, useEffect } from 'react';
import { UploadCloud, X, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getImageUrl } from '../../config';

// Product image gallery uploader. Unlike Pooja's MediaUploader (which
// uploads each file immediately via a dedicated per-image endpoint), the
// Marketplace product create/update routes only accept raw multipart files
// directly on the create/update request itself (uploadProducts.array('images', 5))
// — there is no standalone "upload one image, get a URL back" endpoint, and
// per the brief none may be added. The update endpoint also replaces the
// ENTIRE images array whenever any new file is uploaded — it cannot merge
// individual adds/removes against already-stored images.
//
// So this component works purely with pending File objects (never uploads
// until the surrounding form is actually submitted), and — in edit mode —
// separately renders the product's already-saved images as a read-only
// strip so the admin can see what's live without being misled into thinking
// they can selectively edit it here.
export default function ProductMediaUploader({ currentImages, files: list = [], onFilesChange, maxFiles = 5 }) {
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    const urls = list.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [list]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name} is not an image`); return false; }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is over 5MB`); return false; }
      return true;
    });
    if (!incoming.length) return;
    const combined = [...list, ...incoming];
    if (combined.length > maxFiles) {
      toast.error(`Up to ${maxFiles} images allowed`);
      onFilesChange(combined.slice(0, maxFiles));
      return;
    }
    onFilesChange(combined);
  }, [list, onFilesChange, maxFiles]);

  const remove = (i) => onFilesChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onFilesChange(next);
  };

  return (
    <div className="space-y-4">
      {currentImages && currentImages.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Current Images</p>
          <p className="text-[11px] text-gray-400 mb-2">Uploading new images below replaces this entire gallery when you save.</p>
          <div className="flex flex-wrap gap-2">
            {currentImages.map((url, i) => (
              <div key={url + i} className="w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--t-border)' }}>
                <img src={getImageUrl(url)} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">
          {currentImages?.length > 0 ? 'Upload New Images (replaces gallery)' : `Upload Images (up to ${maxFiles})`}
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-colors text-center ${
            dragOver ? 'border-saffron-400 bg-saffron-50/50' : 'hover:border-saffron-300'
          }`}
          style={{ borderColor: dragOver ? undefined : 'var(--t-border)' }}
        >
          <UploadCloud size={22} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-600">Drag &amp; drop images here or click to upload</p>
          <p className="text-xs text-gray-400">Supports JPG, PNG, WEBP (Max 5MB each)</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.map((file, i) => (
            <div key={file.name + i} className="relative w-16 h-16 rounded-lg overflow-hidden border group shrink-0" style={{ borderColor: 'var(--t-border)' }}>
              {previews[i] && <img src={previews[i]} alt="" className="w-full h-full object-cover" />}
              <button
                type="button"
                onClick={() => remove(i)}
                title="Delete"
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white/90 text-red-500 flex items-center justify-center hover:bg-white transition-colors"
              >
                <X size={10} />
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 py-0.5">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="p-0.5 rounded bg-white/90 text-gray-700 hover:bg-white disabled:opacity-30 transition-colors">
                  <ChevronLeft size={10} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}
                  className="p-0.5 rounded bg-white/90 text-gray-700 hover:bg-white disabled:opacity-30 transition-colors">
                  <ChevronRight size={10} />
                </button>
              </div>
            </div>
          ))}
          {list.length < maxFiles && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-gray-300 hover:text-saffron-500 hover:border-saffron-300 transition-colors shrink-0"
              style={{ borderColor: 'var(--t-border)' }}
            >
              <Plus size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
