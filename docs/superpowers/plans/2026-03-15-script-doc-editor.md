# Script Doc Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google Docs-style "Doc Editor" tab inside the script view that lets users write/format scripts with colored lines by type, synced bidirectionally with the existing Card View tab.

**Architecture:** Tab Switch above the existing card list (Card View | Doc Editor). `parsedLines` in `Scripts.tsx` (line 317) is the single source of truth — both tabs read from and write to it. The Doc Editor conditionally mounts/unmounts on tab switch, so it always re-initializes from the latest `parsedLines`. Each script line renders as a single-line TipTap editor with a clickable left color bar for type selection. `onBlur` flushes each line's HTML back to `parsedLines`.

**Tech Stack:** TipTap v3 (already installed: `@tiptap/react ^3.20.1`, `@tiptap/starter-kit ^3.20.1`), DOMPurify (to install), React, Tailwind CSS, Lucide icons, Supabase.

> **v1 scope note:** `@tiptap/extension-font-size` and the FontSizeSelect toolbar control are **explicitly deferred** from v1. Bold / italic / underline cover the essential formatting needs. Font size can be added in a follow-up iteration once the rest of the editor is proven stable.

> **dirtyLines note:** The spec describes a `dirtyLines` ref to guard against re-syncing unsaved edits when switching tabs. This guard is **not needed** in this plan because the Doc Editor uses conditional rendering (`{scriptEditorTab === "doc" && <ScriptDocEditor />}`), which unmounts and remounts the component on every tab switch. Remounting always re-initializes from the latest `parsedLines`, which already contains any edits flushed via `onBlur`. The net effect is equivalent to "re-sync only if no dirty lines" — it is just achieved via unmount/remount rather than an explicit ref.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add dompurify, @types/dompurify, @tiptap/extension-underline, @tiptap/extension-text-style (FontSize deferred to v2) |
| `supabase/migrations/20260315_script_rich_text.sql` | Create | Add `rich_text TEXT` column to `script_lines` |
| `src/utils/stripHtml.ts` | Create | Strip HTML tags to plain text |
| `src/hooks/useScripts.ts` | Modify | Add `rich_text?` to `ScriptLine` type; include it in `getScriptLines` select and `replaceAllLines` rows |
| `src/pages/Scripts.tsx` | Modify | Inline save button also persists `rich_text`; add tab state + `<ScriptDocEditor>` |
| `src/components/ScriptDocEditor.tsx` | Create | Self-contained doc editor component (~350 lines) |

---

## Chunk 1: Dependencies, Migration, Utilities

### Task 1: Install missing npm packages

**Files:** `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/admin/Desktop/connectacreators
npm install dompurify @types/dompurify @tiptap/extension-underline @tiptap/extension-text-style
```

Expected: Packages install without errors. `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Verify**

```bash
npm ls dompurify @types/dompurify @tiptap/extension-underline @tiptap/extension-text-style
```

Expected: All four packages listed at their installed versions.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add dompurify and tiptap extension-underline, extension-text-style"
```

---

### Task 2: Create DB migration

**Files:** `supabase/migrations/20260315_script_rich_text.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add rich_text column to script_lines for doc editor HTML storage
ALTER TABLE script_lines ADD COLUMN IF NOT EXISTS rich_text TEXT;
```

- [ ] **Step 2: Apply to Supabase**

**Preferred method (Option B)** — Supabase Dashboard SQL Editor: paste the SQL above and run. This project deploys to a cloud-managed Supabase instance, so CLI `db push` may conflict with existing cloud migrations.

Option A (fallback) — Supabase CLI:
```bash
npx supabase db push
```

