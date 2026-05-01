// src/components/ScriptDocEditor.tsx
// Note: FontSize (spec item) is deferred to v2. Bold/italic/underline cover v1 needs.
import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import DOMPurify from "dompurify";
import { Download } from "lucide-react";
import type { ScriptLine } from "@/hooks/useScripts";
import { stripHtml } from "@/utils/stripHtml";

type LineType = ScriptLine["line_type"];

const TYPE_OPTIONS: { type: LineType; color: string; label: string }[] = [
  { type: "filming",        color: "#f97316", label: "Filming"        },
  { type: "actor",          color: "#0891b2", label: "Actor"          },
  { type: "editor",         color: "#84cc16", label: "Editor"         },
  { type: "text_on_screen", color: "#475569", label: "Text on Screen" },
];

const TYPE_TEXT_CLASS: Record<LineType, string> = {
  filming:        "text-orange-400",
  actor:          "text-cyan-400",
  editor:         "text-lime-400",
  text_on_screen: "text-slate-400",
};

const TYPE_BAR_CLASS: Record<LineType, string> = {
  filming:        "bg-orange-500",
  actor:          "bg-cyan-600",
  editor:         "bg-lime-500",
  text_on_screen: "bg-slate-500",
};

export interface ScriptDocEditorProps {
  lines: ScriptLine[];
  onLinesChange: (lines: ScriptLine[]) => void;
  scriptTitle: string;
  scriptMeta: string;
  onSave: () => Promise<void>;
  onExportPDF: () => void;
  saving?: boolean;
}

interface LineEditorProps {
  line: ScriptLine;
  idx: number;
  isActive: boolean;
  pickerOpen: boolean;
  onFocus: (idx: number) => void;
  onBlur: (idx: number, html: string) => void;
  onEnter: (idx: number) => void;
  onBackspaceEmpty: (idx: number) => void;
  onBarClick: (e: React.MouseEvent, idx: number) => void;
  onTypeChange: (idx: number, type: LineType) => void;
  registerEditor: (idx: number, editor: Editor | null) => void;
}

