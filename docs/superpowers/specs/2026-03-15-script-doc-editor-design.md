# Design Spec: Script Doc Editor

**Date:** 2026-03-15
**Status:** Spec reviewed — blocking issues resolved

---

## Context

Scripts currently display as colored cards (Hook → Body → CTA). Users can inline-edit individual cards, but there is no document-style writing experience. This spec adds a **Google Docs-style "Doc Editor" tab** inside the existing script view that:

- Lets users write and format scripts (bold, italic, font size) in a flowing document
- Color-codes each line by its type (orange = filming, cyan = actor/voiceover, lime = editor, gray = text on screen)
- Changes a line's type by clicking its left color bar → floating type-picker pill with 4 color dots
- Syncs bidirectionally with the existing Card View tab
- Exports to PDF via `window.print()` with a white print stylesheet
- Matches Ocean Surge dark glass aesthetic (no emojis, Lucide icons only)

---

## Confirmed Design Decisions

| Question | Answer |
|----------|--------|
| Layout | Tab Switch — "Card View" / "Doc Editor" in existing script view |
| Type assignment | Click left color bar → floating pill with 4 color dots |
| New line type on Enter | Always neutral gray (text_on_screen) |
| Export | PDF via `window.print()` + print stylesheet |
| Rich text engine | **TipTap** (one instance per line — avoids deprecated `execCommand`) |
| HTML canonical field | `rich_text` is canonical; `text` is always derived by stripping tags |
| HTML sanitization | DOMPurify on load and save |
| Section assignment | Card View only — tooltip in doc editor explains this |

---

## Architecture

### New component: `src/components/ScriptDocEditor.tsx`

A self-contained doc editor (~400 lines):
- Accepts `lines: ScriptLine[]`, `onLinesChange`, `onSave`, `onExportPDF` as props
- Renders each line as a single-line **TipTap** editor instance with a left color bar
- Manages a `dirtyLines` ref (tracks which line indices have unsaved changes)
- Flushes changed lines back via `onLinesChange` on blur

### Integration: `src/pages/Scripts.tsx`

Add a two-tab header above the current card list:
- **Tab 1 — Card View**: existing card/drag-drop UI (unchanged)
- **Tab 2 — Doc Editor**: renders `<ScriptDocEditor>`

Both tabs read from `parsedLines`. Switching **Card View → Doc Editor** re-syncs only if the doc editor has no dirty lines (no unsaved changes). If it has dirty lines, keep doc editor state as-is. Switching **Doc Editor → Card View** always flushes the doc editor's current state first.

### Data model: `supabase/migrations/20260315_script_rich_text.sql`

```sql
ALTER TABLE script_lines ADD COLUMN IF NOT EXISTS rich_text TEXT;
```

- `rich_text` — **canonical** HTML string (`<strong>`, `<em>`, `<u>`) — used by doc editor
- `text` — always derived: `stripHtml(rich_text)` — used by card view, teleprompter, AI, Notion sync

When doc editor saves: `rich_text = sanitize(editor.getHTML())`, `text = stripHtml(rich_text)`.
When doc editor loads: use `rich_text` if present, else use `text` as initial content.

---

## Component: `ScriptDocEditor`

### Props

```ts
interface Props {
  lines: ScriptLine[];
  onLinesChange: (lines: ScriptLine[]) => void;
  scriptTitle: string;
  scriptMeta: string;
  onSave: () => Promise<void>;
  onExportPDF: () => void;
}
```

### State & refs

```ts
const [activeIdx, setActiveIdx] = useState<number | null>(null);
const [showPicker, setShowPicker] = useState(false);
const dirtyLines = useRef<Set<number>>(new Set());
```

### Rich text: TipTap (one editor per line)

Each line uses a TipTap `useEditor` instance configured as single-line (no paragraph nodes — only inline content):

```ts
const editor = useEditor({
  extensions: [
    StarterKit.configure({ paragraph: false, hardBreak: false }),
    Underline,
    TextStyle,
    FontSize,  // @tiptap/extension-font-size
  ],
  content: line.rich_text ? DOMPurify.sanitize(line.rich_text) : line.text,
  onBlur: ({ editor }) => {
    const html = DOMPurify.sanitize(editor.getHTML());
    dirtyLines.current.add(idx);
    onLinesChange(lines.map((l, i) =>
      i === idx ? { ...l, rich_text: html, text: stripHtml(html) } : l
    ));
  },
});
```

### Keyboard handling (explicit, no browser default)

