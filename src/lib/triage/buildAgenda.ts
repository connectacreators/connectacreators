// src/lib/triage/buildAgenda.ts
//
// Pure transform powering the dashboard "Tasks" view. Flattens every client's
// triage rows into milestone "tasks", folds status counts into their matching
// deadline, and groups the result into urgency lanes (soonest first).

import { relativeDate, type RelativeBucket } from "./relativeDate";
import type { Language } from "@/hooks/useLanguage";
import type {
  TriageClient,
  TriageRow,
  TriageRowsByClient,
  PipelineMilestone,
} from "./types";

export type AgendaLaneKey = "overdue" | "today" | "tomorrow" | "thisweek" | "later";

export type AgendaKind =
  | PipelineMilestone
  | "scripts_review"
  | "videos_revision"
  | "posts_scheduled";

export interface AgendaItem {
  key: string;            // `${clientId}:${kind}` — stable React key
  clientId: string;
  clientName: string;
  kind: AgendaKind;
  verb: string;
  sortDate: string;       // ISO
  chipLabel: string;
  bucket: RelativeBucket;
  href: string;
  isPrep: boolean;
  count?: number;
  countLabel?: string;
  context?: string;
}

export interface AgendaLane {
  key: AgendaLaneKey;
  label: string;
  items: AgendaItem[];
}

const LANE_ORDER: AgendaLaneKey[] = ["overdue", "today", "tomorrow", "thisweek", "later"];
const LANE_LABEL: Record<AgendaLaneKey, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  thisweek: "This week",
  later: "Later",
};
const LANE_LABEL_ES: Record<AgendaLaneKey, string> = {
  overdue: "Atrasado",
  today: "Hoy",
  tomorrow: "Mañana",
  thisweek: "Esta semana",
  later: "Más tarde",
};

function laneFor(bucket: RelativeBucket): AgendaLaneKey {
  switch (bucket) {
    case "overdue": return "overdue";
    case "soon":
    case "today": return "today";
    case "tomorrow": return "tomorrow";
    case "thisweek": return "thisweek";
    case "twoweeks":
    case "farfuture": return "later";
  }
}

const PREP_MILESTONES: ReadonlySet<AgendaKind> = new Set(["filming", "onboarding_call"]);

// Count row types and the pipeline milestone each folds into.
const COUNT_FOLD: Record<"scripts_review" | "videos_revision" | "posts_scheduled", PipelineMilestone> = {
  scripts_review: "script_due",
  videos_revision: "editing_due",
  posts_scheduled: "posting",
};

function hrefFor(kind: AgendaKind, clientId: string): string {
  switch (kind) {
    case "script_due":
    case "scripts_review":  return `/clients/${clientId}/scripts?filter=needs_review`;
    case "editing_due":
    case "videos_revision": return `/clients/${clientId}/editing-queue?status=Needs%20Revisions`;
    case "posting":
    case "posts_scheduled": return `/clients/${clientId}/content-calendar?window=upcoming`;
    default:                return `/clients/${clientId}/strategy#pipeline`;
  }
}

function pipelineVerb(m: PipelineMilestone, lang: Language = "en"): { verb: string; context?: string } {
  if (lang === "es") {
    switch (m) {
      case "onboarding_call": return { verb: "Llamada de onboarding", context: "revisa el intake primero" };
      case "script_due":      return { verb: "Escribe y envía el script" };
      case "filming":         return { verb: "Prepara la grabación", context: "lista de tomas + confirma talento" };
      case "editing_due":     return { verb: "Cierra la edición" };
      case "boosting":        return { verb: "Configura el boost" };
      case "posting":         return { verb: "Confirma la publicación" };
    }
  }
  switch (m) {
    case "onboarding_call": return { verb: "Onboarding call", context: "review intake first" };
    case "script_due":      return { verb: "Write & send script" };
    case "filming":         return { verb: "Prep the shoot", context: "shot list + confirm talent" };
    case "editing_due":     return { verb: "Lock the edit" };
    case "boosting":        return { verb: "Set up boost" };
    case "posting":         return { verb: "Confirm posting" };
  }
}

