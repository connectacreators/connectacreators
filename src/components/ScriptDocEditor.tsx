// src/components/ScriptDocEditor.tsx
// Block-model editor: renders one ordered stream of heading + content blocks.
// Every block carries an in-memory `uid` used as the stable React key (NEVER the
// array index) — this is the structural fix for the duplicate-line bug.
// Note: FontSize (spec item) is deferred to v2. Bold/italic/underline cover v1 needs.
import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import DOMPurify from "dompurify";
import { Download, Plus, Trash2, GripVertical, Type as TypeIcon, Heading, Sun } from "lucide-react";
import { toast } from "sonner";
import { RegenerateHookDialog } from "@/components/RegenerateHookDialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ScriptLine } from "@/hooks/useScripts";
import { stripHtml } from "@/utils/stripHtml";
import { newBlockUid, defaultSectionLabel, reorderBlocksOnDrag } from "@/lib/scriptBlocks";
import { TYPE_TEXT_CLASS, TYPE_BAR_CLASS } from "@/lib/scriptLineTypes";
import { UndoHistory } from "@/lib/undoHistory";

// Plain text → safe HTML, preserving newlines as <br> (used when splitting/merging
// blocks so multi-line content keeps its line breaks).
function plainToHtml(s: string): string {
  if (!s) return "";
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\r?\n/g, "<br>");
}

type LineType = ScriptLine["line_type"];

// Editorial-dark line types — colors match Scripts.tsx card-view config.
const TYPE_OPTIONS: { type: LineType; color: string; label: string }[] = [
  { type: "filming",        color: "#A85B1F",                  label: "Filming"        },
  { type: "actor",          color: "hsl(var(--aqua))",                  label: "Actor"          },
  { type: "editor",         color: "#7FB58A",                  label: "Editor"         },
  { type: "text_on_screen", color: "hsl(var(--bone) / 0.55)",   label: "Text on Screen" },
];

// TYPE_TEXT_CLASS / TYPE_BAR_CLASS are imported from "@/lib/scriptLineTypes"
// (shared with the public read-only view so colors never drift).

// ---------------------------------------------------------------------------
// Slash menu — opens when a content line contains exactly "/". Lets the user
// pick a line type, convert to plain text, or turn the line into a new section.
// ---------------------------------------------------------------------------
type SlashAction =
  | { kind: "type"; type: LineType; label: string; color: string }
  | { kind: "text-line"; label: string }
  | { kind: "new-section"; label: string };

const SLASH_ACTIONS: SlashAction[] = [
  ...TYPE_OPTIONS.map((o) => ({ kind: "type" as const, type: o.type, label: o.label, color: o.color })),
  { kind: "text-line", label: "Text line" },
  { kind: "new-section", label: "New section" },
];

interface SlashMenuProps {
  active: number;
  onChoose: (action: SlashAction) => void;
  onHover: (index: number) => void;
}

function SlashMenu({ active, onChoose, onHover }: SlashMenuProps) {
  return (
    <div
      className="absolute left-1.5 top-[calc(100%+4px)] z-40 w-[200px] py-1 rounded-lg border border-[hsl(var(--bone) / 0.18)] bg-[hsl(var(--graphite))] shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
      // Don't steal focus from the editor so typing/Escape keep flowing.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-2.5 pt-1 pb-1 text-[9px] tracking-wide text-[hsl(var(--bone) / 0.40)]">
        Insert
      </div>
      {SLASH_ACTIONS.map((action, i) => (
        <button
          key={action.kind === "type" ? action.type : action.kind}
          type="button"
          className={[
            "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors",
            i === active
              ? "bg-[hsl(var(--bone) / 0.08)] text-[hsl(var(--cream))]"
              : "text-[hsl(var(--bone) / 0.70)] hover:bg-[hsl(var(--bone) / 0.05)]",
          ].join(" ")}
          onMouseEnter={() => onHover(i)}
          onClick={() => onChoose(action)}
        >
          {action.kind === "type" ? (
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: action.color }} />
          ) : action.kind === "new-section" ? (
            <Heading className="w-3 h-3 flex-shrink-0 text-[hsl(var(--bone) / 0.55)]" />
          ) : (
            <TypeIcon className="w-3 h-3 flex-shrink-0 text-[hsl(var(--bone) / 0.55)]" />
          )}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

// Sortable wrapper applied to each row (heading or content line). Transforms are
// applied to this wrapper only — never to the EditorContent key — so the TipTap
// editor instance is preserved across drags (no remount, focus survives).
interface SortableRowProps {
  uid: string;
  children: (handleProps: {
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners: Record<string, unknown> | undefined;
  }) => React.ReactNode;
  className?: string;
}

function SortableRow({ uid, children, className }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: uid });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 180ms cubic-bezier(0.34, 1.4, 0.64, 1)",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes: attributes as React.HTMLAttributes<HTMLElement>, listeners })}
    </div>
  );
}

export interface ScriptDocEditorProps {
  blocks: ScriptLine[];
  onBlocksChange: React.Dispatch<React.SetStateAction<ScriptLine[]>>;
  scriptTitle?: string;
  scriptMeta?: string;
  onSave?: () => Promise<void>;
  onExportPDF: () => void;
  saving?: boolean;
  // When true, the editor renders as part of the unified script screen: it hides
  // its own title/meta header and its own Save button (the surrounding action row
  // owns saving + title display). The B/I/U toolbar, PDF button, the document and
  // the "Add section" affordance remain.
  embedded?: boolean;
}

