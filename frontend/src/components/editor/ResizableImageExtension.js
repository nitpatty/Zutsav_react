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
      align: {
        default: 'center',
        rendered: false,
      },
      caption: {
        default: '',
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
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { width, align, caption } = node.attrs;
    const figureAttrs = {
      'data-type': 'resizable-image',
      'data-align': align || 'center',
      class: `rte-image align-${align || 'center'}`,
    };
    if (width) figureAttrs.style = `width:${width};`;

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
