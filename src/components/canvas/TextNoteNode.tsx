import { memo, useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { StickyNote, X, Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, Link2 } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import LinkExt from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

interface TextNoteData {
  noteText?: string;
  noteHtml?: string;
  width?: number;
  height?: number;
  scale?: number;
  onUpdate?: (updates: Partial<TextNoteData>) => void;
  onDelete?: () => void;
}

// Toolbar button component
function TBtn({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`nodrag p-1 rounded transition-colors ${active ? "bg-[rgba(8,145,178,0.2)] text-[#22d3ee]" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
    >
      {children}
    </button>
  );
}

const TextNoteNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as TextNoteData;
  const { getZoom, updateNode } = useReactFlow();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUpdate = useCallback((html: string, text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      d.onUpdate?.({ noteText: text, noteHtml: html });
    }, 400);
  }, [d]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      UnderlineExt,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      LinkExt.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Paste brand voice, key messages, target audience info, talking points, context..." }),
    ],
    content: d.noteHtml || d.noteText || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm prose-invert max-w-none focus:outline-none px-3 py-2 text-sm text-foreground leading-relaxed min-h-[120px]",
      },
    },
    onUpdate: ({ editor: e }) => {
      handleUpdate(e.getHTML(), e.getText());
    },
  });

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL:");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const [nodeWidth, setNodeWidth] = useState(d.width || 320);
  const [nodeHeight, setNodeHeight] = useState(d.height || 300);
  const [nodeScale, setNodeScale] = useState(d.scale || 1);
  const widthRef = useRef(nodeWidth);
  widthRef.current = nodeWidth;
  const heightRef = useRef(nodeHeight);
  heightRef.current = nodeHeight;
  const scaleRef = useRef(nodeScale);
  scaleRef.current = nodeScale;

  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number; startScale: number } | null>(null);

  // ── RIGHT HANDLE: change width only, text reflows ──
  const onRightResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zoom = getZoom();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom / scaleRef.current;
      const newW = Math.max(200, Math.min(1200, Math.round(startW + dx)));
      setNodeWidth(newW);
      // Tell React Flow the node width changed so edges stay connected
      updateNode(id, { width: newW * scaleRef.current });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      d.onUpdate?.({ width: widthRef.current });
      updateNode(id, { width: widthRef.current * scaleRef.current });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [d, getZoom, id, updateNode]);

  // ── BOTTOM HANDLE: change height (max editor height) ──
  const onBottomResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zoom = getZoom();
    const startY = e.clientY;
    const startH = heightRef.current;
    const onMove = (ev: MouseEvent) => {
      const dy = (ev.clientY - startY) / zoom / scaleRef.current;
      setNodeHeight(Math.max(100, Math.min(1200, Math.round(startH + dy))));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      d.onUpdate?.({ height: heightRef.current });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [d, getZoom]);

  // ── CORNER HANDLE: scale everything proportionally ──
  const onCornerResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zoom = getZoom();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: widthRef.current, startH: heightRef.current, startScale: scaleRef.current };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = (ev.clientX - resizeRef.current.startX) / zoom;
      const dy = (ev.clientY - resizeRef.current.startY) / zoom;
      const delta = (dx + dy) / 2;
      const newScale = Math.max(0.4, Math.min(3, resizeRef.current.startScale + delta / (resizeRef.current.startW * resizeRef.current.startScale)));
      setNodeScale(newScale);
      // Update React Flow with scaled dimensions so edges track correctly
      updateNode(id, {
        width: resizeRef.current.startW * newScale,
        height: resizeRef.current.startH * newScale,
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      d.onUpdate?.({ scale: scaleRef.current });
      resizeRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [d, getZoom, id, updateNode]);

  const active = selected;

  return (
    <div
      className="glass-card rounded-2xl shadow-xl relative"
      style={{ width: nodeWidth, minWidth: 200, zoom: nodeScale }}
    >
      {/* Content wrapper — clips to rounded corners without clipping Handles */}
      <div className="overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[rgba(14,165,233,0.08)] border-b border-[rgba(14,165,233,0.15)]">
        <div className="flex items-center gap-2">
          <StickyNote className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary/80">Text Info</span>
        </div>
        {d.onDelete && (
          <button onClick={d.onDelete} className="nodrag p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Formatting Toolbar */}
      {editor && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/40 bg-muted/10 flex-wrap nodrag">
          {/* Format dropdown */}
          <select
            value={
              editor.isActive("heading", { level: 1 }) ? "h1"
              : editor.isActive("heading", { level: 2 }) ? "h2"
              : editor.isActive("heading", { level: 3 }) ? "h3"
              : "p"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "p") editor.chain().focus().setParagraph().run();
              else editor.chain().focus().toggleHeading({ level: parseInt(v[1]) as 1 | 2 | 3 }).run();
            }}
            className="nodrag h-6 px-1.5 text-[10px] bg-muted/30 border border-border/50 rounded text-foreground focus:outline-none mr-1"
          >
            <option value="p">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </select>

          <div className="w-px h-4 bg-border/40 mx-1" />

          <TBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <Bold className="w-3 h-3" />
          </TBtn>
          <TBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <Italic className="w-3 h-3" />
          </TBtn>
          <TBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
            <UnderlineIcon className="w-3 h-3" />
          </TBtn>
          <TBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <Strikethrough className="w-3 h-3" />
          </TBtn>

          <div className="w-px h-4 bg-border/40 mx-1" />

          <TBtn active={editor.isActive("link")} onClick={addLink} title="Link">
            <Link2 className="w-3 h-3" />
          </TBtn>

          <div className="w-px h-4 bg-border/40 mx-1" />

          <TBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align Left">
            <AlignLeft className="w-3 h-3" />
          </TBtn>
          <TBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align Center">
            <AlignCenter className="w-3 h-3" />
          </TBtn>
          <TBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align Right">
            <AlignRight className="w-3 h-3" />
          </TBtn>
          <TBtn active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()} title="Justify">
            <AlignJustify className="w-3 h-3" />
          </TBtn>
        </div>
      )}

      {/* Editor Content */}
      <div className="nodrag nowheel overflow-y-auto" style={{ minHeight: 80, maxHeight: nodeHeight }}>
        <EditorContent editor={editor} />
      </div>

      </div>{/* end content wrapper */}

      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />

      {/* RIGHT handle — change width, text reflows */}
      <div
        onMouseDown={onRightResize}
        className="nodrag nopan"
        style={{
          position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)",
          width: 8, height: 40, cursor: "ew-resize", zIndex: 50,
          opacity: active ? 1 : 0, transition: "opacity 0.15s",
        }}
      >
        <div style={{
          position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 24, borderRadius: 2, background: "rgba(34,211,238,0.5)", opacity: 0.6,
        }} />
      </div>

      {/* BOTTOM handle — change height */}
      <div
        onMouseDown={onBottomResize}
        className="nodrag nopan"
        style={{
          position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
          height: 8, width: 40, cursor: "ns-resize", zIndex: 50,
          opacity: active ? 1 : 0, transition: "opacity 0.15s",
        }}
      >
        <div style={{
          position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)",
          height: 3, width: 24, borderRadius: 2, background: "rgba(34,211,238,0.5)", opacity: 0.6,
        }} />
      </div>

      {/* CORNER handle — scale proportionally */}
      <div
        onMouseDown={onCornerResize}
        className="nodrag nopan"
        style={{
          position: "absolute", bottom: -4, right: -4, width: 14, height: 14,
          cursor: "se-resize", zIndex: 51,
          opacity: active ? 1 : 0, transition: "opacity 0.15s",
        }}
      >
        <div style={{
          width: 8, height: 8, borderRight: "2px solid rgba(34,211,238,0.5)", borderBottom: "2px solid rgba(34,211,238,0.5)",
          opacity: 0.6, position: "absolute", bottom: 2, right: 2, borderRadius: "0 0 2px 0",
        }} />
      </div>
    </div>
  );
});

TextNoteNode.displayName = "TextNoteNode";
export default TextNoteNode;