interface LineEditorProps {
  block: ScriptLine;
  uid: string;
  isActive: boolean;
  pickerOpen: boolean;
  slashOpen: boolean;
  slashActive: number;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: React.HTMLAttributes<HTMLElement>;
  onFocus: (uid: string) => void;
  onBlur: (uid: string, html: string) => void;
  onEnter: (uid: string, before: string, after: string) => void;
  onBackspaceEmpty: (uid: string) => void;
  onMergeUp: (uid: string, text: string) => void;
  onBarClick: (e: React.MouseEvent, uid: string) => void;
  onTypeChange: (uid: string, type: LineType) => void;
  onTextUpdate: (uid: string, text: string) => void;
  onSlashNav: (uid: string, delta: number) => void;
  onSlashConfirm: (uid: string) => void;
  onSlashClose: (uid: string) => void;
  onHashSpace: (uid: string) => boolean;
  onSlashChoose: (uid: string, action: SlashAction) => void;
  onSlashHover: (index: number) => void;
  registerEditor: (uid: string, editor: Editor | null) => void;
}

function ScriptLineEditor({
  block, uid, isActive, pickerOpen, slashOpen, slashActive,
  dragListeners, dragAttributes,
  onFocus, onBlur, onEnter, onBackspaceEmpty, onMergeUp,
  onBarClick, onTypeChange, onTextUpdate,
  onSlashNav, onSlashConfirm, onSlashClose, onHashSpace, onSlashChoose, onSlashHover,
  registerEditor,
}: LineEditorProps) {
  // Stable refs so TipTap's handleKeyDown (captured at mount) always calls the latest callbacks.
  const onEnterRef = useRef(onEnter);
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);
  const onBackspaceEmptyRef = useRef(onBackspaceEmpty);
  useEffect(() => { onBackspaceEmptyRef.current = onBackspaceEmpty; }, [onBackspaceEmpty]);
  const onMergeUpRef = useRef(onMergeUp);
  useEffect(() => { onMergeUpRef.current = onMergeUp; }, [onMergeUp]);
  const onBlurRef = useRef(onBlur);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);
  const onTextUpdateRef = useRef(onTextUpdate);
  useEffect(() => { onTextUpdateRef.current = onTextUpdate; }, [onTextUpdate]);
  const onSlashNavRef = useRef(onSlashNav);
  useEffect(() => { onSlashNavRef.current = onSlashNav; }, [onSlashNav]);
  const onSlashConfirmRef = useRef(onSlashConfirm);
  useEffect(() => { onSlashConfirmRef.current = onSlashConfirm; }, [onSlashConfirm]);
  const onSlashCloseRef = useRef(onSlashClose);
  useEffect(() => { onSlashCloseRef.current = onSlashClose; }, [onSlashClose]);
  const onHashSpaceRef = useRef(onHashSpace);
  useEffect(() => { onHashSpaceRef.current = onHashSpace; }, [onHashSpace]);
  // Whether the slash menu is currently open for THIS line — read inside the
  // mount-captured handleKeyDown so Arrow/Enter/Escape route to the menu.
  const slashOpenRef = useRef(slashOpen);
  useEffect(() => { slashOpenRef.current = slashOpen; }, [slashOpen]);

  const initialContent = block.rich_text
    ? DOMPurify.sanitize(block.rich_text)
    : (block.text || "");

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
        class: "outline-none min-h-[1.6em] w-full text-[14px] leading-relaxed px-3 py-1.5 cursor-text caret-[hsl(var(--bone))] [caret-color:hsl(var(--bone))]",
      },
      handleKeyDown: (_view, event) => {
        // ---- Slash menu navigation (intercept while open) ----
        if (slashOpenRef.current) {
          if (event.key === "ArrowDown") { event.preventDefault(); onSlashNavRef.current(uid, 1); return true; }
          if (event.key === "ArrowUp")   { event.preventDefault(); onSlashNavRef.current(uid, -1); return true; }
          if (event.key === "Enter")     { event.preventDefault(); onSlashConfirmRef.current(uid); return true; }
          if (event.key === "Escape")    { event.preventDefault(); onSlashCloseRef.current(uid); return true; }
        }
        // ---- Markdown shortcut: "# " at start of an empty line → heading ----
        if (event.key === " ") {
          const text = _view.state.doc.textContent;
          if (text === "#") {
            // Let the parent convert this block to a heading.
            if (onHashSpaceRef.current(uid)) {
              event.preventDefault();
              return true;
            }
          }
        }
        if (event.key === "Enter") {
          event.preventDefault();
          // Split at the caret across the WHOLE block (not just the current
          // paragraph): everything before the caret stays here, everything after
          // moves to a new line below. Using the full doc range handles blocks that
          // hold several internal lines. We only READ here (dispatching a tx inside
          // handleKeyDown is unreliable); the parent applies the split to the block
          // model and force-sets the editor content so it can't desync on blur.
          const sel = _view.state.selection;
          const size = _view.state.doc.content.size;
          const before = _view.state.doc.textBetween(0, sel.from, "\n", "\n");
          const after = sel.from < size
            ? _view.state.doc.textBetween(sel.from, size, "\n", "\n")
            : "";
          onEnterRef.current(uid, before, after);
          return true;
        }
        if (event.key === "Backspace") {
          // Caret at the very start of the block (collapsed) → merge this block's
          // text up into the end of the previous content line (Google-Docs style).
          const { empty, from } = _view.state.selection;
          if (empty && from <= 1) {
            event.preventDefault();
            const size = _view.state.doc.content.size;
            const text = _view.state.doc.textBetween(0, size, "\n", "\n");
            onMergeUpRef.current(uid, text);
            return true;
          }
        }
        if (event.key === "Delete") {
          // Forward-delete on a fully empty block removes it.
          const { empty } = _view.state.selection;
          const docIsEmpty = !_view.state.doc.textContent.trim();
          if (empty && docIsEmpty) {
            event.preventDefault();
            onBackspaceEmptyRef.current(uid);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      // Report plain-text changes so the parent can drive slash-menu open/close.
      onTextUpdateRef.current(uid, e.state.doc.textContent);
    },
    onFocus: () => onFocus(uid),
    onBlur: ({ editor: e }) => {
      const html = DOMPurify.sanitize(e.getHTML());
      onBlurRef.current(uid, html);
    },
  });

  // Register/unregister editor ref with parent, keyed by stable uid.
  useEffect(() => {
    registerEditor(uid, editor);
    return () => registerEditor(uid, null);
  }, [editor, uid, registerEditor]);

  // Keep the uncontrolled TipTap editor synced to the block source of truth when not
  // focused. With stable uid keys React no longer reuses an editor for a different
  // block, but we keep this as a defensive no-desync guarantee.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const incoming = block.rich_text
      ? DOMPurify.sanitize(block.rich_text)
      : (block.text || "");
    if (incoming !== editor.getHTML()) {
      editor.commands.setContent(incoming, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, block.rich_text, block.text]);

  const currentType = TYPE_OPTIONS.find(o => o.type === block.line_type);

  return (
    <div
      className={[
        "relative flex items-stretch mb-0.5 rounded-md group transition-colors",
        isActive ? "bg-[hsl(var(--bone) / 0.04)]" : "hover:bg-[hsl(var(--bone) / 0.025)]",
      ].join(" ")}
    >
      {/* Drag handle — appears on hover; sits to the left of the color bar */}
      <button
        type="button"
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
        className="absolute -left-6 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-grab active:cursor-grabbing touch-none opacity-30 group-hover:opacity-100 transition-opacity text-[hsl(var(--bone) / 0.35)] hover:text-[hsl(var(--bone) / 0.70)]"
        title="Drag to reorder"
        onMouseDown={(e) => e.preventDefault()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Left color bar — doubles as the line's drag handle. The paragraph text is
          a contenteditable editor and can't be a drag handle, so this always-visible
          bar is the grab target. dnd-kit's distance:5 activation separates a click
          (change type) from a drag (reorder), so both behaviours coexist. */}
      <div
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
        className="flex-shrink-0 self-stretch flex items-stretch pr-2 cursor-grab active:cursor-grabbing touch-none"
        onClick={(e) => onBarClick(e, uid)}
        onMouseDown={(e) => e.preventDefault()}
        title="Drag to reorder · click to change type"
      >
        <div
          className={[
            "line-bar w-1 rounded-l-sm transition-all group-hover:w-1.5",
            isActive ? "w-1.5" : "",
            TYPE_BAR_CLASS[block.line_type],
          ].join(" ")}
        />
      </div>

      {/* Editor — wrapper provides reactive text color; color is inherited by .ProseMirror content */}
      <div className={`flex-1 min-w-0 ${TYPE_TEXT_CLASS[block.line_type]}`}>
        <EditorContent editor={editor} />
      </div>

      {/* Floating type picker */}
      {isActive && pickerOpen && (
        <div
          className="absolute left-1.5 bottom-[calc(100%+7px)] z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-[hsl(var(--bone) / 0.18)] bg-[hsl(var(--graphite))] shadow-[0_4px_20px_rgba(0,0,0,0.4)] whitespace-nowrap"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-[9px] text-[hsl(var(--bone) / 0.45)] mr-0.5">type</span>
          {TYPE_OPTIONS.map((opt) => (
            <div
              key={opt.type}
              className={[
                "w-3.5 h-3.5 rounded-full cursor-pointer transition-transform hover:scale-125",
                block.line_type === opt.type
                  ? "ring-2 ring-[hsl(var(--cream))] ring-offset-[2px] ring-offset-[hsl(var(--graphite))]"
                  : "",
              ].join(" ")}
              style={{ background: opt.color }}
              title={opt.label}
              onClick={() => onTypeChange(uid, opt.type)}
            />
          ))}
          <div className="w-px h-3 bg-[hsl(var(--bone) / 0.18)] mx-0.5" />
          <span className="editorial-eyebrow" style={{ letterSpacing: "0.18em", fontSize: 9 }}>
            {currentType?.label}
          </span>
        </div>
      )}

      {/* Floating slash menu */}
      {slashOpen && (
        <SlashMenu
          active={slashActive}
          onChoose={(action) => onSlashChoose(uid, action)}
          onHover={onSlashHover}
        />
      )}
    </div>
  );
}

