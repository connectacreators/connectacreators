import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { tr, t } from "@/i18n/translations";

type Lead = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  leadStatus: string;
  leadSource: string;
  createdDate: string;
  appointmentDate: string;
  bookingTime?: string;
  booked?: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  "New Lead":            "bg-[rgba(8,145,178,0.15)] text-[#22d3ee] border-[rgba(8,145,178,0.30)]",
  "Follow-up 1":         "bg-[rgba(132,204,22,0.15)] text-[#84CC16] border-[rgba(132,204,22,0.30)]",
  "Follow-up 2":         "bg-[rgba(8,145,178,0.15)] text-[#22d3ee] border-[rgba(8,145,178,0.30)]",
  "Follow-up 3":         "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Booked":              "bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border-[rgba(245,158,11,0.30)]",
  "Appointment Booked":  "bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border-[rgba(245,158,11,0.30)]",
  "Closed":              "bg-[rgba(148,163,184,0.12)] text-[#94a3b8] border-[rgba(148,163,184,0.25)]",
  "Won":                 "bg-[rgba(148,163,184,0.12)] text-[#94a3b8] border-[rgba(148,163,184,0.25)]",
  "Canceled":            "bg-red-500/15 text-red-400 border-red-500/30",
};

const SOURCE_COLORS: Record<string, string> = {
  "Meta Ads": "bg-blue-500/15 text-blue-400",
  "Google Ads": "bg-red-500/15 text-red-400",
  Website: "bg-purple-500/15 text-purple-400",
  Referral: "bg-emerald-500/15 text-emerald-400",
  Organic: "bg-cyan-500/15 text-cyan-400",
  Other: "bg-gray-500/15 text-gray-400",
};

const COLUMN_ACCENT: Record<string, string> = {
  "New Lead":            "border-t-[#22d3ee]",
  "Follow-up 1":         "border-t-[#84CC16]",
  "Follow-up 2":         "border-t-[#22d3ee]",
  "Follow-up 3":         "border-t-pink-400",
  "Booked":              "border-t-[#F59E0B]",
  "Appointment Booked":  "border-t-[#F59E0B]",
  "Closed":              "border-t-[#94a3b8]",
  "Won":                 "border-t-[#94a3b8]",
  "Canceled":            "border-t-red-400",
};

function formatShortDate(iso: string, language: "en" | "es") {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(language === "en" ? "en-US" : "es-ES", {
    month: "short",
    day: "numeric",
  });
}

function LeadCard({
  lead,
  language,
  updating,
  onClick,
  dragging,
}: {
  lead: Lead;
  language: "en" | "es";
  updating: boolean;
  onClick?: () => void;
  dragging?: boolean;
}) {
  const sourceClass = SOURCE_COLORS[lead.leadSource] || "bg-muted text-muted-foreground";
  const dateStr = formatShortDate(lead.createdDate, language);
  return (
    <div
      onClick={onClick}
      className={`group relative rounded-lg border border-border/40 bg-card/80 backdrop-blur-sm p-3 cursor-grab active:cursor-grabbing hover:border-cyan-400/40 hover:shadow-md hover:shadow-cyan-500/5 transition-all ${
        dragging ? "opacity-50" : ""
      }`}
    >
      {updating && (
        <Loader2 className="absolute top-2 right-2 w-3 h-3 animate-spin text-cyan-400" />
      )}
      <h4 className="text-sm font-semibold text-foreground truncate mb-1.5 pr-4">
        {lead.fullName || tr(t.leadTracker.noName, language)}
      </h4>
      <div className="flex items-center gap-2 flex-wrap">
        {lead.leadSource && (
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${sourceClass}`}>
            {lead.leadSource}
          </Badge>
        )}
        {dateStr && (
          <span className="text-[10px] text-muted-foreground">{dateStr}</span>
        )}
      </div>
    </div>
  );
}

function DraggableCard(props: {
  lead: Lead;
  language: "en" | "es";
  updating: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.lead.id,
    data: { fromStatus: props.lead.leadStatus },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <LeadCard
        lead={props.lead}
        language={props.language}
        updating={props.updating}
        onClick={props.onClick}
        dragging={isDragging}
      />
    </div>
  );
}

function KanbanColumn({
  status,
  leads,
  language,
  updatingId,
  onCardClick,
}: {
  status: string;
  leads: Lead[];
  language: "en" | "es";
  updatingId: string | null;
  onCardClick: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  const badgeClass = STATUS_COLORS[status] || "bg-muted text-muted-foreground border-border";
  const accentClass = COLUMN_ACCENT[status] || "border-t-border";
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 flex-shrink-0 rounded-xl border border-border/50 ${accentClass} border-t-2 bg-card/30 backdrop-blur-sm transition-colors ${
        isOver ? "bg-cyan-500/5 border-cyan-400/40" : ""
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 truncate ${badgeClass}`}
          >
            {status}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground font-medium">{leads.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-[120px] max-h-[calc(100vh-340px)]">
        {leads.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60 italic text-center py-6">
            {language === "en" ? "Drop a lead here" : "Suelta un lead aquí"}
          </div>
        ) : (
          leads.map((lead) => (
            <DraggableCard
              key={lead.id}
              lead={lead}
              language={language}
              updating={updatingId === lead.id}
              onClick={() => onCardClick(lead)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  leads,
  statusOptions,
  updatingId,
  language,
  onCardClick,
  onMoveLead,
}: {
  leads: Lead[];
  statusOptions: string[];
  updatingId: string | null;
  language: "en" | "es";
  onCardClick: (lead: Lead) => void;
  onMoveLead: (leadId: string, newStatus: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  // Build column order: include all known statuses, plus any stray statuses
  // that exist on leads but aren't in statusOptions (so no card is hidden).
  const columns = useMemo(() => {
    const seen = new Set<string>(statusOptions);
    const extras = leads
      .map((l) => l.leadStatus)
      .filter((s): s is string => !!s && !seen.has(s));
    return [...statusOptions, ...Array.from(new Set(extras))];
  }, [statusOptions, leads]);

  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const col of columns) map[col] = [];
    for (const lead of leads) {
      const key = lead.leadStatus || columns[0];
      if (!map[key]) map[key] = [];
      map[key].push(lead);
    }
    return map;
  }, [leads, columns]);

  const activeLead = useMemo(
    () => (activeId ? leads.find((l) => l.id === activeId) ?? null : null),
    [activeId, leads],
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const overStr = String(overId);
    const targetStatus = overStr.startsWith("column:") ? overStr.slice(7) : null;
    if (!targetStatus) return;
    const leadId = String(e.active.id);
    onMoveLead(leadId, targetStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {columns.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            leads={grouped[status] || []}
            language={language}
            updatingId={updatingId}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? (
          <LeadCard lead={activeLead} language={language} updating={false} dragging={false} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
