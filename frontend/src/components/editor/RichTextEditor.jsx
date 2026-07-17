import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import toast from 'react-hot-toast';
import Toolbar from './Toolbar';
import ResizableImage from './ResizableImageExtension';
import './richTextContent.css';

// Shared TipTap rich text editor used by both the Blog editor and the Pooja
// Management admin form. `onImageUpload` is injected by the caller so each
// module can point inline image uploads at its own backend endpoint without
// duplicating the editor/toolbar/sanitize/CSS stack.
export default function RichTextEditor({
  value,
  onChange,
  onImageUpload,
  placeholder = 'Start writing...',
  minHeight = 400,
  className = '',
  maxSizeMB = 5,
  editable = true,
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      ResizableImage.configure({ inline: false, onImageUpload }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editable,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  // Keep the editor in sync with an externally-changed `value` (e.g. loading
  // a record for editing, or restoring an autosaved draft) without fighting
  // the user's own typing/cursor position.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editable, editor]);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !editor) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > maxSizeMB * 1024 * 1024) { toast.error(`Image must be under ${maxSizeMB}MB`); return; }

    setUploading(true);
    try {
      const url = await onImageUpload(file);
      if (url) editor.chain().focus().setImage({ src: url, width: '70%', align: 'center' }).run();
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  }, [editor, onImageUpload, maxSizeMB]);

  return (
    <div>
      <Toolbar
        editor={editor}
        onImageButtonClick={() => fileInputRef.current?.click()}
        imageUploading={uploading}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <div className={`relative rte-content ${className}`} style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