| Key | Action |
|-----|--------|
| `Enter` | Prevent default. Insert new `ScriptLine` after current with `line_type: 'text_on_screen'`, section same as current. Focus new line. |
| `Backspace` at position 0, line not empty | Default (browser handles within the line) |
| `Backspace` at position 0, line **empty** | Remove line. Focus previous line at end. |
| `Cmd/Ctrl+B` | `editor.chain().toggleBold().run()` |
| `Cmd/Ctrl+I` | `editor.chain().toggleItalic().run()` |
| `Cmd/Ctrl+U` | `editor.chain().toggleUnderline().run()` |

### Line rendering

```tsx
<div className="sline {typeClass}" data-idx={idx}>
  {/* Left color bar — click shows type picker */}
  <div
    className="bar"
    onClick={(e) => { e.stopPropagation(); setActiveIdx(idx); setShowPicker(true); }}
  />

  {/* TipTap editor content */}
  <EditorContent editor={editor} className="txt" />

  {/* Floating type picker */}
  {activeIdx === idx && showPicker && (
    <div className="picker">
      <span className="plbl">type</span>
      {TYPE_OPTIONS.map(opt => (
        <div
          key={opt.type}
          className={`pdot ${line.line_type === opt.type ? 'sel' : ''}`}
          style={{ background: opt.color }}
          onClick={() => { handleTypeChange(idx, opt.type); setShowPicker(false); }}
          title={opt.label}
        />
      ))}
      <span className="pname">{currentTypeName}</span>
    </div>
  )}
</div>
```

### Section assignment note

Section headers (Hook / Body / CTA) are non-editable visual dividers. Lines cannot be moved between sections in the doc editor. A tooltip on the color bar picker reads: "To change section, use Card View." This is v1 scope.

### Toolbar

```tsx
<div className="toolbar">
  <FontSizeSelect onChange={size => editor?.chain().setFontSize(size).run()} />
  <ToolbarSep />
  <ToolbarBtn label="B" bold onClick={() => editor?.chain().toggleBold().run()} />
  <ToolbarBtn label="I" italic onClick={() => editor?.chain().toggleItalic().run()} />
  <ToolbarBtn label="U" underline onClick={() => editor?.chain().toggleUnderline().run()} />
  <ToolbarSep />
  <TypeLegend />  {/* 4 color dots + labels, non-interactive */}
  <div style={{ flex: 1 }} />
  <Button variant="glass" onClick={onExportPDF}>
    <DownloadIcon /> PDF
  </Button>
  <Button variant="cta" onClick={onSave}>Save</Button>
</div>
```

### PDF Export

`onExportPDF` in Scripts.tsx calls `window.print()`.

A scoped `<style media="print">` block in `ScriptDocEditor`:
```css
@media print {
  body * { visibility: hidden; }
  .doc-page, .doc-page * { visibility: visible; }
  .doc-page { position: absolute; top: 0; left: 0; width: 100%; }
  .bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .sline { page-break-inside: avoid; }
  .toolbar, .tab-bar { display: none !important; }
  body { background: white !important; }
  .doc-page { background: white !important; border: none !important; box-shadow: none !important; }
}
```

Line text colors are preserved in print (`print-color-adjust: exact`).

---

## `stripHtml` utility

```ts
// src/utils/stripHtml.ts
export const stripHtml = (html: string): string =>
  html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
```

---

## New npm dependencies

```
@tiptap/react
@tiptap/pm
@tiptap/starter-kit
@tiptap/extension-underline
@tiptap/extension-text-style
@tiptap/extension-font-size
dompurify
@types/dompurify
```

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/components/ScriptDocEditor.tsx` | Create (~400 lines) |
| `src/utils/stripHtml.ts` | Create (5 lines) |
| `src/pages/Scripts.tsx` | Add tab state + `<ScriptDocEditor>` render |
| `src/hooks/useScripts.ts` | Add `rich_text?: string` to `ScriptLine` type; save `rich_text` in `directSave` / `replaceAllLines` |
| `supabase/migrations/20260315_script_rich_text.sql` | Create — adds `rich_text` column |
| `package.json` | Add TipTap + DOMPurify dependencies |

---

## Verification

1. Open a script → confirm "Card View" / "Doc Editor" tabs appear
2. Switch to Doc Editor → all lines render with correct colors, sections grouped correctly
3. Edit text in Doc Editor → blur → switch to Card View → confirm changes appear
4. Edit text in Card View → switch to Doc Editor → confirm changes appear (no dirty lines case)
5. Click left color bar → type picker appears → click a dot → line recolors instantly
6. Select text → Cmd+B → text goes bold; Cmd+I → italic; Cmd+U → underline
7. Press Enter at end of a line → new neutral gray line inserted below, cursor focused
8. Press Backspace on empty line → line removed, cursor moves to previous line
9. Click PDF → browser print dialog opens → page shows white background with colored line bars, no toolbar
10. Save → check Supabase `script_lines` table: `rich_text` populated, `text` is plain version
