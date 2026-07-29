import { useMemo, useState } from "react";
import { statusBadgeStyle, statusSolid, sourceBadgeStyle } from "@/lib/leads/statusTokens";
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
  const dateStr = formatShortDate(lead.createdDate, language);
  return (
    <div
      onClick={onClick}
      className={`sm-row group relative p-3 cursor-grab active:cursor-grabbing ${
        dragging ? "opacity-50" : ""
      }`}
    >
      {updating && (
        <Loader2 className="absolute top-2 right-2 w-3 h-3 animate-spin text-primary" />
      )}
      <h4 className="text-sm font-semibold text-foreground truncate mb-1.5 pr-4">
        {lead.fullName || tr(t.leadTracker.noName, language)}
      </h4>
      <div className="flex items-center gap-2 flex-wrap">
        {lead.leadSource && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0" style={sourceBadgeStyle}>
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
  // Column accent and the status pill come from the same tone, so a column
  // and the pills inside it can never disagree — they used to be separate maps.
  const accent = statusSolid(status);
  return (
    <div
      ref={setNodeRef}
      className="flex flex-col w-72 flex-shrink-0 rounded-xl transition-colors"
      style={{
        borderTop: `2px solid ${accent}`,
        border: `1px solid hsl(var(--bone) / ${isOver ? "0.22" : "0.08"})`,
        borderTopWidth: 2,
        borderTopColor: accent,
        background: isOver ? "hsl(var(--aqua) / 0.06)" : "hsl(var(--bone) / 0.03)",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 truncate"
            style={statusBadgeStyle(status)}
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
