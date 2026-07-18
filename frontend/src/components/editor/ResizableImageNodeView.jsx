import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import toast from 'react-hot-toast';
import {
  AlignLeft, AlignCenter, AlignRight, WrapText,
  Maximize2, RefreshCw, MessageSquare, Type, Trash2, MoveVertical,
  Move, RotateCcw,
} from 'lucide-react';
import { ToolbarBtn, ToolbarSep } from './Toolbar';
import { getImageUrl } from '../../config';

const SIZE_PRESETS = { small: '30%', medium: '50%', large: '70%' };
const MIN_WIDTH_PX = 150;
const HANDLES = ['nw', 'ne', 'sw', 'se'];
const SPACING_ORDER = ['tight', 'normal', 'loose'];
const SPACING_LABEL = { tight: 'Tight', normal: 'Normal', loose: 'Loose' };
// Free-drag nudge range. offsetX is a % of the container width, offsetY is
// px — kept deliberately small (not an unbounded page-canvas coordinate) so
// a nudge that looks right in the editor doesn't land somewhere nonsensical
// on a narrower reader viewport (mobile).
const MAX_OFFSET_X_PCT = 40;
const MAX_OFFSET_Y_PX = 200;
const clampOffset = (x, y) => ({
  x: Math.max(-MAX_OFFSET_X_PCT, Math.min(MAX_OFFSET_X_PCT, x)),
  y: Math.max(-MAX_OFFSET_Y_PX, Math.min(MAX_OFFSET_Y_PX, y)),
});

// NodeView for the extended `image` node (see ResizableImageExtension.js).
// Positioning is fully custom (mouse-tracked), not native HTML5
// drag-and-drop — the browser's native DnD-inside-contenteditable behavior
// is inconsistent across browsers, and a true "drag anywhere" free position
// (rather than only reordering between blocks) isn't something native PM
// node dragging supports anyway. The image's structural position in the
// document never moves; only its visual offset does — see offsetX/offsetY
// on the extension.
export default function ResizableImageNodeView({ node, updateAttributes, deleteNode, selected, extension }) {
  const { src, alt, width, align, caption, spacing, offsetX, offsetY } = node.attrs;

  const [liveWidthPx, setLiveWidthPx] = useState(null);
  const [resizing, setResizing] = useState(false);
  const [liveOffset, setLiveOffset] = useState(null); // { x, y } during a position drag
  const [dragging, setDragging] = useState(false);
  const [showCaption, setShowCaption] = useState(!!caption);
  const [captionDraft, setCaptionDraft] = useState(caption || '');
  const imgRef = useRef(null);
  const figureRef = useRef(null);
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

  // Free-position drag: converts mouse-pixel movement into a % (x) / px (y)
  // nudge away from the image's normal flow position — see the module-level
  // comment on offsetX/offsetY for why these units and why they're clamped.
  // Live-previewed via local state only; committed once on mouseup, same
  // pattern as startResize above.
  const startPositionDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const container = figureRef.current?.closest('.ProseMirror') || figureRef.current?.parentElement;
    const containerWidth = container?.clientWidth || 800;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseX = offsetX || 0;
    const baseY = offsetY || 0;

    setDragging(true);

    const onMouseMove = (moveEvent) => {
      const dxPct = ((moveEvent.clientX - startX) / containerWidth) * 100;
      const dyPx = moveEvent.clientY - startY;
      setLiveOffset(clampOffset(baseX + dxPct, baseY + dyPx));
    };

    const onMouseUp = (upEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const dxPct = ((upEvent.clientX - startX) / containerWidth) * 100;
      const dyPx = upEvent.clientY - startY;
      const final = clampOffset(baseX + dxPct, baseY + dyPx);
      updateAttributes({ offsetX: Math.round(final.x * 10) / 10, offsetY: Math.round(final.y) });
      setLiveOffset(null);
      setDragging(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [offsetX, offsetY, updateAttributes]);

  const resetPosition = () => updateAttributes({ offsetX: 0, offsetY: 0 });

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
      // Same reasoning as the initial insert in RichTextEditor.jsx — resolve
      // the backend-relative path to an absolute URL before it's embedded.
      if (url) updateAttributes({ src: getImageUrl(url) });
    } catch {
      toast.error('Image upload failed');
    }
  };

  const commitCaption = () => {
    if (captionDraft !== (caption || '')) updateAttributes({ caption: captionDraft });
  };

  const cycleSpacing = () => {
    const idx = SPACING_ORDER.indexOf(spacing || 'normal');
    updateAttributes({ spacing: SPACING_ORDER[(idx + 1) % SPACING_ORDER.length] });
  };

  const effectiveOffset = liveOffset || { x: offsetX || 0, y: offsetY || 0 };
  const hasOffset = effectiveOffset.x !== 0 || effectiveOffset.y !== 0;

  return (
    <NodeViewWrapper
      as="figure"
      ref={figureRef}
      className={`rte-image align-${align || 'center'} space-${spacing || 'normal'} ${selected ? 'is-selected' : ''} ${resizing ? 'is-resizing' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{
        width: liveWidthPx ? `${liveWidthPx}px` : (width || undefined),
        position: hasOffset ? 'relative' : undefined,
        left: hasOffset ? `${effectiveOffset.x}%` : undefined,
        top: hasOffset ? `${effectiveOffset.y}px` : undefined,
        zIndex: hasOffset ? 5 : undefined,
      }}
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
          <div
            className="rte-image-move-handle"
            title="Drag to reposition freely"
            onMouseDown={startPositionDrag}
          >
            <Move size={13} />
          </div>
        )}

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
            <ToolbarBtn title="Inline (flows with text)" active={align === 'inline'} onClick={() => updateAttributes({ align: 'inline' })}>
              <WrapText size={13} />
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
            <ToolbarBtn title="Full width" active={width === '100%'} onClick={() => updateAttributes({ width: '100%', align: 'center' })}>
              <Maximize2 size={13} />
            </ToolbarBtn>
            <ToolbarSep />
            <ToolbarBtn title={`Spacing: ${SPACING_LABEL[spacing || 'normal']} (click to cycle)`} onClick={cycleSpacing}>
              <MoveVertical size={13} />
            </ToolbarBtn>
            {hasOffset && (
              <ToolbarBtn title="Reset to normal position" onClick={resetPosition}>
                <RotateCcw size={13} />
              </ToolbarBtn>
            )}
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
