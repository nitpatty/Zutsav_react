import React from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Quote, Code2, Minus, Link2, Upload, Undo2, Redo2,
} from 'lucide-react';

export function ToolbarBtn({ onClick, title, active, disabled, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all select-none
        ${active
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  );
}

export function ToolbarSep() {
  return <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />;
}

export default function Toolbar({ editor, onImageButtonClick, imageUploading }) {
  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL (https://...)', prev || '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-sm mb-4 sticky z-30"
      style={{ top: '57px' }}
    >
      {/* Format */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)" active={editor.isActive('bold')}>
        <Bold size={13} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)" active={editor.isActive('italic')}>
        <Italic size={13} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)" active={editor.isActive('underline')}>
        <Underline size={13} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough" active={editor.isActive('strike')}>
        <Strikethrough size={13} />
      </ToolbarBtn>

      <ToolbarSep />

      {/* Headings */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2" active={editor.isActive('heading', { level: 2 })}>
        <span className="text-xs font-black leading-none">H2</span>
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3" active={editor.isActive('heading', { level: 3 })}>
        <span className="text-xs font-black leading-none">H3</span>
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().setParagraph().run()} title="Paragraph" active={editor.isActive('paragraph')}>
        <span className="text-xs font-black leading-none">P</span>
      </ToolbarBtn>

      <ToolbarSep />

      {/* Lists */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list" active={editor.isActive('bulletList')}>
        <List size={14} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list" active={editor.isActive('orderedList')}>
        <ListOrdered size={14} />
      </ToolbarBtn>

      {/* Blockquote */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote" active={editor.isActive('blockquote')}>
        <Quote size={14} />
      </ToolbarBtn>

      {/* Code block */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block" active={editor.isActive('codeBlock')}>
        <Code2 size={14} />
      </ToolbarBtn>

      {/* Horizontal rule */}
      <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
        <Minus size={14} />
      </ToolbarBtn>

      <ToolbarSep />

      {/* Link */}
      <ToolbarBtn onClick={setLink} title="Insert link" active={editor.isActive('link')}>
        <Link2 size={14} />
      </ToolbarBtn>

      {/* Image */}
      <ToolbarBtn onClick={onImageButtonClick} title="Insert image" disabled={imageUploading}>
        {imageUploading
          ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          : <Upload size={13} />}
      </ToolbarBtn>

      <ToolbarSep />

      {/* Undo / Redo */}
      <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)" disabled={!editor.can().undo()}>
        <Undo2 size={14} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)" disabled={!editor.can().redo()}>
        <Redo2 size={14} />
      </ToolbarBtn>
    </div>
  );
}
