import { useState, useRef, useEffect } from "react";
import { Instagram, StickyNote, Search, ChevronLeft, ChevronDown, Plus, Minus, HelpCircle, Anchor, BookOpen, Target, TrendingUp, Pencil, Eraser, UserSearch, Trash2, Check, Paperclip, FolderPlus, Type, Maximize2, ClipboardList, Wrench, Compass, BotMessageSquare, Square, Circle, Triangle, PenLine, Minus as MinusLine, ArrowRight, MoreHorizontal } from "lucide-react";
import PresenceAvatars from "./PresenceAvatars";
import type { PresenceUser } from "@/hooks/useRealtimePresence";

export interface SessionItem {
  id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
  user_id?: string;
}

function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  clientName?: string;
  onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "competitorProfileNode" | "mediaNode" | "groupNode" | "annotationNode" | "onboardingFormNode") => void;
  onBack: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView?: () => void;
  onShowTutorial: () => void;
  onOpenViralPicker: () => void;
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  eraserMode?: boolean;
  onToggleEraser?: () => void;
  onClearDrawing?: () => void;
  drawColor?: string;
  onDrawColorChange?: (color: string) => void;
  drawTool?: "freeform" | "rect" | "ellipse" | "triangle" | "line" | "arrow" | "dottedLine";
  onDrawToolChange?: (tool: "freeform" | "rect" | "ellipse" | "triangle" | "line" | "arrow" | "dottedLine") => void;
  drawFill?: boolean;
  onDrawFillToggle?: () => void;
  drawWidth?: number;
  onDrawWidthChange?: (w: number) => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  // Session management
  sessions?: SessionItem[];
  activeSessionId?: string | null;
  onNewSession?: () => void;
  onSwitchSession?: (session: SessionItem) => void;
  onRenameSession?: (id: string, name: string) => void;
  onDeleteSession?: (id: string) => void;
  sessionStorageUsed?: number;
  onOpenFullscreenAI?: () => void;
  // Presence
  presenceOthers?: PresenceUser[];
  myAnimalName?: string;
  myColor?: string;
}

function IconBtn({
  onClick,
  icon: Icon,
  label,
  accent = false,
  tutorialTarget,
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  accent?: boolean;
  tutorialTarget?: string;
}) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        data-tutorial-target={tutorialTarget}
        className={`p-2 rounded-xl transition-colors ${
          accent
            ? "text-[#22d3ee] hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.15)]"
            : "text-[#94a3b8] hover:text-foreground hover:bg-muted/40"
        }`}
      >
        <Icon className="w-4 h-4" />
      </button>
      {/* Tooltip */}
      <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium bg-black/85 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
        {label}
      </span>
    </div>
  );
}

const DRAW_COLORS = ["#22d3ee", "#f43f5e", "#a3e635", "#f59e0b", "#a78bfa", "#ffffff"];

