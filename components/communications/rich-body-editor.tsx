"use client";

/**
 * RICH BODY EDITOR — the compact TipTap surface for the Broadcast Composer.
 *
 * ⚠️ WEBPACK-HANG RULE (critical, do not break): EVERY `@tiptap/*` import lives
 * in THIS ONE "use client" leaf. The composer loads it ONLY through
 * `next/dynamic(() => import(...), { ssr:false })`, so the whole @tiptap graph
 * never enters a server-render path (the documented cold-compile hang guard).
 * Never import this file from a server component or a shared module.
 */

import { useCallback, useEffect, useRef } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { TextAlign } from "@tiptap/extension-text-align";
import {
  Undo2,
  Redo2,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Heading2,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
} from "lucide-react";

export interface RichBodyValue {
  html: string;
  text: string;
}

export interface RichBodyEditorProps {
  /** Seed HTML (draft resume or an AI-composed block). */
  initialHtml: string;
  /**
   * Bump this number to FORCE the editor to reseed to the current `initialHtml`
   * (used when the AI assistant replaces / appends the body). A stable key means
   * the editor is left alone so the user's typing is never clobbered.
   */
  seedKey?: number;
  onChange?: (value: RichBodyValue) => void;
  onReady?: (api: { getHtml: () => string; getText: () => string }) => void;
}

function ToolButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rbe-btn${active ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="rbe-sep" aria-hidden />;
}

export function RichBodyEditor({
  initialHtml,
  seedKey = 0,
  onChange,
  onReady,
}: RichBodyEditorProps) {
  const lastSeedKey = useRef<number>(seedKey);

  const editor = useEditor({
    immediatelyRender: false, // required for Next SSR
    extensions: [
      StarterKit.configure({ underline: false, link: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "rbe-prose",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Broadcast message body",
      },
    },
    onUpdate: ({ editor: ed }) => onChange?.({ html: ed.getHTML(), text: ed.getText() }),
  });

  // Reseed ONLY when seedKey changes (AI insert/replace or draft (re)load).
  useEffect(() => {
    if (!editor) return;
    if (lastSeedKey.current === seedKey) return;
    lastSeedKey.current = seedKey;
    editor.commands.setContent(initialHtml || "<p></p>", { emitUpdate: true });
  }, [editor, seedKey, initialHtml]);

  // Expose stable getters + emit the initial value once ready.
  useEffect(() => {
    if (!editor) return;
    onReady?.({ getHtml: () => editor.getHTML(), getText: () => editor.getText() });
    onChange?.({ html: editor.getHTML(), text: editor.getText() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      return {
        bold: ed.isActive("bold"),
        italic: ed.isActive("italic"),
        underline: ed.isActive("underline"),
        heading: ed.isActive("heading", { level: 2 }),
        bulletList: ed.isActive("bulletList"),
        orderedList: ed.isActive("orderedList"),
        blockquote: ed.isActive("blockquote"),
        link: ed.isActive("link"),
        alignLeft: ed.isActive({ textAlign: "left" }),
        alignCenter: ed.isActive({ textAlign: "center" }),
        alignRight: ed.isActive({ textAlign: "right" }),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
      };
    },
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = (editor.getAttributes("link").href as string) ?? "";
    const url = window.prompt("Link URL", prev);
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  return (
    <div className="rbe-root">
      <style>{RBE_CSS}</style>
      <div className="rbe-toolbar" role="toolbar" aria-label="Formatting">
        <ToolButton
          label="Undo (Ctrl+Z)"
          disabled={!state?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </ToolButton>
        <ToolButton
          label="Redo (Ctrl+Y)"
          disabled={!state?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </ToolButton>
        <Sep />
        <ToolButton
          label="Bold (Ctrl+B)"
          active={state?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <BoldIcon size={16} />
        </ToolButton>
        <ToolButton
          label="Italic (Ctrl+I)"
          active={state?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon size={16} />
        </ToolButton>
        <ToolButton
          label="Underline (Ctrl+U)"
          active={state?.underline}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} />
        </ToolButton>
        <ToolButton
          label="Heading"
          active={state?.heading}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} />
        </ToolButton>
        <Sep />
        <ToolButton label="Insert link (Ctrl+K)" active={state?.link} onClick={setLink}>
          <LinkIcon size={16} />
        </ToolButton>
        <ToolButton
          label="Bullet list"
          active={state?.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={state?.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolButton>
        <ToolButton
          label="Quote"
          active={state?.blockquote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} />
        </ToolButton>
        <Sep />
        <ToolButton
          label="Align left"
          active={state?.alignLeft}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft size={16} />
        </ToolButton>
        <ToolButton
          label="Align centre"
          active={state?.alignCenter}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter size={16} />
        </ToolButton>
        <ToolButton
          label="Align right"
          active={state?.alignRight}
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight size={16} />
        </ToolButton>
        <Sep />
        <ToolButton
          label="Clear formatting"
          onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormatting size={16} />
        </ToolButton>
      </div>
      <EditorContent editor={editor} className="rbe-editor" />
    </div>
  );
}

export default RichBodyEditor;

const RBE_CSS = `
.rbe-root{
  --rbe-red:var(--color-altus-red,#E10600);
  --rbe-line:rgba(15,23,42,.12);
  border:1px solid var(--rbe-line);border-radius:16px;overflow:hidden;
  background:#fff;
  box-shadow:0 1px 2px rgba(15,23,42,.04),0 12px 30px -24px rgba(15,23,42,.4);
}
.rbe-toolbar{
  display:flex;flex-wrap:wrap;align-items:center;gap:2px;
  padding:8px 10px;border-bottom:1px solid var(--rbe-line);
  background:color-mix(in srgb,var(--rbe-red) 3%,#fff);
}
.rbe-btn{
  display:inline-flex;align-items:center;justify-content:center;
  width:32px;height:32px;border-radius:9px;
  border:1px solid transparent;background:transparent;color:#374151;
  cursor:pointer;transition:background .12s ease,color .12s ease,box-shadow .12s ease;
}
.rbe-btn:hover:not(:disabled){background:rgba(15,23,42,.06);color:#111114;}
.rbe-btn:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px color-mix(in srgb,var(--rbe-red) 55%,transparent);}
.rbe-btn.is-active{
  background:color-mix(in srgb,var(--rbe-red) 12%,transparent);
  color:var(--rbe-red);border-color:color-mix(in srgb,var(--rbe-red) 26%,transparent);
}
.rbe-btn:disabled{opacity:.38;cursor:default;}
.rbe-sep{width:1px;height:20px;margin:0 5px;background:var(--rbe-line);}
.rbe-editor{padding:18px 20px;}
.rbe-prose{outline:none;min-height:220px;font-size:15px;line-height:1.6;color:#1f2430;}
.rbe-prose:focus{outline:none;}
.rbe-prose p{margin:0 0 12px;}
.rbe-prose p:last-child{margin-bottom:0;}
.rbe-prose h2{font-size:20px;line-height:1.3;margin:0 0 10px;font-weight:800;letter-spacing:-.01em;}
.rbe-prose ul,.rbe-prose ol{margin:0 0 12px;padding-left:24px;}
.rbe-prose li{margin:0 0 4px;}
.rbe-prose blockquote{margin:0 0 12px;padding-left:14px;border-left:3px solid color-mix(in srgb,var(--rbe-red) 55%,transparent);color:#4b5563;}
.rbe-prose a{color:var(--rbe-red);text-decoration:underline;}
`;