Expected: No error. Column `rich_text` now exists on `script_lines`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260315_script_rich_text.sql
git commit -m "feat(db): add rich_text column to script_lines"
```

---

### Task 3: Create stripHtml utility

**Files:** `src/utils/stripHtml.ts`

- [ ] **Step 1: Create the file**

```ts
// src/utils/stripHtml.ts
export const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/stripHtml.ts
git commit -m "feat(utils): add stripHtml utility"
```

---

### Task 4: Update ScriptLine type and data layer

**Files:** `src/hooks/useScripts.ts`, `src/pages/Scripts.tsx`

This task updates all places that read/write script lines to handle `rich_text`.

- [ ] **Step 1: Add `rich_text?` to `ScriptLine` type** (`useScripts.ts` lines 5–10)

Change from:
```ts
export type ScriptLine = {
  line_number: number;
  line_type: "filming" | "actor" | "editor" | "text_on_screen";
  section: "hook" | "body" | "cta";
  text: string;
};
```
To:
```ts
export type ScriptLine = {
  line_number: number;
  line_type: "filming" | "actor" | "editor" | "text_on_screen";
  section: "hook" | "body" | "cta";
  text: string;
  rich_text?: string;
};
```

- [ ] **Step 2: Update `getScriptLines` select** (`useScripts.ts` line 384)

Change:
```ts
.select("line_number, line_type, text, section")
```
To:
```ts
.select("line_number, line_type, text, section, rich_text")
```

Also update the `.map()` at lines 391–396 to include `rich_text`:
```ts
return (data || []).map((d: any) => ({
  line_number: d.line_number,
  line_type: d.line_type,
  section: d.section || "body",
  text: d.text,
  rich_text: d.rich_text ?? undefined,
})) as ScriptLine[];
```

- [ ] **Step 3: Update `replaceAllLines` signature and rows** (`useScripts.ts` lines 74 and 81–87)

First, widen the function parameter type at line 74 from:
```ts
const replaceAllLines = async (scriptId: string, lines: { line_type: string; section: string; text: string }[]) => {
```
To:
```ts
const replaceAllLines = async (scriptId: string, lines: { line_type: string; section: string; text: string; rich_text?: string }[]) => {
```

Then change the `rows` mapping from:
```ts
const rows = lines.map((l, i) => ({
  script_id: scriptId,
  line_number: i + 1,
  line_type: l.line_type,
  section: l.section,
  text: l.text,
}));
```
To:
```ts
const rows = lines.map((l, i) => ({
  script_id: scriptId,
  line_number: i + 1,
  line_type: l.line_type,
  section: l.section,
  text: l.text,
  ...(l.rich_text !== undefined ? { rich_text: l.rich_text } : {}),
}));
```

- [ ] **Step 4: Update Card View inline save button** (`Scripts.tsx` lines ~2117–2123)

Find the inline save in the Card View (look for `script_id: viewingScriptId` inside the save `onClick`). Change the rows mapping from:
```ts
const rows = parsedLines.map((l, i) => ({
  script_id: viewingScriptId,
  line_number: i + 1,
  line_type: l.line_type,
  section: l.section,
  text: l.text,
}));
```
To:
```ts
const rows = parsedLines.map((l, i) => ({
  script_id: viewingScriptId,
  line_number: i + 1,
  line_type: l.line_type,
  section: l.section,
  text: l.text,
  ...(l.rich_text !== undefined ? { rich_text: l.rich_text } : {}),
}));
```

- [ ] **Step 5: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: Build succeeds. No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useScripts.ts src/pages/Scripts.tsx
git commit -m "feat(types): add rich_text field to ScriptLine type and persist in save logic"
```

---

## Chunk 2: ScriptDocEditor Component

### Task 5: Create ScriptDocEditor.tsx

**Files:** `src/components/ScriptDocEditor.tsx`

This is the main component (~350 lines). Build it in 4 steps.

- [ ] **Step 1: Create the file with imports, constants, and types**

```tsx
// src/components/ScriptDocEditor.tsx
// Note: FontSize (spec item) is deferred to v2. Bold/italic/underline cover v1 needs.
import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
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
```

- [ ] **Step 2: Add the `ScriptLineEditor` sub-component**

Append to `src/components/ScriptDocEditor.tsx`:

```tsx
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
        class: [
          "outline-none min-h-[1.6em] w-full text-[13px] leading-relaxed",
          "px-3 py-1.5 cursor-text",
          TYPE_TEXT_CLASS[line.line_type],
        ].join(" "),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter(idx);
          return true;
        }
        if (event.key === "Backspace") {
          const { empty, from } = _view.state.selection;
          if (empty && from <= 1 && !_view.state.doc.textContent) {
            event.preventDefault();
            onBackspaceEmpty(idx);
            return true;
          }
        }
        return false;
      },
    },
    onFocus: () => onFocus(idx),
    onBlur: ({ editor: e }) => {
      const html = DOMPurify.sanitize(e.getHTML());
      onBlur(idx, html);
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
          "w-1 flex-shrink-0 rounded-l-sm cursor-pointer transition-all",
          "group-hover:w-1.5",
          isActive ? "w-1.5" : "",
          TYPE_BAR_CLASS[line.line_type],
        ].join(" ")}
        onClick={(e) => onBarClick(e, idx)}
        title="Click to change line type"
      />

      {/* Editor */}
      <EditorContent editor={editor} className="flex-1 min-w-0" />

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
```

- [ ] **Step 3: Add the main `ScriptDocEditor` export**

Append to `src/components/ScriptDocEditor.tsx`:

```tsx
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
```

- [ ] **Step 4: Build to verify TypeScript compiles cleanly**

```bash
npm run build
```

Expected: Build succeeds. No errors. (Warnings about unused vars are OK as long as no errors.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ScriptDocEditor.tsx
git commit -m "feat(editor): add ScriptDocEditor component with TipTap per-line editors and type picker"
```

---

## Chunk 3: Integration into Scripts.tsx

### Task 6: Add tab switcher and ScriptDocEditor to Scripts.tsx

**Files:** `src/pages/Scripts.tsx`

- [ ] **Step 1: Add import at the top of `Scripts.tsx`** (after the existing imports, around line 36):

```tsx
import ScriptDocEditor from "@/components/ScriptDocEditor";
```

- [ ] **Step 2: Add tab state** — after line 317 (`const [parsedLines, setParsedLines] = useState<ScriptLine[]>([]);`), add:

```tsx
const [scriptEditorTab, setScriptEditorTab] = useState<"cards" | "doc">("cards");
const [savingDocEditor, setSavingDocEditor] = useState(false);
```

- [ ] **Step 3: Reset tab when opening a different script**

**Filter rule:** Only add `setScriptEditorTab("cards")` next to `setParsedLines(` calls where a **different script is being opened** (navigation to a new script). Do NOT add it to saves or reloads of the currently-viewed script, and do NOT add it to per-field inline mutations (caption edits, drag-drop reorder, etc.).

Run: `grep -n "setParsedLines(" src/pages/Scripts.tsx`

Look for patterns like `setParsedLines(fresh)` or `setParsedLines(result.lines)` or `setParsedLines(result)` where `fresh`/`result` came from `await getScriptLines(...)`. Add `setScriptEditorTab("cards")` on the line immediately after each such call.

Typical locations (line numbers may shift as you edit — use the grep output, not these numbers as gospel):
- `setParsedLines(fresh)` or `setParsedLines(result.lines)` after navigating to a new script from the client list — **add the reset**.
- `setParsedLines(fresh)` inside the Card View Save button (line ~2132) — **skip**: this is a same-script save/reload, not a navigation. Adding a reset here would bounce the user to Card View every time they save.
- `setParsedLines(fresh)` inside drag-drop reorder (lines ~2201–2215) — **skip**: same script.
- `setParsedLines(parsedLines.map(...))` or any `.map`-on-previous call — **skip**: inline mutation, not a script switch.

Primary criterion: if the fetch is `getScriptLines(someOtherScriptId)` (i.e., an ID different from what was previously open), add the reset. If it's a reload of the same script, skip.

- [ ] **Step 4: Locate the view-script block** (line 1930–1931):

```tsx
{/* ===== VIEW SCRIPT RESULT ===== */}
{view === "view-script" && parsedLines.length > 0 && (
  <div className="space-y-3 animate-fade-in">
```

Find the opening `<div className="space-y-3 animate-fade-in">` and, immediately inside it, add the tab switcher before any existing content:

```tsx
{/* Tab switcher: Card View | Doc Editor */}
<div className="doc-editor-tabs flex items-center border-b border-border">
  <button
    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
      scriptEditorTab === "cards"
        ? "text-[#22d3ee] border-[#0891b2]"
        : "text-muted-foreground border-transparent hover:text-foreground"
    }`}
    onClick={() => setScriptEditorTab("cards")}
  >
    <LayoutGrid className="w-3.5 h-3.5" />
    Card View
  </button>
  <button
    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
      scriptEditorTab === "doc"
        ? "text-[#22d3ee] border-[#0891b2]"
        : "text-muted-foreground border-transparent hover:text-foreground"
    }`}
    onClick={() => setScriptEditorTab("doc")}
  >
    <FileText className="w-3.5 h-3.5" />
    Doc Editor
  </button>
</div>
```

Note: `LayoutGrid` is already imported (line 11). `FileText` is also already imported (line 8).

- [ ] **Step 5: Wrap existing card view content in a conditional**

The existing card content between the tab header and the closing `</div>` of `<div className="space-y-3 animate-fade-in">` (line ~2387) must be wrapped. Use these anchors:

**Start anchor** — immediately after the closing `</div>` of the tab switcher block you added in Step 4, insert:
```tsx
{/* Card View content */}
{scriptEditorTab === "cards" && (
<>
```

**End anchor** — find the comment `{/* Doc Editor */}` that you will add in Step 6. Insert just before it:
```tsx
</>
)}
```

To locate the end precisely: search for `{/* ===== VIEW SCRIPT RESULT ===== */}` in Scripts.tsx, find the outermost `<div className="space-y-3 animate-fade-in">` that follows it, then find its corresponding closing `</div>` (approximately line 2387). Everything between the tab header and that closing div belongs inside the `{scriptEditorTab === "cards" && (<>...</>)}` wrapper — except for the Doc Editor block you add in Step 6.

- [ ] **Step 6: Add ScriptDocEditor below the card view conditional**

After the `{scriptEditorTab === "cards" && ...}` block (still inside `<div className="space-y-3 animate-fade-in">`), add:

```tsx
{/* Doc Editor */}
{scriptEditorTab === "doc" && (
  <ScriptDocEditor
    lines={parsedLines}
    onLinesChange={setParsedLines}
    scriptTitle={viewingMetadata?.idea_ganadora ?? ""}
    scriptMeta={
      [viewingMetadata?.target, viewingMetadata?.formato]
        .filter(Boolean)
        .join(" · ")
    }
    onSave={async () => {
      // Narrow viewingScriptId to string (it is string | null) before use.
      const sid = viewingScriptId;
      if (!sid || savingDocEditor) return;
      setSavingDocEditor(true);
      try {
        await supabase.from("script_lines").delete().eq("script_id", sid);
        const rows = parsedLines.map((l, i) => ({
          script_id: sid,
          line_number: i + 1,
          line_type: l.line_type,
          section: l.section,
          text: l.text,
          ...(l.rich_text !== undefined ? { rich_text: l.rich_text } : {}),
        }));
        if (rows.length > 0) await supabase.from("script_lines").insert(rows);
        const fresh = await getScriptLines(sid);
        setParsedLines(fresh);
        toast.success(tr({ en: "Script saved!", es: "¡Script guardado!" }, language));
      } catch {
        toast.error(tr({ en: "Error saving script", es: "Error al guardar" }, language));
      } finally {
        setSavingDocEditor(false);
      }
    }}
    onExportPDF={() => window.print()}
    saving={savingDocEditor}
  />
)}
```

- [ ] **Step 7: Build to confirm no errors**

```bash
npm run build
```

Expected: Clean build. If there are TypeScript errors, fix them before committing.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): add Doc Editor tab with ScriptDocEditor integration"
```

---

## Verification Checklist

Run through these manually after implementation:

- [ ] Open a script → "Card View" / "Doc Editor" tabs appear above the content
- [ ] Switch to Doc Editor → all lines render with correct colors, sections grouped with dividers
- [ ] Edit text in Doc Editor → blur the line → switch to Card View → card shows updated text
- [ ] Edit a card in Card View → switch to Doc Editor → updated text appears (fresh mount from parsedLines)
- [ ] Click the left color bar → type picker pill appears above the line
- [ ] Click a color dot → line recolors instantly, picker closes
- [ ] Select text + Cmd+B → bold applied; Cmd+I → italic; Cmd+U → underline
- [ ] Press Enter at end of a line → new neutral gray line inserted below with cursor focused
- [ ] Press Backspace on empty line → line removed, cursor moves to previous line
- [ ] Click PDF button → `window.print()` opens browser print dialog with white background
- [ ] Click Save in Doc Editor → lines persisted to Supabase; `rich_text` column populated
- [ ] Open a different script → tab resets to Card View