function ScriptLineEditor({
  line, idx, isActive, pickerOpen,
  onFocus, onBlur, onEnter, onBackspaceEmpty,
  onBarClick, onTypeChange, registerEditor,
}: LineEditorProps) {
  // Stable refs so TipTap's handleKeyDown (captured at mount) always calls the latest callbacks.
  // Without this, rapid Enter/Backspace presses would operate on a stale `lines` snapshot.
  const onEnterRef = useRef(onEnter);
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);
  const onBackspaceEmptyRef = useRef(onBackspaceEmpty);
  useEffect(() => { onBackspaceEmptyRef.current = onBackspaceEmpty; }, [onBackspaceEmpty]);
  // Same pattern for onBlur — prevents stale `lines` closure when handleBlur is recreated
  const onBlurRef = useRef(onBlur);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);

  const initialContent = line.rich_text
    ? DOMPurify.sanitize(line.rich_text)
    : (line.text || "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        blockquote: false,
        hardBreak: false,
      }),
      Underline,
      TextStyle,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        // Note: text color is NOT set here — it's set on the React wrapper div below so it
        // updates reactively when line_type changes without needing a TipTap remount.
        class: "outline-none min-h-[1.6em] w-full text-[13px] leading-relaxed px-3 py-1.5 cursor-text",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnterRef.current(idx);
          return true;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          const { empty, from } = _view.state.selection;
          const docIsEmpty = !_view.state.doc.textContent.trim();
          // Backspace at start of empty line, or Delete anywhere on empty line → remove line
          const shouldDeleteLine =
            docIsEmpty &&
            (event.key === "Delete" || (event.key === "Backspace" && from <= 1));
          if (empty && shouldDeleteLine) {
            event.preventDefault();
            onBackspaceEmptyRef.current(idx);
            return true;
          }
        }
        return false;
      },
    },
    onFocus: () => onFocus(idx),
    onBlur: ({ editor: e }) => {
      const html = DOMPurify.sanitize(e.getHTML());
      onBlurRef.current(idx, html);
    },
  });

  // Register/unregister editor ref with parent
  useEffect(() => {
    registerEditor(idx, editor);
    return () => registerEditor(idx, null);
  }, [editor, idx, registerEditor]);

  const currentType = TYPE_OPTIONS.find(o => o.type === line.line_type);

  return (
    <div
      className={[
        "relative flex items-stretch mb-0.5 rounded-md group transition-colors",
        isActive ? "bg-cyan-500/[0.04]" : "hover:bg-white/[0.02]",
      ].join(" ")}
    >
      {/* Left color bar */}
      <div
        className={[
          "line-bar w-1 flex-shrink-0 rounded-l-sm cursor-pointer transition-all",
          "group-hover:w-1.5",
          isActive ? "w-1.5" : "",
          TYPE_BAR_CLASS[line.line_type],
        ].join(" ")}
        onClick={(e) => onBarClick(e, idx)}
        title="Click to change line type"
      />

      {/* Editor — wrapper provides reactive text color; color is inherited by .ProseMirror content */}
      <div className={`flex-1 min-w-0 ${TYPE_TEXT_CLASS[line.line_type]}`}>
        <EditorContent editor={editor} />
      </div>

      {/* Floating type picker */}
      {isActive && pickerOpen && (
        <div
          className="absolute left-1.5 bottom-[calc(100%+7px)] z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-cyan-500/20 bg-[#0c1827] shadow-[0_4px_20px_rgba(0,0,0,0.6)] whitespace-nowrap"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-[9px] text-slate-500 mr-0.5">type</span>
          {TYPE_OPTIONS.map((opt) => (
            <div
              key={opt.type}
              className={[
                "w-3.5 h-3.5 rounded-full cursor-pointer transition-transform hover:scale-125",
                line.line_type === opt.type
                  ? "ring-2 ring-white ring-offset-[2px] ring-offset-[#0c1827]"
                  : "",
              ].join(" ")}
              style={{ background: opt.color }}
              title={opt.label}
              onClick={() => onTypeChange(idx, opt.type)}
            />
          ))}
          <div className="w-px h-3 bg-slate-700 mx-0.5" />
          <span className="text-[9px] font-semibold text-cyan-400 tracking-wide">
            {currentType?.label.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

const SECTION_LABEL: Record<string, string> = {
  hook: "Hook",
  body: "Body",
  cta: "CTA",
};

export default function ScriptDocEditor({
  lines,
  onLinesChange,
  scriptTitle,
  scriptMeta,
  onSave,
  onExportPDF,
  saving,
}: ScriptDocEditorProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorMap = useRef<Map<number, Editor>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, []);

  const registerEditor = useCallback((idx: number, editor: Editor | null) => {
    if (editor) editorMap.current.set(idx, editor);
    else editorMap.current.delete(idx);
  }, []);

  const handleFocus = useCallback((idx: number) => {
    setActiveIdx(idx);
  }, []);

  const handleBlur = useCallback((idx: number, html: string) => {
    onLinesChange(
      lines.map((l, i) =>
        i === idx ? { ...l, rich_text: html, text: stripHtml(html) } : l
      )
    );
  }, [lines, onLinesChange]);

  const handleEnter = useCallback((idx: number) => {
    const newLine: ScriptLine = {
      line_number: 0,
      line_type: "text_on_screen",
      section: lines[idx]?.section ?? "body",
      text: "",
      rich_text: "",
    };
    const next = [
      ...lines.slice(0, idx + 1),
      newLine,
      ...lines.slice(idx + 1),
    ];
    onLinesChange(next);
    // 80ms gives React one render cycle + TipTap mount time before we attempt focus.
    // If `newEditor` is still undefined (slow mount), focus silently no-ops — acceptable for v1.
    setTimeout(() => {
      const newEditor = editorMap.current.get(idx + 1);
      if (newEditor) {
        newEditor.commands.focus("start");
        setActiveIdx(idx + 1);
      }
    }, 80);
  }, [lines, onLinesChange]);

  const handleBackspaceEmpty = useCallback((idx: number) => {
    if (lines.length <= 1) return;
    const next = lines.filter((_, i) => i !== idx);
    onLinesChange(next);
    // 80ms — same reasoning as handleEnter above.
    setTimeout(() => {
      const prevIdx = Math.max(0, idx - 1);
      const prevEditor = editorMap.current.get(prevIdx);
      if (prevEditor) {
        prevEditor.commands.focus("end");
        setActiveIdx(prevIdx);
      }
    }, 80);
  }, [lines, onLinesChange]);

  const handleBarClick = useCallback((e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setActiveIdx(idx);
    setPickerOpen((prev) => (activeIdx === idx ? !prev : true));
  }, [activeIdx]);

  const handleTypeChange = useCallback((idx: number, type: LineType) => {
    onLinesChange(lines.map((l, i) => (i === idx ? { ...l, line_type: type } : l)));
    setPickerOpen(false);
  }, [lines, onLinesChange]);

  // Active editor helper for toolbar buttons — wrapped in useCallback to prevent
  // stale closure issues if a future useEffect depends on it.
  const activeEditor = useCallback(
    () => (activeIdx !== null ? editorMap.current.get(activeIdx) ?? null : null),
    [activeIdx]
  );

  // Group lines by section for rendering dividers
  type SectionGroup = { section: string; items: { line: ScriptLine; idx: number }[] };
  const sectionGroups: SectionGroup[] = [];
  lines.forEach((line, idx) => {
    const last = sectionGroups[sectionGroups.length - 1];
    if (!last || last.section !== line.section) {
      sectionGroups.push({ section: line.section, items: [] });
    }
    sectionGroups[sectionGroups.length - 1].items.push({ line, idx });
  });

  return (
    <div ref={containerRef} className="flex flex-col">
      {/* Print stylesheet */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .doc-print-area, .doc-print-area * { visibility: visible; }
          .doc-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 40px; }
          .doc-editor-toolbar { display: none !important; }
          body { background: white !important; }
          .doc-print-area {
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            color: #1e293b !important;
          }
          .line-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .sline-row { page-break-inside: avoid; }
        }
      `}</style>

      {/* Formatting toolbar */}
      <div className="doc-editor-toolbar flex items-center gap-1 px-4 py-1.5 bg-[#060a0e]/90 backdrop-blur-xl border-b border-cyan-500/[0.08] flex-wrap">
        {/* Bold */}
        <button
          className="px-2 py-1 rounded text-[12px] font-bold text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            activeEditor()?.chain().focus().toggleBold().run();
          }}
          title="Bold (Cmd+B)"
        >
          B
        </button>

        {/* Italic */}
        <button
          className="px-2 py-1 rounded text-[12px] italic text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            activeEditor()?.chain().focus().toggleItalic().run();
          }}
          title="Italic (Cmd+I)"
        >
          I
        </button>

        {/* Underline */}
        <button
          className="px-2 py-1 rounded text-[12px] underline text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            activeEditor()?.chain().focus().toggleUnderline().run();
          }}
          title="Underline (Cmd+U)"
        >
          U
        </button>

        <div className="w-px h-4 bg-cyan-500/[0.08] mx-1" />

        {/* Type legend */}
        <div className="flex items-center gap-3 ml-1">
          <span className="text-[9px] text-slate-600">Line type:</span>
          {TYPE_OPTIONS.map((opt) => (
            <span key={opt.type} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                style={{ background: opt.color }}
              />
              <span className="text-[9px] text-slate-500">{opt.label}</span>
            </span>
          ))}
        </div>

        <div className="flex-1" />

        {/* PDF button */}
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-cyan-400 border border-cyan-500/25 bg-cyan-500/[0.07] hover:bg-cyan-500/[0.14] transition-colors"
          onClick={onExportPDF}
        >
          <Download className="w-3 h-3" />
          PDF
        </button>

        {/* Save button */}
        <button
          className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-gradient-to-r from-[#0891b2] to-[#84cc16] hover:opacity-90 transition-opacity disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Document page */}
      <div className="px-4 py-6 bg-[#06090c]">
        <div className="doc-print-area max-w-[660px] mx-auto bg-[#0d1117]/75 backdrop-blur-xl border border-cyan-500/[0.12] rounded-2xl px-10 py-10 shadow-[0_0_60px_rgba(8,145,178,0.05),0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="text-xl font-bold text-slate-200 mb-1">{scriptTitle || "Untitled Script"}</div>
          <div className="text-[11px] text-slate-500 mb-7">{scriptMeta}</div>

          {sectionGroups.map(({ section, items }) => (
            <div key={section}>
              {/* Section divider */}
              <div className="flex items-center gap-2.5 my-5">
                <div className="flex-1 h-px bg-cyan-500/[0.12]" />
                <span className="text-[9px] font-bold tracking-[3px] text-slate-600 uppercase">
                  {SECTION_LABEL[section] ?? section}
                </span>
                <div className="flex-1 h-px bg-cyan-500/[0.12]" />
              </div>

              {items.map(({ line, idx }) => (
                <div key={idx} className="sline-row">
                  <ScriptLineEditor
                    line={line}
                    idx={idx}
                    isActive={activeIdx === idx}
                    pickerOpen={pickerOpen && activeIdx === idx}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onEnter={handleEnter}
                    onBackspaceEmpty={handleBackspaceEmpty}
                    onBarClick={handleBarClick}
                    onTypeChange={handleTypeChange}
                    registerEditor={registerEditor}
                  />
                </div>
              ))}
            </div>
          ))}

          {/* Tooltip: section assignment is Card View only */}
          <p className="mt-8 text-[10px] text-slate-700 italic">
            To move a line between Hook / Body / CTA sections, use Card View.
          </p>
        </div>
      </div>
    </div>
  );
}
