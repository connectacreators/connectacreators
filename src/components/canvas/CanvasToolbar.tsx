import { Instagram, StickyNote, Search, ChevronLeft, Plus, Minus, HelpCircle, Anchor, BookOpen, Target, TrendingUp, Pencil, Eraser, UserSearch } from "lucide-react";

interface Props {
  onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode") => void;
  onBack: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onShowTutorial: () => void;
  onOpenViralPicker: () => void;
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  onClearDrawing?: () => void;
  drawColor?: string;
  onDrawColorChange?: (color: string) => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  /** Width of the session sidebar in px; used by Task 7 to offset the toolbar position */
  sidebarOffset?: number;
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

export default function CanvasToolbar({ onAddNode, onBack, onZoomIn, onZoomOut, onShowTutorial, onOpenViralPicker, drawingMode, onToggleDrawing, onClearDrawing, drawColor, onDrawColorChange, saveStatus, sidebarOffset }: Props) {
  return (
    <div className="absolute top-3 left-0 right-0 z-10 flex items-center justify-center pointer-events-none">
      {/* Back + save status — absolute left */}
      <div
        className="absolute pointer-events-auto flex items-center gap-2 transition-all duration-200"
        style={{ left: (sidebarOffset ?? 0) + 12 }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
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

      {/* Center pill */}
      <div className="pointer-events-auto flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border shadow-lg">
        <IconBtn onClick={() => onAddNode("videoNode")}        icon={Instagram}  label="Add Video"    accent tutorialTarget="video-btn" />
        <IconBtn onClick={() => onAddNode("textNoteNode")}     icon={StickyNote} label="Add Note"     accent tutorialTarget="note-btn" />
        <IconBtn onClick={() => onAddNode("researchNoteNode")} icon={Search}     label="Add Research" accent />

        {/* Divider */}
        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* Hook Generator */}
        <button
          onClick={() => onAddNode("hookGeneratorNode")}
          title="Add Hook Generator"
          className="p-2 rounded-lg text-[#94a3b8] hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.1)] transition-colors"
        >
          <Anchor className="w-4 h-4" />
        </button>

        {/* Brand Guide */}
        <button
          onClick={() => onAddNode("brandGuideNode")}
          title="Add Brand Guide"
          className="p-2 rounded-lg text-[#94a3b8] hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.1)] transition-colors"
        >
          <BookOpen className="w-4 h-4" />
        </button>

        {/* CTA Builder */}
        <button
          onClick={() => onAddNode("ctaBuilderNode")}
          title="Add CTA Builder"
          className="p-2 rounded-lg text-[#94a3b8] hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.1)] transition-colors"
        >
          <Target className="w-4 h-4" />
        </button>

        {/* Browse Viral Videos */}
        <button
          onClick={() => onOpenViralPicker()}
          title="Browse Viral Videos"
          className="p-2 rounded-lg text-[#94a3b8] hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.1)] transition-colors"
        >
          <TrendingUp className="w-4 h-4" />
        </button>

        {/* Competitor Profile */}
        <button
          onClick={() => onAddNode("instagramProfileNode")}
          title="Add Competitor Profile"
          className="p-2 rounded-lg text-[#94a3b8] hover:text-[#f43f5e] hover:bg-[rgba(244,63,94,0.1)] transition-colors"
        >
          <UserSearch className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-border/60 mx-1" />

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

        {/* Color picker + clear — only visible when drawing */}
        {drawingMode && (
          <>
            <div className="flex items-center gap-1 ml-1">
              {DRAW_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onDrawColorChange?.(c)}
                  className={`w-4 h-4 rounded-full border-2 transition-transform ${
                    drawColor === c ? "border-white scale-125" : "border-transparent scale-100 hover:scale-110"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="relative group">
              <button
                onClick={onClearDrawing}
                className="p-2 rounded-xl text-[#94a3b8] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Eraser className="w-4 h-4" />
              </button>
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium bg-black/85 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                Clear All Drawings
              </span>
            </div>
          </>
        )}

        <div className="w-px h-5 bg-border/60 mx-1" />

        <IconBtn onClick={onZoomOut} icon={Minus} label="Zoom Out" />
        <IconBtn onClick={onZoomIn}  icon={Plus}  label="Zoom In"  />

        <div className="w-px h-5 bg-border/60 mx-1" />

        <IconBtn onClick={onShowTutorial} icon={HelpCircle} label="How it works" />
      </div>
    </div>
  );
}
