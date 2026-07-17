import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import toast from 'react-hot-toast';
import {
  AlignLeft, AlignCenter, AlignRight, Maximize2,
  RefreshCw, MessageSquare, Type, Trash2,
} from 'lucide-react';
import { ToolbarBtn, ToolbarSep } from './Toolbar';

const SIZE_PRESETS = { small: '30%', medium: '50%', large: '70%' };
const MIN_WIDTH_PX = 150;
const HANDLES = ['nw', 'ne', 'sw', 'se'];

// NodeView for the extended `image` node (see ResizableImageExtension.js).
// `data-drag-handle` + the node's `draggable: true` is TipTap's own
// documented mechanism for repositioning a node via native HTML5 drag —
// ProseMirror's NodeView.onDragStart looks for the nearest
// `[data-drag-handle]` ancestor of the drag target and turns it into a
// NodeSelection move, so no custom drag-and-drop code is needed here.
export default function ResizableImageNodeView({ node, updateAttributes, deleteNode, selected, extension }) {
  const { src, alt, width, align, caption } = node.attrs;

  const [liveWidthPx, setLiveWidthPx] = useState(null);
  const [resizing, setResizing] = useState(false);
  const [showCaption, setShowCaption] = useState(!!caption);
  const [captionDraft, setCaptionDraft] = useState(caption || '');
  const imgRef = useRef(null);
  const replaceInputRef = useRef(null);

  useEffect(() => { setCaptionDraft(caption || ''); }, [caption]);
  useEffect(() => { if (caption) setShowCaption(true); }, [caption]);

  // Only ever adjusts width; height is never set (stays `auto` on the <img>
  // via CSS), which is what keeps the aspect ratio locked and prevents
  // stretching no matter which corner is dragged. Live preview is local
  // React state only — updateAttributes() is called once on mouseup so a
  // drag doesn't spam the undo stack with a history step per pixel.
  const startResize = useCallback((side) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const imgEl = imgRef.current;
    if (!imgEl) return;
    const container = imgEl.closest('.ProseMirror') || imgEl.parentElement;
    const containerWidth = container?.clientWidth || 800;
    const startWidthPx = imgEl.getBoundingClientRect().width;
    const startX = e.clientX;
    const sign = (side === 'nw' || side === 'sw') ? -1 : 1;
    const clamp = (px) => Math.max(MIN_WIDTH_PX, Math.min(px, containerWidth));

    setResizing(true);

    const onMouseMove = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) * sign;
      setLiveWidthPx(clamp(startWidthPx + delta));
    };

    const onMouseUp = (upEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const delta = (upEvent.clientX - startX) * sign;
      const finalPx = clamp(startWidthPx + delta);
      const pct = Math.min(100, Math.round((finalPx / containerWidth) * 1000) / 10);
      updateAttributes({ width: `${pct}%` });
      setLiveWidthPx(null);
      setResizing(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateAttributes]);

  const handleAltText = () => {
    const next = window.prompt('Alt text for this image', alt || '');
    if (next !== null) updateAttributes({ alt: next });
  };

  const handleReplaceFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    const uploadFn = extension.options.onImageUpload;
    if (!uploadFn) return;
    try {
      const url = await uploadFn(file);
      if (url) updateAttributes({ src: url });
    } catch {
      toast.error('Image upload failed');
    }
  };

  const commitCaption = () => {
    if (captionDraft !== (caption || '')) updateAttributes({ caption: captionDraft });
  };

  return (
    <NodeViewWrapper
      as="figure"
      className={`rte-image align-${align || 'center'} ${selected ? 'is-selected' : ''} ${resizing ? 'is-resizing' : ''}`}
      style={{ width: liveWidthPx ? `${liveWidthPx}px` : (width || undefined) }}
      draggable
      data-drag-handle
      contentEditable={false}
    >
      <div className="rte-image-inner">
        <img ref={imgRef} src={src} alt={alt || ''} draggable={false} />

        {selected && HANDLES.map((side) => (
          <div
            key={side}
            className={`rte-resize-handle rte-resize-handle-${side}`}
            onMouseDown={startResize(side)}
          />
        ))}

        {selected && (
          <div className="rte-image-toolbar" onMouseDown={(e) => e.stopPropagation()}>
            <ToolbarBtn title="Align left" active={align === 'left'} onClick={() => updateAttributes({ align: 'left' })}>
              <AlignLeft size={13} />
            </ToolbarBtn>
            <ToolbarBtn title="Align center" active={align === 'center'} onClick={() => updateAttributes({ align: 'center' })}>
              <AlignCenter size={13} />
            </ToolbarBtn>
            <ToolbarBtn title="Align right" active={align === 'right'} onClick={() => updateAttributes({ align: 'right' })}>
              <AlignRight size={13} />
            </ToolbarBtn>
            <ToolbarSep />
            <ToolbarBtn title="Small" active={width === SIZE_PRESETS.small} onClick={() => updateAttributes({ width: SIZE_PRESETS.small })}>
              <span className="text-[10px] font-black">S</span>
            </ToolbarBtn>
            <ToolbarBtn title="Medium" active={width === SIZE_PRESETS.medium} onClick={() => updateAttributes({ width: SIZE_PRESETS.medium })}>
              <span className="text-[10px] font-black">M</span>
            </ToolbarBtn>
            <ToolbarBtn title="Large" active={width === SIZE_PRESETS.large} onClick={() => updateAttributes({ width: SIZE_PRESETS.large })}>
              <span className="text-[10px] font-black">L</span>
            </ToolbarBtn>
            <ToolbarBtn title="Full width" active={width === '100%'} onClick={() => updateAttributes({ width: '100%' })}>
              <Maximize2 size={13} />
            </ToolbarBtn>
            <ToolbarSep />
            <ToolbarBtn title="Replace image" onClick={() => replaceInputRef.current?.click()}>
              <RefreshCw size={13} />
            </ToolbarBtn>
            <ToolbarBtn title="Caption" active={showCaption} onClick={() => setShowCaption((s) => !s)}>
              <MessageSquare size={13} />
            </ToolbarBtn>
            <ToolbarBtn title="Alt text" onClick={handleAltText}>
              <Type size={13} />
            </ToolbarBtn>
            <ToolbarSep />
            <ToolbarBtn title="Remove image" onClick={() => deleteNode()}>
              <Trash2 size={13} />
            </ToolbarBtn>
          </div>
        )}

        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleReplaceFile}
        />
      </div>

      {(showCaption || caption) && (
        <input
          type="text"
          className="rte-image-caption-input"
          placeholder="Add a caption..."
          value={captionDraft}
          draggable={false}
          onChange={(e) => setCaptionDraft(e.target.value)}
          onBlur={commitCaption}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      )}
    </NodeViewWrapper>
  );
}