function countMeta(kind: "scripts_review" | "videos_revision" | "posts_scheduled", count: number, lang: Language = "en") {
  if (lang === "es") {
    switch (kind) {
      case "scripts_review":  return { verb: "Revisar scripts",     countLabel: `${count} listos para revisar` };
      case "videos_revision": return { verb: "Ediciones en revisión", countLabel: `${count} en revisión` };
      case "posts_scheduled": return { verb: "Posts programados",    countLabel: `${count} programados` };
    }
  }
  switch (kind) {
    case "scripts_review":  return { verb: "Review scripts",   countLabel: `${count} ready for review` };
    case "videos_revision": return { verb: "Edits in revision", countLabel: `${count} in revision` };
    case "posts_scheduled": return { verb: "Posts scheduled",  countLabel: `${count} scheduled` };
  }
}

function countDate(row: Extract<TriageRow, { type: "scripts_review" | "videos_revision" | "posts_scheduled" }>): string {
  return row.type === "posts_scheduled" ? row.nextAt : row.oldestPendingAt;
}

export function buildAgenda(
  clients: TriageClient[],
  rowsByClient: TriageRowsByClient,
  now: Date = new Date(),
  lang: Language = "en",
): AgendaLane[] {
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  const items: AgendaItem[] = [];

  for (const client of clients) {
    const rows = rowsByClient[client.id] ?? [];
    const clientName = nameById.get(client.id) ?? client.name;

    // Index pipeline milestones and count rows for this client.
    const pipelineByMilestone = new Map<PipelineMilestone, Extract<TriageRow, { type: "pipeline" }>>();
    const countRows: Array<Extract<TriageRow, { type: "scripts_review" | "videos_revision" | "posts_scheduled" }>> = [];
    for (const row of rows) {
      if (row.type === "pipeline") pipelineByMilestone.set(row.milestone, row);
      else countRows.push(row);
    }

    const consumedCountTypes = new Set<string>();

    // 1) Pipeline milestones → items (folding the matching count when present).
    for (const [milestone, row] of pipelineByMilestone) {
      const { verb, context: baseContext } = pipelineVerb(milestone, lang);
      const rel = relativeDate(row.at, now, lang);
      const folded = (Object.keys(COUNT_FOLD) as Array<keyof typeof COUNT_FOLD>)
        .find((ct) => COUNT_FOLD[ct] === milestone);
      let count: number | undefined;
      let countLabel: string | undefined;
      if (folded) {
        const cr = countRows.find((c) => c.type === folded);
        if (cr) {
          consumedCountTypes.add(folded);
          count = cr.count;
          countLabel = countMeta(folded, cr.count, lang).countLabel;
        }
      }
      items.push({
        key: `${client.id}:${milestone}`,
        clientId: client.id,
        clientName,
        kind: milestone,
        verb,
        sortDate: row.at,
        chipLabel: rel.label,
        bucket: rel.bucket,
        href: hrefFor(milestone, client.id),
        isPrep: PREP_MILESTONES.has(milestone),
        count,
        countLabel,
        context: row.label ?? baseContext,
      });
    }

    // 2) Unpaired count rows → their own items, dated by their aging timestamp.
    for (const cr of countRows) {
      if (consumedCountTypes.has(cr.type)) continue;
      const date = countDate(cr);
      const rel = relativeDate(date, now, lang);
      const { verb, countLabel } = countMeta(cr.type, cr.count, lang);
      items.push({
        key: `${client.id}:${cr.type}`,
        clientId: client.id,
        clientName,
        kind: cr.type,
        verb,
        sortDate: date,
        chipLabel: rel.label,
        bucket: rel.bucket,
        href: hrefFor(cr.type, client.id),
        isPrep: false,
        count: cr.count,
        countLabel,
      });
    }
  }

  // Group into lanes, sort within by date, drop empty lanes, keep lane order.
  const byLane = new Map<AgendaLaneKey, AgendaItem[]>();
  for (const item of items) {
    const lane = laneFor(item.bucket);
    const arr = byLane.get(lane) ?? [];
    arr.push(item);
    byLane.set(lane, arr);
  }

  const lanes: AgendaLane[] = [];
  for (const key of LANE_ORDER) {
    const laneItems = byLane.get(key);
    if (!laneItems || laneItems.length === 0) continue;
    laneItems.sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime());
    lanes.push({ key, label: (lang === "es" ? LANE_LABEL_ES : LANE_LABEL)[key], items: laneItems });
  }
  return lanes;
}