// Renamable section heading row. Double-click to edit inline. Bold + theme tokens
// (font-serif = EB Garamond, text-foreground = bone on dark) — never hardcoded.
interface HeadingBlockProps {
  block: ScriptLine;
  uid: string;
  autoEdit?: boolean;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: React.HTMLAttributes<HTMLElement>;
  onRename: (uid: string, label: string) => void;
  onDelete: (uid: string) => void;
  /** Optional per-section affordance rendered next to the label (e.g. the
   *  hook section's "Regenerate" button). */
  action?: React.ReactNode;
}

function HeadingBlock({ block, uid, autoEdit, dragListeners, dragAttributes, onRename, onDelete, action }: HeadingBlockProps) {
  const [editing, setEditing] = useState(!!autoEdit);
  const [draft, setDraft] = useState(block.text || defaultSectionLabel(block.section));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(block.text || defaultSectionLabel(block.section));
  }, [block.text, block.section, editing]);

  const commit = () => {
    const label = draft.trim() || defaultSectionLabel(block.section);
    onRename(uid, label);
    setEditing(false);
  };

  return (
    <div className="relative flex items-center gap-2.5 my-5 group/heading">
      {/* Drag handle — moves the heading AND all its lines as one group */}
      <button
        type="button"
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
        className="absolute -left-6 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover/heading:opacity-100 transition-opacity text-[hsl(var(--bone) / 0.35)] hover:text-[hsl(var(--bone) / 0.70)]"
        title="Drag to reorder section"
        onMouseDown={(e) => e.preventDefault()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(block.text || defaultSectionLabel(block.section)); setEditing(false); }
          }}
          className="font-serif font-bold text-foreground text-left bg-transparent outline-none border-b border-[hsl(var(--bone) / 0.30)] text-[15px] px-1 max-w-[340px]"
          style={{ letterSpacing: "0.04em" }}
        />
      ) : (
        <span
          className="font-serif font-bold text-foreground cursor-text select-none text-[15px] text-left"
          style={{ letterSpacing: "0.06em" }}
          title="Double-click to rename section"
          onDoubleClick={() => { setDraft(block.text || defaultSectionLabel(block.section)); setEditing(true); }}
        >
          {block.text || defaultSectionLabel(block.section)}
        </span>
      )}
      {action}
      {/* Rule fills the rest to the right — left-aligned section header (not centered). */}
      <div className="flex-1 h-px bg-[hsl(var(--bone) / 0.14)]" />
      <button
        type="button"
        className="opacity-0 group-hover/heading:opacity-100 transition-opacity text-[hsl(var(--bone) / 0.40)] hover:text-destructive p-0.5"
        title="Delete section"
        onClick={() => onDelete(uid)}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function ScriptDocEditor({
  blocks,
  onBlocksChange,
  scriptTitle,
  scriptMeta,
  onSave,
  onExportPDF,
  saving,
  embedded = false,
}: ScriptDocEditorProps) {
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Slash menu state: which line it's open on + the highlighted item index.
  const [slashUid, setSlashUid] = useState<string | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  // uid of a heading that should open in rename mode immediately after creation.
  const [autoEditHeadingUid, setAutoEditHeadingUid] = useState<string | null>(null);
  const editorMap = useRef<Map<string, Editor>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // ---- Document-level undo/redo for STRUCTURAL changes -------------------
  // TipTap gives each line its own per-line text undo, but it knows nothing
  // about line-level operations (add / delete / merge / reorder / type & section
  // edits). Those flow through onBlocksChange and were previously unrecoverable —
  // Cmd+Z would only undo the focused line's last text edit, never the deleted
  // lines. This layer records a whole-document snapshot before each structural
  // change. Cmd+Z is routed: granular in-line text first (TipTap), then falls
  // through to restore structure once the focused line has no text history left.
  const history = useRef(new UndoHistory<ScriptLine[]>(50));
  // Always-current mirror of `blocks` so snapshot()/undo capture the latest state
  // without re-creating callbacks (and the window keydown handler) on every edit.
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // Snapshot the current document immediately BEFORE a structural mutation.
  const snapshot = useCallback(() => {
    history.current.record(blocksRef.current.map((b) => ({ ...b })));
  }, []);

  // Keydown handler (capture phase, on the editor container). Runs before
  // ProseMirror so it can decide whether to hand the event to TipTap's per-line
  // history or consume it for a document-level structural undo/redo.
  const handleUndoRedoKey = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;

      // Leave native undo alone for plain inputs (e.g. the heading-rename field).
      const tag = (document.activeElement as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      // The TipTap editor (if any) the caret is currently in.
      let focused: Editor | null = null;
      for (const ed of editorMap.current.values()) {
        if (ed.isFocused) { focused = ed; break; }
      }

      const isRedo = e.shiftKey;
      if (isRedo) {
        // Granular in-line redo first; fall through to document-level redo.
        if (focused && !focused.isDestroyed && focused.can().redo()) return;
        const next = history.current.redo(blocksRef.current.map((b) => ({ ...b })));
        if (next === null) return;
        e.preventDefault();
        e.stopPropagation();
        onBlocksChange(next);
      } else {
        // Granular in-line undo first; fall through to document-level undo.
        if (focused && !focused.isDestroyed && focused.can().undo()) return;
        const prev = history.current.undo(blocksRef.current.map((b) => ({ ...b })));
        if (prev === null) return;
        e.preventDefault();
        e.stopPropagation();
        onBlocksChange(prev);
      }
    },
    [onBlocksChange]
  );

  // Drag sensors — same config family as Scripts.tsx (pointer w/ small distance, touch w/ delay).
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Close picker on outside click
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
        setSlashUid(null);
      }
    };
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, []);

  // Once the auto-edit heading has rendered (in rename mode), clear the flag so
  // subsequent re-renders don't force it back into edit mode.
  useEffect(() => {
    if (autoEditHeadingUid) {
      const t = setTimeout(() => setAutoEditHeadingUid(null), 120);
      return () => clearTimeout(t);
    }
  }, [autoEditHeadingUid]);

  const registerEditor = useCallback((uid: string, editor: Editor | null) => {
    if (editor) editorMap.current.set(uid, editor);
    else editorMap.current.delete(uid);
  }, []);

  // ── Regenerate hook (same generator as the canvas Hook Generator node) ──
  const [hookDialogOpen, setHookDialogOpen] = useState(false);

  // The spoken hook = the first ACTOR (voiceover) line of the first hook
  // section. Filming / editor / text-on-screen lines in the section are
  // production notes and must never be replaced by a regenerated hook.
  const findHookLine = (list: ScriptLine[]): { headingIdx: number; lineIdx: number } => {
    const headingIdx = list.findIndex((b) => b.block_kind === "heading" && b.section === "hook");
    if (headingIdx === -1) return { headingIdx: -1, lineIdx: -1 };
    for (let i = headingIdx + 1; i < list.length; i++) {
      if (list[i].block_kind === "heading") break;
      if (list[i].line_type === "actor") return { headingIdx, lineIdx: i };
    }
    return { headingIdx, lineIdx: -1 };
  };

  const { lineIdx: currentHookIdx } = findHookLine(blocks);
  const currentHookText = currentHookIdx !== -1 ? (blocks[currentHookIdx].text || "").trim() : "";

  const applyHook = useCallback(
    (text: string) => {
      const { headingIdx, lineIdx } = findHookLine(blocks);
      if (lineIdx !== -1) {
        const target = blocks[lineIdx];
        // TipTap editors take content at mount only — push the new text into
        // the live editor instance, then mirror it into state for saving.
        if (target.uid) editorMap.current.get(target.uid)?.commands.setContent(plainToHtml(text));
        onBlocksChange((prev) =>
          prev.map((b) => (b.uid === target.uid ? { ...b, text, rich_text: plainToHtml(text) } : b)),
        );
      } else {
        const newLine: ScriptLine = {
          line_number: 0,
          line_type: "actor",
          section: "hook",
          text,
          rich_text: plainToHtml(text),
          block_kind: "line",
          uid: newBlockUid(),
        };
        onBlocksChange((prev) => {
          if (headingIdx === -1) return [newLine, ...prev];
          return [...prev.slice(0, headingIdx + 1), newLine, ...prev.slice(headingIdx + 1)];
        });
      }
      toast.success("Hook replaced — remember to Save");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, onBlocksChange],
  );

  const handleFocus = useCallback((uid: string) => {
    setActiveUid(uid);
  }, []);

  const handleBlur = useCallback((uid: string, html: string) => {
    // Functional update + skip headings: a content line can be converted to a heading
    // (markdown "# " / slash "New section") while it is still focused, which fires this
    // blur on unmount. A value-based update from a stale `blocks` snapshot would revert
    // the conversion; the functional form sees the latest state and the heading guard
    // ensures a line-blur never overwrites a block that is now a heading.
    onBlocksChange((prev) =>
      prev.map((b) =>
        b.uid === uid && b.block_kind !== "heading"
          ? { ...b, rich_text: html, text: stripHtml(html) }
          : b
      )
    );
  }, [onBlocksChange]);

  // Enter inside a content line.
  //  - SPLIT (text after the caret): the current line becomes `before`, a new line
  //    below gets `after`. The block model is updated authoritatively here (so it is
  //    correct regardless of editor focus/blur timing), and the current editor is
  //    force-set to `before` so its eventual blur can't restore the full text.
  //  - NO trailing text (caret at end): just a fresh empty line below.
  // Functional update so it composes with any pending blur without clobbering it.
  const handleEnter = useCallback((uid: string, before: string, after: string) => {
    snapshot();
    const trailing = after ?? "";
    const splitting = trailing.trim().length > 0;
    const newUid = newBlockUid();
    onBlocksChange((prev) => {
      const idx = prev.findIndex((b) => b.uid === uid);
      if (idx === -1) return prev;
      const cur = prev[idx];
      const newBlock: ScriptLine = {
        line_number: 0,
        // A split keeps the same line type (it's a continuation); a fresh line
        // defaults to text_on_screen.
        line_type: splitting ? cur.line_type : "text_on_screen",
        section: cur.section ?? "body",
        text: trailing,
        rich_text: plainToHtml(trailing),
        block_kind: "line",
        uid: newUid,
      };
      if (splitting) {
        // Replace current with its `before` half, then insert the new line.
        const updatedCur: ScriptLine = { ...cur, text: before, rich_text: plainToHtml(before) };
        return [...prev.slice(0, idx), updatedCur, newBlock, ...prev.slice(idx + 1)];
      }
      return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)];
    });
    if (splitting) {
      // Force the focused current editor to its `before` half immediately (it
      // already exists) so any blur — even an early one — persists `before`, never
      // the full text. Done synchronously to avoid a clobber window.
      const curEditor = editorMap.current.get(uid);
      if (curEditor && !curEditor.isDestroyed) {
        curEditor.commands.setContent(plainToHtml(before) || "", false);
      }
    }
    setTimeout(() => {
      const newEditor = editorMap.current.get(newUid);
      if (newEditor) {
        newEditor.commands.focus("start");
        setActiveUid(newUid);
      }
    }, 80);
  }, [onBlocksChange, snapshot]);

  // Backspace at start of empty content line → delete it, focus the previous content line.
  const handleBackspaceEmpty = useCallback((uid: string) => {
    const idx = blocks.findIndex((b) => b.uid === uid);
    if (idx === -1) return;
    const contentCount = blocks.filter((b) => b.block_kind !== "heading").length;
    if (contentCount <= 1) return;
    snapshot();
    const next = blocks.filter((b) => b.uid !== uid);
    onBlocksChange(next);
    // Focus the nearest preceding content line in the new list.
    setTimeout(() => {
      let prevContentUid: string | null = null;
      for (let i = Math.min(idx - 1, next.length - 1); i >= 0; i--) {
        if (next[i] && next[i].block_kind !== "heading") { prevContentUid = next[i].uid ?? null; break; }
      }
      if (prevContentUid) {
        const prevEditor = editorMap.current.get(prevContentUid);
        if (prevEditor) {
          prevEditor.commands.focus("end");
          setActiveUid(prevContentUid);
        }
      }
    }, 80);
  }, [blocks, onBlocksChange, snapshot]);

  // Backspace at the very start of a line → merge it up into the previous content
  // line (Google-Docs style). `text` is the current line's full text.
  const handleMergeUp = useCallback((uid: string, text: string) => {
    const idx = blocks.findIndex((b) => b.uid === uid);
    if (idx === -1) return;
    // Find the nearest previous CONTENT line (skip headings). If none, this is the
    // first line — nothing to merge into.
    let prevIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (blocks[i].block_kind !== "heading") { prevIdx = i; break; }
    }
    if (prevIdx === -1) return;
    snapshot();
    const prevUid = blocks[prevIdx].uid as string;
    const prevEditor = editorMap.current.get(prevUid);
    const prevText = prevEditor && !prevEditor.isDestroyed
      ? prevEditor.getText()
      : (blocks[prevIdx].text || "");
    const merged = prevText + (text || "");
    // Update model: prev gets merged text, current line removed. Functional update.
    onBlocksChange((prev) =>
      prev
        .map((b) => (b.uid === prevUid ? { ...b, text: merged, rich_text: plainToHtml(merged) } : b))
        .filter((b) => b.uid !== uid)
    );
    // Force prev editor to merged content and place the caret at the join point.
    setTimeout(() => {
      const ed = editorMap.current.get(prevUid);
      if (ed && !ed.isDestroyed) {
        ed.commands.setContent(plainToHtml(merged) || "", false);
        ed.commands.focus();
        // +1: ProseMirror text offset → document position (paragraph opens at 1).
        ed.commands.setTextSelection(Math.max(1, prevText.length + 1));
        setActiveUid(prevUid);
      }
    }, 30);
  }, [blocks, onBlocksChange, snapshot]);

  const handleBarClick = useCallback((e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    setActiveUid(uid);
    setPickerOpen((prev) => (activeUid === uid ? !prev : true));
  }, [activeUid]);

  const handleTypeChange = useCallback((uid: string, type: LineType) => {
    snapshot();
    onBlocksChange(blocks.map((b) => (b.uid === uid ? { ...b, line_type: type } : b)));
    setPickerOpen(false);
  }, [blocks, onBlocksChange, snapshot]);

  const handleRenameHeading = useCallback((uid: string, label: string) => {
    snapshot();
    onBlocksChange(blocks.map((b) => (b.uid === uid ? { ...b, text: label, rich_text: label } : b)));
  }, [blocks, onBlocksChange, snapshot]);

  // Delete a heading: its content lines are absorbed into the previous section (or
  // become body if it was the first block). Content lines are NEVER silently deleted.
  const handleDeleteHeading = useCallback((uid: string) => {
    const idx = blocks.findIndex((b) => b.uid === uid);
    if (idx === -1) return;
    snapshot();
    // Find the role of the previous heading (above idx); fallback to 'body'.
    let prevRole: ScriptLine["section"] = "body";
    for (let i = idx - 1; i >= 0; i--) {
      if (blocks[i].block_kind === "heading") { prevRole = blocks[i].section; break; }
    }
    // Lines that belonged to this heading run until the next heading.
    let nextHeadingIdx = blocks.length;
    for (let i = idx + 1; i < blocks.length; i++) {
      if (blocks[i].block_kind === "heading") { nextHeadingIdx = i; break; }
    }
    const next = blocks
      .filter((_, i) => i !== idx)
      .map((b) => {
        // Reassign the orphaned lines (originally between idx and nextHeadingIdx).
        return b;
      });
    // Recompute sections of the orphaned lines explicitly to prevRole.
    const orphanUids = new Set(
      blocks.slice(idx + 1, nextHeadingIdx).filter((b) => b.block_kind !== "heading").map((b) => b.uid)
    );
    onBlocksChange(next.map((b) => (orphanUids.has(b.uid) ? { ...b, section: prevRole } : b)));
  }, [blocks, onBlocksChange, snapshot]);

  // Add a new content line into a section, just before the next heading (end of section).
  const handleAddLineToSection = useCallback((headingUid: string) => {
    const idx = blocks.findIndex((b) => b.uid === headingUid);
    if (idx === -1) return;
    snapshot();
    let insertAt = blocks.length;
    for (let i = idx + 1; i < blocks.length; i++) {
      if (blocks[i].block_kind === "heading") { insertAt = i; break; }
    }
    const newUid = newBlockUid();
    const newBlock: ScriptLine = {
      line_number: 0,
      line_type: "text_on_screen",
      section: blocks[idx].section,
      text: "",
      rich_text: "",
      block_kind: "line",
      uid: newUid,
    };
    onBlocksChange([...blocks.slice(0, insertAt), newBlock, ...blocks.slice(insertAt)]);
    setTimeout(() => {
      const newEditor = editorMap.current.get(newUid);
      if (newEditor) { newEditor.commands.focus("start"); setActiveUid(newUid); }
    }, 80);
  }, [blocks, onBlocksChange, snapshot]);

  // Add a brand-new custom section heading at the very end.
  const handleAddSection = useCallback(() => {
    snapshot();
    const newUid = newBlockUid();
    const headingBlock: ScriptLine = {
      line_number: 0,
      line_type: "text_on_screen",
      section: "body",
      text: "New Section",
      rich_text: "New Section",
      block_kind: "heading",
      uid: newUid,
    };
    const lineUid = newBlockUid();
    const lineBlock: ScriptLine = {
      line_number: 0,
      line_type: "text_on_screen",
      section: "body",
      text: "",
      rich_text: "",
      block_kind: "line",
      uid: lineUid,
    };
    onBlocksChange([...blocks, headingBlock, lineBlock]);
  }, [blocks, onBlocksChange, snapshot]);

  // -------------------------------------------------------------------------
  // Drag to reorder. Content lines move individually (section re-derives on
  // save). A heading moves together with all of its content lines (the slice
  // from the heading up to — but not including — the next heading).
  // -------------------------------------------------------------------------
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Did the dragged row come to rest on the LOWER half of the target row?
    // Compare the dragged element's final (translated) center against the target's
    // center. This drives before/after placement for section (heading) moves so a
    // section lands where it was dropped instead of snapping to the section top.
    const activeRect = active.rect.current.translated;
    const overRect = over.rect;
    const dropIsBelow =
      activeRect && overRect
        ? activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2
        // Fallback (no rects): treat a later target index as "below".
        : blocks.findIndex((b) => b.uid === String(active.id)) <
          blocks.findIndex((b) => b.uid === String(over.id));

    const next = reorderBlocksOnDrag(blocks, String(active.id), String(over.id), dropIsBelow);
    if (!next) return;
    snapshot();
    onBlocksChange(next);
  }, [blocks, onBlocksChange, snapshot]);

  // -------------------------------------------------------------------------
  // Slash menu. Opening is driven by per-line text updates: a lone "/" opens it;
  // any other text closes it. Navigation/confirm come from the line editor's
  // captured keydown handler.
  // -------------------------------------------------------------------------
  const handleTextUpdate = useCallback((uid: string, text: string) => {
    if (text === "/") {
      setSlashUid(uid);
      setSlashActive(0);
    } else {
      // Close if this line was the slash host and no longer a lone "/".
      setSlashUid((prev) => (prev === uid ? null : prev));
    }
  }, []);

  const handleSlashNav = useCallback((_uid: string, delta: number) => {
    setSlashActive((prev) => {
      const n = SLASH_ACTIONS.length;
      return (prev + delta + n) % n;
    });
  }, []);

  const handleSlashClose = useCallback((_uid: string) => {
    setSlashUid(null);
  }, []);

  // Convert a content line block into a section heading (used by slash "New
  // section" and the "# " markdown shortcut). Derives a 'body' role; the label
  // is left empty and opened in rename mode.
  const convertLineToHeading = useCallback((uid: string) => {
    setSlashUid(null);
    const ed = editorMap.current.get(uid);
    if (ed) ed.commands.clearContent();
    onBlocksChange(
      blocks.map((b) =>
        b.uid === uid
          ? { ...b, block_kind: "heading" as const, section: "body" as const, text: "", rich_text: "" }
          : b
      )
    );
    setAutoEditHeadingUid(uid);
  }, [blocks, onBlocksChange]);

  // Apply a slash action to the host line, clearing the "/" first.
  const applySlashAction = useCallback((uid: string, action: SlashAction) => {
    snapshot();
    setSlashUid(null);
    const ed = editorMap.current.get(uid);
    if (ed) ed.commands.clearContent(); // remove the "/"
    if (action.kind === "type") {
      onBlocksChange(
        blocks.map((b) =>
          b.uid === uid ? { ...b, line_type: action.type, text: "", rich_text: "" } : b
        )
      );
      setTimeout(() => editorMap.current.get(uid)?.commands.focus("end"), 0);
    } else if (action.kind === "text-line") {
      onBlocksChange(
        blocks.map((b) =>
          b.uid === uid ? { ...b, text: "", rich_text: "" } : b
        )
      );
      setTimeout(() => editorMap.current.get(uid)?.commands.focus("end"), 0);
    } else {
      // new-section: convert this line into an empty heading, focused for rename.
      convertLineToHeading(uid);
    }
  }, [blocks, onBlocksChange, convertLineToHeading, snapshot]);

  const handleSlashConfirm = useCallback((uid: string) => {
    applySlashAction(uid, SLASH_ACTIONS[slashActive]);
  }, [applySlashAction, slashActive]);

  // "# " markdown shortcut: only fires when the line's text is exactly "#".
  // Returns true if it consumed the Space (block converted to heading).
  const handleHashSpace = useCallback((uid: string) => {
    const b = blocks.find((x) => x.uid === uid);
    if (!b || b.block_kind === "heading") return false;
    snapshot();
    convertLineToHeading(uid);
    return true;
  }, [blocks, convertLineToHeading, snapshot]);

  const activeEditor = useCallback(
    () => (activeUid !== null ? editorMap.current.get(activeUid) ?? null : null),
    [activeUid]
  );

  // Build render groups: each heading starts a section; lines belong to the most
  // recent heading. Content lines before any heading get a synthetic "Body" bucket
  // so nothing is ever hidden.
  // Sortable items = every block's uid in stream order (headings + lines), so
  // dnd indices line up 1:1 with the `blocks` array.
  const allUids = blocks.map((b) => b.uid as string).filter(Boolean);
  type Group = { headingUid: string | null; heading: ScriptLine | null; lines: ScriptLine[] };
  const groups: Group[] = [];
  for (const b of blocks) {
    if (b.block_kind === "heading") {
      groups.push({ headingUid: b.uid ?? null, heading: b, lines: [] });
    } else {
      if (groups.length === 0) {
        groups.push({ headingUid: null, heading: null, lines: [] });
      }
      groups[groups.length - 1].lines.push(b);
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col" onKeyDownCapture={handleUndoRedoKey}>
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
      <div className="editorial-page-dark doc-editor-toolbar flex items-center gap-1 px-4 py-1.5 bg-[hsl(var(--ink))] border-b border-[hsl(var(--bone) / 0.10)] flex-wrap">
        {/* Bold */}
        <button
          className="px-2 py-1 rounded text-[12px] font-bold text-[hsl(var(--bone) / 0.55)] hover:bg-[hsl(var(--bone) / 0.06)] hover:text-[hsl(var(--cream))] transition-colors"
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
          className="px-2 py-1 rounded text-[12px] italic text-[hsl(var(--bone) / 0.55)] hover:bg-[hsl(var(--bone) / 0.06)] hover:text-[hsl(var(--cream))] transition-colors"
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
          className="px-2 py-1 rounded text-[12px] underline text-[hsl(var(--bone) / 0.55)] hover:bg-[hsl(var(--bone) / 0.06)] hover:text-[hsl(var(--cream))] transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            activeEditor()?.chain().focus().toggleUnderline().run();
          }}
          title="Underline (Cmd+U)"
        >
          U
        </button>

        <div className="w-px h-4 bg-[hsl(var(--bone) / 0.12)] mx-1" />

        {/* Type legend */}
        <div className="flex items-center gap-3 ml-1">
          <span className="text-[9px] text-[hsl(var(--bone) / 0.45)]">Line type:</span>
          {TYPE_OPTIONS.map((opt) => (
            <span key={opt.type} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                style={{ background: opt.color }}
              />
              <span className="text-[9px] text-[hsl(var(--bone) / 0.65)]">{opt.label}</span>
            </span>
          ))}
        </div>

        <div className="flex-1" />

        {/* PDF button */}
        <button
          className="editorial-pill flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
          onClick={onExportPDF}
        >
          <Download className="w-3 h-3" />
          PDF
        </button>

        {/* Save button — hidden in embedded mode (the unified action row owns saving). */}
        {!embedded && (
          <button
            className="editorial-pill px-3 py-1 text-[11px] font-medium disabled:opacity-50"
            data-active="true"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {/* Document page */}
      <div className="editorial-page-dark px-4 py-6 bg-[hsl(var(--ink))]">
        <div className="editorial-card doc-print-area w-full max-w-[1040px] mx-auto px-6 sm:px-10 py-10">
          {/* Title/meta header — hidden in embedded mode (the unified screen's
              Winning-Idea chrome already shows title + meta above the document). */}
          {!embedded && (
            <>
              <div
                className="mb-1 font-serif font-medium text-foreground"
                style={{ fontSize: 22, letterSpacing: "-0.005em" }}
              >
                {scriptTitle || "Untitled Script"}
              </div>
              <div className="text-[11px] text-[hsl(var(--bone) / 0.55)] mb-7">{scriptMeta}</div>
            </>
          )}

          {/* Single DndContext/SortableContext over the whole block stream so a
              line can move between sections and a heading can move with its group.
              Items are ALL block uids in stream order (headings + lines). */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={allUids} strategy={verticalListSortingStrategy}>
              {groups.map((group, gi) => (
                <div key={group.headingUid ?? `__nohead_${gi}`}>
                  {/* Section heading (renamable). Groups without a heading row render no header. */}
                  {group.heading && group.headingUid && (
                    <SortableRow uid={group.headingUid}>
                      {({ attributes, listeners }) => (
                        <HeadingBlock
                          block={group.heading as ScriptLine}
                          uid={group.headingUid as string}
                          autoEdit={autoEditHeadingUid === group.headingUid}
                          dragAttributes={attributes}
                          dragListeners={listeners}
                          onRename={handleRenameHeading}
                          onDelete={handleDeleteHeading}
                          action={
                            (group.heading as ScriptLine).section === "hook" ? (
                              <button
                                type="button"
                                onClick={() => setHookDialogOpen(true)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[hsl(var(--bone)/0.20)] text-[11px] text-[hsl(var(--bone)/0.60)] hover:text-foreground hover:border-[hsl(var(--bone)/0.45)] transition-colors"
                                title="Generate 5 fresh hook variations from the viral formula bank"
                              >
                                <Sun className="w-3 h-3" />
                                Regenerate hook
                              </button>
                            ) : undefined
                          }
                        />
                      )}
                    </SortableRow>
                  )}

                  {group.lines.map((line) => (
                    <SortableRow key={line.uid} uid={line.uid as string} className="sline-row">
                      {({ attributes, listeners }) => (
                        <ScriptLineEditor
                          block={line}
                          uid={line.uid as string}
                          isActive={activeUid === line.uid}
                          pickerOpen={pickerOpen && activeUid === line.uid}
                          slashOpen={slashUid === line.uid}
                          slashActive={slashActive}
                          dragAttributes={attributes}
                          dragListeners={listeners}
                          onFocus={handleFocus}
                          onBlur={handleBlur}
                          onEnter={handleEnter}
                          onBackspaceEmpty={handleBackspaceEmpty}
                          onMergeUp={handleMergeUp}
                          onBarClick={handleBarClick}
                          onTypeChange={handleTypeChange}
                          onTextUpdate={handleTextUpdate}
                          onSlashNav={handleSlashNav}
                          onSlashConfirm={handleSlashConfirm}
                          onSlashClose={handleSlashClose}
                          onHashSpace={handleHashSpace}
                          onSlashChoose={applySlashAction}
                          onSlashHover={setSlashActive}
                          registerEditor={registerEditor}
                        />
                      )}
                    </SortableRow>
                  ))}

                  {/* Empty section: always show a click-to-add placeholder so the section
                      is never hidden (fixes the "only Body shows" bug). */}
                  {group.heading && group.headingUid && group.lines.length === 0 && (
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md text-[12px] italic text-[hsl(var(--bone) / 0.40)] hover:text-[hsl(var(--bone) / 0.70)] hover:bg-[hsl(var(--bone) / 0.025)] transition-colors"
                      onClick={() => handleAddLineToSection(group.headingUid as string)}
                    >
                      <Plus className="w-3 h-3" /> Click to add a line
                    </button>
                  )}
                </div>
              ))}
            </SortableContext>
          </DndContext>

          {/* Add section affordance */}
          <button
            type="button"
            className="mt-6 flex items-center gap-1.5 text-[12px] text-[hsl(var(--bone) / 0.45)] hover:text-[hsl(var(--cream))] transition-colors"
            onClick={handleAddSection}
          >
            <Plus className="w-3.5 h-3.5" /> Add section
          </button>
        </div>
      </div>

      <RegenerateHookDialog
        open={hookDialogOpen}
        onClose={() => setHookDialogOpen(false)}
        topic={[scriptTitle, currentHookText].filter(Boolean).join(" — ") || currentHookText || "this script"}
        currentHook={currentHookText || null}
        onPick={applyHook}
      />
    </div>
  );
}