function SessionDropdown({ sessions, activeSessionId, onNewSession, onSwitchSession, onRenameSession, onDeleteSession }: {
  sessions: SessionItem[];
  activeSessionId: string | null | undefined;
  onNewSession?: () => void;
  onSwitchSession?: (s: SessionItem) => void;
  onRenameSession?: (id: string, name: string) => void;
  onDeleteSession?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const activeName = activeSession?.name ?? "Canvas";

  const saveRename = (id: string) => {
    if (renameValue.trim()) onRenameSession?.(id, renameValue.trim());
    setRenamingId(null);
  };

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      {/* Session name pill */}
      <button
        onClick={() => { setOpen(o => !o); setRenamingId(null); setConfirmDeleteId(null); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground transition-colors max-w-[140px]"
      >
        <span className="truncate">{activeName}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>

      {/* New session button */}
      <button
        onClick={() => { onNewSession?.(); setOpen(false); }}
        title="New session"
        className="p-1.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border shadow-lg text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 w-56 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden py-1">
          {sessions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No sessions</div>
          )}
          {sessions.map(session => {
            const isActive = session.id === activeSessionId;
            const isRenaming = renamingId === session.id;
            const isConfirming = confirmDeleteId === session.id;

            return (
              <div
                key={session.id}
                className={`group flex items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
                onClick={() => {
                  if (!isRenaming && !isConfirming) {
                    onSwitchSession?.(session);
                    setOpen(false);
                  }
                }}
              >
                {/* Active check */}
                <span className="w-3 flex-shrink-0">
                  {isActive && <Check className="w-3 h-3" />}
                </span>

                {isRenaming ? (
                  <input
                    autoFocus
                    className="flex-1 bg-transparent border-b border-primary outline-none text-xs py-0.5 text-foreground"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveRename(session.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => saveRename(session.id)}
                    onClick={e => e.stopPropagation()}
                  />
                ) : isConfirming ? (
                  <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <span className="text-red-400 text-[10px] flex-1">Delete?</span>
                    <button
                      className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      onClick={() => { onDeleteSession?.(session.id); setConfirmDeleteId(null); setOpen(false); }}
                    >
                      Yes
                    </button>
                    <button
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 truncate">{session.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{relativeTime(session.updated_at)}</span>
                    <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                      <button
                        className="p-0.5 rounded hover:bg-muted/60"
                        onClick={e => { e.stopPropagation(); setRenamingId(session.id); setRenameValue(session.name); }}
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="p-0.5 rounded hover:bg-red-500/10 hover:text-red-400"
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(session.id); }}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const MAX_SESSION_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

const TOOLS_ITEMS = [
  { type: "hookGeneratorNode"  as const, icon: Anchor,        label: "Hook Generator"  },
  { type: "ctaBuilderNode"     as const, icon: Target,        label: "CTA Builder"     },
  { type: "brandGuideNode"     as const, icon: BookOpen,      label: "Brand Guide"     },
  { type: "onboardingFormNode" as const, icon: ClipboardList, label: "Onboarding Form" },
];

function ToolsDropdown({ onAddNode }: { onAddNode: (type: "hookGeneratorNode" | "ctaBuilderNode" | "brandGuideNode" | "onboardingFormNode") => void }) {
  return (
    <div className="relative group">
      <button className="p-2 rounded-xl transition-colors text-[#94a3b8] group-hover:text-[#22d3ee] group-hover:bg-[rgba(8,145,178,0.1)]">
        <Wrench className="w-4 h-4" />
      </button>
      {/* Invisible bridge prevents gap from closing the dropdown */}
      <div className="absolute h-2 w-full left-0 top-full" />
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
        {TOOLS_ITEMS.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            onClick={() => onAddNode(type)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.08)] transition-colors text-left"
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResearchDropdown({ onAddNode, onOpenViralPicker }: {
  onAddNode: (type: "researchNoteNode" | "competitorProfileNode") => void;
  onOpenViralPicker: () => void;
}) {
  const items = [
    { icon: Search,     label: "Research Note",     onClick: () => onAddNode("researchNoteNode") },
    { icon: TrendingUp, label: "Viral Videos",       onClick: onOpenViralPicker },
    { icon: UserSearch, label: "Competitor Profile", onClick: () => onAddNode("competitorProfileNode") },
  ];

  return (
    <div className="relative group">
      <button className="p-2 rounded-xl transition-colors text-[#94a3b8] group-hover:text-[#22d3ee] group-hover:bg-[rgba(8,145,178,0.1)]">
        <Compass className="w-4 h-4" />
      </button>
      {/* Invisible bridge prevents gap from closing the dropdown */}
      <div className="absolute h-2 w-full left-0 top-full" />
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
        {items.map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.08)] transition-colors text-left"
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CanvasToolbar({ onAddNode, onBack, onZoomIn, onZoomOut, onFitView, onShowTutorial, onOpenViralPicker, drawingMode, onToggleDrawing, eraserMode, onToggleEraser, onClearDrawing, drawColor, onDrawColorChange, drawTool = "freeform", onDrawToolChange, drawFill, onDrawFillToggle, drawWidth = 3, onDrawWidthChange, saveStatus, sessions, activeSessionId, onNewSession, onSwitchSession, onRenameSession, onDeleteSession, sessionStorageUsed = 0, onOpenFullscreenAI, presenceOthers, myAnimalName, myColor }: Props) {
  return (
    <div className="absolute top-3 left-0 right-0 z-10 flex items-center justify-center pointer-events-none">
      {/* Back + session switcher + save status — absolute left */}
      <div className="absolute left-3 pointer-events-auto flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>


        {/* Session dropdown — only shown when session data provided */}
        {sessions && (
          <SessionDropdown
            sessions={sessions}
            activeSessionId={activeSessionId}
            onNewSession={onNewSession}
            onSwitchSession={onSwitchSession}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
          />
        )}

        {saveStatus && saveStatus !== "idle" && (
          <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium backdrop-blur-sm border shadow-sm transition-opacity ${
            saveStatus === "saving" ? "bg-card/70 border-border text-muted-foreground" :
            saveStatus === "saved" ? "bg-card/70 border-emerald-500/30 text-emerald-400" :
            "bg-card/70 border-red-500/30 text-red-400"
          }`}>
            {saveStatus === "saving" && <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Saving...</>}
            {saveStatus === "saved" && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Saved</>}
            {saveStatus === "error" && <><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Save failed</>}
          </span>
        )}
      </div>

      {/* Presence avatars — absolute right */}
      {presenceOthers && myAnimalName && myColor && (
        <div className="absolute right-3 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border shadow-lg">
            <PresenceAvatars
              others={presenceOthers}
              myAnimalName={myAnimalName}
              myColor={myColor}
            />
            {presenceOthers.length > 0 && (
              <span className="text-[10px] text-muted-foreground/70 ml-1">
                {presenceOthers.length + 1} online
              </span>
            )}
          </div>
        </div>
      )}

      {/* Center — main toolbar + optional drawing sub-bar */}
      <div className="pointer-events-auto flex flex-col items-center gap-1.5">
        {/* ── Main toolbar pill ── */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border shadow-lg">
          <IconBtn onClick={() => onAddNode("videoNode")}        icon={Instagram}  label="Add Video"    accent tutorialTarget="video-btn" />
          <IconBtn onClick={() => onAddNode("textNoteNode")}     icon={StickyNote} label="Add Note"     accent tutorialTarget="note-btn" />
          <IconBtn onClick={() => onAddNode("mediaNode")}        icon={Paperclip} label="Upload Media" accent />
          {sessionStorageUsed > 0 && (
            <span className="text-[9px] text-muted-foreground/70 whitespace-nowrap -ml-1">
              {formatBytes(sessionStorageUsed)} / {formatBytes(MAX_SESSION_BYTES)}
            </span>
          )}
          <IconBtn onClick={() => onAddNode("groupNode")} icon={FolderPlus} label="Add Group" accent />

          <div className="w-px h-4 bg-border/60 mx-1" />

          <ToolsDropdown onAddNode={onAddNode} />
          <ResearchDropdown onAddNode={onAddNode} onOpenViralPicker={onOpenViralPicker} />

          <div className="w-px h-5 bg-border/60 mx-1" />

          <IconBtn onClick={() => onAddNode("annotationNode")} icon={Type} label="Add Annotation" />

          {/* Draw toggle */}
          <div className="relative group">
            <button
              onClick={onToggleDrawing}
              className={`p-2 rounded-xl transition-colors ${
                drawingMode
                  ? "text-[#22d3ee] bg-[rgba(8,145,178,0.2)] ring-1 ring-[#22d3ee]/40"
                  : "text-[#94a3b8] hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Pencil className="w-4 h-4" />
            </button>
            <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium bg-black/85 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
              {drawingMode ? "Stop Drawing" : "Draw"}
            </span>
          </div>

          <div className="w-px h-5 bg-border/60 mx-1" />

          <IconBtn onClick={onZoomOut} icon={Minus} label="Zoom Out" />
          <IconBtn onClick={onZoomIn}  icon={Plus}  label="Zoom In"  />
          {onFitView && <IconBtn onClick={onFitView} icon={Maximize2} label="Fit to Screen" />}

          <div className="w-px h-5 bg-border/60 mx-1" />

          <IconBtn onClick={onShowTutorial} icon={HelpCircle} label="How it works" />

          {onOpenFullscreenAI && (
            <>
              <div className="w-px h-5 bg-border/60 mx-1" />
              <IconBtn onClick={onOpenFullscreenAI} icon={BotMessageSquare} label="Full AI Chat" accent />
            </>
          )}
        </div>

        {/* ── Drawing sub-bar — only when drawing mode is on ── */}
        {drawingMode && (
          <div className="flex items-center gap-0.5 px-2 py-1 rounded-2xl bg-card/80 backdrop-blur-sm border border-border shadow-lg">
            {!eraserMode && (
              <>
                {/* Shape tool — shows active icon, hover opens picker */}
                {(() => {
                  const SHAPE_TOOLS = [
                    { tool: "freeform" as const, icon: PenLine, label: "Freeform" },
                    { tool: "line" as const, icon: MinusLine, label: "Line" },
                    { tool: "arrow" as const, icon: ArrowRight, label: "Arrow" },
                    { tool: "dottedLine" as const, icon: MoreHorizontal, label: "Dotted" },
                    { tool: "rect" as const, icon: Square, label: "Rectangle" },
                    { tool: "ellipse" as const, icon: Circle, label: "Circle" },
                    { tool: "triangle" as const, icon: Triangle, label: "Triangle" },
                  ];
                  const ActiveIcon = SHAPE_TOOLS.find(s => s.tool === drawTool)?.icon || PenLine;
                  return (
                    <div className="relative group">
                      <button className="p-1.5 rounded-lg text-[#22d3ee] bg-[rgba(8,145,178,0.2)] transition-colors">
                        <ActiveIcon className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute h-2 w-full left-0 top-full" />
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                        {SHAPE_TOOLS.map(({ tool, icon: Icon, label }) => (
                          <button key={tool} onClick={() => onDrawToolChange?.(tool)}
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left whitespace-nowrap ${
                              drawTool === tool ? "text-[#22d3ee] bg-[rgba(8,145,178,0.1)]" : "text-muted-foreground hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.08)]"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" /> {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Fill toggle — only for closed shapes */}
                {drawTool !== "freeform" && drawTool !== "line" && drawTool !== "arrow" && drawTool !== "dottedLine" && (
                  <div className="relative group">
                    <button onClick={onDrawFillToggle}
                      className={`p-1.5 rounded-lg transition-colors ${drawFill ? "text-[#22d3ee] bg-[rgba(8,145,178,0.2)]" : "text-[#94a3b8] hover:text-foreground hover:bg-muted/30"}`}
                    >
                      <div className="w-3.5 h-3.5 rounded-sm border-2 border-current" style={{ background: drawFill ? "currentColor" : "transparent", opacity: drawFill ? 0.4 : 1 }} />
                    </button>
                    <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium bg-black/85 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                      {drawFill ? "No Fill" : "Fill"}
                    </span>
                  </div>
                )}

                <div className="w-px h-4 bg-border/40 mx-1" />

                {/* Color — single dot, hover opens picker */}
                <div className="relative group">
                  <button className="p-1.5 rounded-lg hover:bg-muted/30 transition-colors flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full border-2 border-white/20" style={{ background: drawColor }} />
                  </button>
                  <div className="absolute h-2 w-full left-0 top-full" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 rounded-xl bg-card border border-border shadow-xl z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                    <div className="flex gap-1.5">
                      {DRAW_COLORS.map(c => (
                        <button key={c} onClick={() => onDrawColorChange?.(c)}
                          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${drawColor === c ? "border-white scale-110" : "border-transparent"}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Stroke width — single dot, hover opens picker */}
                <div className="relative group">
                  <button className="p-1.5 rounded-lg hover:bg-muted/30 transition-colors flex items-center justify-center">
                    <div className="rounded-full bg-[#94a3b8]" style={{ width: Math.max(4, drawWidth * 1.5), height: Math.max(4, drawWidth * 1.5) }} />
                  </button>
                  <div className="absolute h-2 w-full left-0 top-full" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 rounded-xl bg-card border border-border shadow-xl z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                    <div className="flex items-center gap-1.5">
                      {([1, 2, 4, 6, 10] as const).map(w => (
                        <button key={w} onClick={() => onDrawWidthChange?.(w)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${drawWidth === w ? "bg-[rgba(8,145,178,0.2)]" : "hover:bg-muted/30"}`}
                        >
                          <div className="rounded-full" style={{ width: Math.max(3, w * 1.5), height: Math.max(3, w * 1.5), background: drawWidth === w ? "#22d3ee" : "#94a3b8" }} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="w-px h-4 bg-border/40 mx-1" />

            {/* Eraser */}
            <div className="relative group">
              <button onClick={onToggleEraser}
                className={`p-1.5 rounded-lg transition-colors ${eraserMode ? "text-red-400 bg-red-500/15 ring-1 ring-red-400/40" : "text-[#94a3b8] hover:text-red-400 hover:bg-red-500/10"}`}
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium bg-black/85 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                {eraserMode ? "Stop Erasing" : "Eraser"}
              </span>
            </div>

            {/* Clear all */}
            <div className="relative group">
              <button onClick={onClearDrawing} className="p-1.5 rounded-lg text-[#94a3b8] hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium bg-black/85 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                Clear All Drawings
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
