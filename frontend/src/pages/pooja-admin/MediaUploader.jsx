import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud, X, ChevronLeft, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getImageUrl } from '../../config';

// Multi-image gallery uploader for Pooja.gallery. Each file is uploaded
// immediately via the shared onImageUpload(file) => Promise<url> (the same
// POST /poojas/upload-image used by RichTextEditor/FaqRepeater) — no batch
// endpoint needed, `images` in form state is always just an array of URLs.
export default function MediaUploader({ images, onChange, onImageUpload }) {
  const list = images || [];
  const [dragOver, setDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [replacingIndex, setReplacingIndex] = useState(null);
  const browseInputRef = useRef(null);
  const replaceInputRef = useRef(null);

  const uploadOne = useCallback(async (file) => {
    if (!file.type.startsWith('image/')) { toast.error(`${file.name} is not an image`); return null; }
    if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name} is over 8MB`); return null; }
    try {
      return await onImageUpload(file);
    } catch {
      toast.error(`Failed to upload ${file.name}`);
      return null;
    }
  }, [onImageUpload]);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploadingCount((c) => c + files.length);
    const urls = [];
    for (const file of files) {
      const url = await uploadOne(file);
      if (url) urls.push(url);
    }
    setUploadingCount((c) => Math.max(0, c - files.length));
    if (urls.length) onChange([...(images || []), ...urls]);
  }, [uploadOne, images, onChange]);

  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const startReplace = (i) => { setReplacingIndex(i); replaceInputRef.current?.click(); };
  const handleReplaceChange = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    const idx = replacingIndex;
    setReplacingIndex(null);
    if (!file || idx == null) return;
    setUploadingCount((c) => c + 1);
    const url = await uploadOne(file);
    setUploadingCount((c) => Math.max(0, c - 1));
    if (url) onChange(list.map((u, i) => (i === idx ? url : u)));
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => browseInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-5 cursor-pointer transition-colors text-center ${
          dragOver ? 'border-saffron-400 bg-saffron-50/50' : 'hover:border-saffron-300'
        }`}
        style={{ borderColor: dragOver ? undefined : 'var(--t-border)' }}
      >
        <UploadCloud size={18} className="text-gray-400" />
        <p className="text-xs font-semibold text-gray-600">Drag &amp; drop images here</p>
        <p className="text-[10px] text-gray-400">or click to browse</p>
        <input
          ref={browseInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleReplaceChange}
        />
      </div>

      {uploadingCount > 0 && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-saffron-400 border-t-transparent rounded-full animate-spin" />
          Uploading {uploadingCount} image{uploadingCount > 1 ? 's' : ''}...
        </p>
      )}

      {(list.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {list.map((url, i) => (
            <div key={url + i} className="relative w-16 h-16 rounded-lg overflow-hidden border group shrink-0" style={{ borderColor: 'var(--t-border)' }}>
              <img src={getImageUrl(url)} alt="" className="w-full h-full object-cover" />
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
                <button type="button" onClick={() => startReplace(i)}
                  className="p-0.5 rounded bg-white/90 text-gray-700 hover:bg-white transition-colors" title="Replace">
                  <RefreshCw size={10} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}
                  className="p-0.5 rounded bg-white/90 text-gray-700 hover:bg-white disabled:opacity-30 transition-colors">
                  <ChevronRight size={10} />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => browseInputRef.current?.click()}
            className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-gray-300 hover:text-saffron-500 hover:border-saffron-300 transition-colors shrink-0"
            style={{ borderColor: 'var(--t-border)' }}
          >
            <Plus size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
