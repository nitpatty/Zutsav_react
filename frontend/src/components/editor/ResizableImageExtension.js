import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import ResizableImageNodeView from './ResizableImageNodeView';

// Extends (not replaces) the stock `image` node so existing saved content —
// plain `<img src="...">` with no wrapper — keeps parsing into this same
// node type and rendering exactly as before (see the `img[src]` parseHTML
// rule below). Only images touched by the new controls (resize/align/
// caption) serialize to the richer `<figure data-type="resizable-image">`
// shape; everything else is untouched, satisfying "don't break existing
// editor content."
const ResizableImage = Image.extend({
  name: 'image',
  draggable: true,

  addOptions() {
    return {
      ...this.parent?.(),
      // Injected by RichTextEditor so the NodeView's "Replace Image" control
      // can reuse the caller's own upload endpoint without new wiring.
      onImageUpload: null,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      // `rendered: false` on all three — we place them on the <figure>
      // wrapper ourselves in renderHTML() below, not as raw attributes on
      // the auto-generated HTMLAttributes object (which targets <img>).
      width: {
        default: null,
        rendered: false,
      },
      // 'left' | 'center' | 'right' float the image and wrap body text
      // around it; 'inline' sits at natural size within the flow (no float,
      // no forced full-width) — the classic editor's "None" placement.
      align: {
        default: 'center',
        rendered: false,
      },
      caption: {
        default: '',
        rendered: false,
      },
      // Vertical breathing room around the image: 'tight' | 'normal' | 'loose'.
      spacing: {
        default: 'normal',
        rendered: false,
      },
      // Free-drag nudge away from the image's normal in-flow position —
      // offsetX as a % of the content column's width (so it scales sanely
      // across screen sizes), offsetY in px (clamped small — see
      // ResizableImageNodeView's DRAG_BOUNDS — since an unbounded px nudge
      // would land in a wildly different spot on mobile vs desktop). Zero
      // for both (the default) means "normal document flow", identical to
      // every image before this feature existed.
      offsetX: {
        default: 0,
        rendered: false,
      },
      offsetY: {
        default: 0,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      // New shape: figure > img (+ optional figcaption), written by this extension.
      {
        tag: 'figure[data-type="resizable-image"]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false;
          const img = el.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') || '',
            title: img.getAttribute('title') || '',
            width: el.style.width || el.getAttribute('data-width') || null,
            align: el.getAttribute('data-align') || 'center',
            caption: el.querySelector('figcaption')?.textContent || '',
            spacing: el.getAttribute('data-spacing') || 'normal',
            offsetX: parseFloat(el.getAttribute('data-offset-x')) || 0,
            offsetY: parseFloat(el.getAttribute('data-offset-y')) || 0,
          };
        },
      },
      // Legacy shape: a bare <img>, from content saved before this feature existed.
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false;
          return {
            src: el.getAttribute('src'),
            alt: el.getAttribute('alt') || '',
            title: el.getAttribute('title') || '',
            width: null,
            align: 'center',
            caption: '',
            spacing: 'normal',
            offsetX: 0,
            offsetY: 0,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { width, align, caption, spacing, offsetX, offsetY } = node.attrs;
    const figureAttrs = {
      'data-type': 'resizable-image',
      'data-align': align || 'center',
      'data-spacing': spacing || 'normal',
      class: `rte-image align-${align || 'center'} space-${spacing || 'normal'}`,
    };
    const styleParts = [];
    if (width) styleParts.push(`width:${width}`);
    // A nudge takes the image out of normal in-flow positioning (`relative`
    // reserves its original flow space but visually offsets it, exactly
    // like the editor's live drag preview) and layers it above sibling text.
    if (offsetX) { figureAttrs['data-offset-x'] = offsetX; }
    if (offsetY) { figureAttrs['data-offset-y'] = offsetY; }
    if (offsetX || offsetY) {
      styleParts.push('position:relative', `left:${offsetX || 0}%`, `top:${offsetY || 0}px`, 'z-index:5');
    }
    if (styleParts.length) figureAttrs.style = `${styleParts.join(';')};`;

    const imgAttrs = mergeAttributes(HTMLAttributes);
    const children = [['img', imgAttrs]];
    if (caption) children.push(['figcaption', { class: 'rte-image-caption' }, caption]);

    return ['figure', figureAttrs, ...children];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

export default ResizableImage;
