import { Instagram, StickyNote, Search, ChevronLeft, Plus, Minus, HelpCircle, Anchor, BookOpen, Target, TrendingUp } from "lucide-react";

interface Props {
  onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode") => void;
  onBack: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onShowTutorial: () => void;
  onOpenViralPicker: () => void;
}

function IconBtn({
  onClick,
  icon: Icon,
  label,
  accent = false,
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`p-2 rounded-xl transition-colors ${
          accent
            ? "text-primary/70 hover:text-primary hover:bg-primary/15"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
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

export default function CanvasToolbar({ onAddNode, onBack, onZoomIn, onZoomOut, onShowTutorial, onOpenViralPicker }: Props) {
  return (
    <div className="absolute top-3 left-0 right-0 z-10 flex items-center justify-center pointer-events-none">
      {/* Back — absolute left */}
      <button
        onClick={onBack}
        className="absolute left-3 pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* Center pill */}
      <div className="pointer-events-auto flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border shadow-lg">
        <IconBtn onClick={() => onAddNode("videoNode")}        icon={Instagram}  label="Add Video"    accent />
        <IconBtn onClick={() => onAddNode("textNoteNode")}     icon={StickyNote} label="Add Note"     accent />
        <IconBtn onClick={() => onAddNode("researchNoteNode")} icon={Search}     label="Add Research" accent />

        {/* Divider */}
        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* Hook Generator */}
        <button
          onClick={() => onAddNode("hookGeneratorNode")}
          title="Add Hook Generator"
          className="p-2 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
        >
          <Anchor className="w-4 h-4" />
        </button>

        {/* Brand Guide */}
        <button
          onClick={() => onAddNode("brandGuideNode")}
          title="Add Brand Guide"
          className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
        >
          <BookOpen className="w-4 h-4" />
        </button>

        {/* CTA Builder */}
        <button
          onClick={() => onAddNode("ctaBuilderNode")}
          title="Add CTA Builder"
          className="p-2 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <Target className="w-4 h-4" />
        </button>

        {/* Browse Viral Videos */}
        <button
          onClick={() => onOpenViralPicker()}
          title="Browse Viral Videos"
          className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <TrendingUp className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-border/60 mx-1" />

        <IconBtn onClick={onZoomOut} icon={Minus} label="Zoom Out" />
        <IconBtn onClick={onZoomIn}  icon={Plus}  label="Zoom In"  />

        <div className="w-px h-5 bg-border/60 mx-1" />

        <IconBtn onClick={onShowTutorial} icon={HelpCircle} label="How it works" />
      </div>
    </div>
  );
}
