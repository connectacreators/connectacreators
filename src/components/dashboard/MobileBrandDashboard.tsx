// src/components/dashboard/MobileBrandDashboard.tsx
//
// Mobile-only dashboard for single-brand clients/subscribers. Replaces the
// crowded 3-folder layout on phones with an action-first screen:
//   1. Greeting with the client's own profile picture
//   2. "Needs your attention" — tappable rows from useTriageRows (the same
//      real data the admin triage uses), or a calm caught-up state
//   3. Four quick-access tiles (Scripts · Editing Queue · Calendar · Leads)
//
// Desktop continues to use the folder layout in SingleBrandDashboard; this
// component is only rendered below the mobile breakpoint.

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText, Clapperboard, Calendar, Target, Film, Send,
  PhoneCall, PenLine, Scissors, Camera, TrendingUp,
  ChevronRight, Check, type LucideIcon,
} from "lucide-react";
import { useTriageRows } from "@/hooks/useTriageRows";
import { useClientProfilePics } from "@/hooks/useClientProfilePics";
import { ClientAvatar } from "./ClientAvatar";
import { relativeDate } from "@/lib/triage/relativeDate";
import { pipelineMilestoneLabel, type TriageRow, type PipelineMilestone } from "@/lib/triage/types";
import { useLanguage, type Language } from "@/hooks/useLanguage";
import { t } from "@/i18n/translations";

// ─── Dark theme tokens (match SingleBrandDashboard) ───
const BG = "hsl(var(--ink-on-cream))";
const TEXT = "hsl(var(--cream))";
const TEXT_MUTED = "hsl(var(--bone) / 0.62)";
const TEXT_SUBTLE = "hsl(var(--bone) / 0.42)";
const ROW_BG = "hsl(var(--bone) / 0.05)";
const ROW_BORDER = "hsl(var(--bone) / 0.08)";

// Accent tints (avoid palette hex blocked by the pre-commit hook; #A85B1F /
// #7FB58A are allowed, aqua uses its token).
const HONEY = { bg: "hsl(var(--honey) / 0.16)", fg: "hsl(var(--honey))" };
const AQUA = { bg: "hsl(var(--aqua) / 0.16)", fg: "hsl(var(--aqua))" };
const GREEN = { bg: "rgba(127,181,138,0.16)", fg: "#7FB58A" };

const PIPELINE_ICON: Record<PipelineMilestone, LucideIcon> = {
  onboarding_call: PhoneCall,
  script_due: PenLine,
  editing_due: Scissors,
  filming: Camera,
  boosting: TrendingUp,
  posting: Send,
};

interface RowView {
  key: string;
  Icon: LucideIcon;
  tint: { bg: string; fg: string };
  title: string;
  sub: string | null;
  href: string;
}

function plural(n: number, s: string, p?: string) {
  return n === 1 ? s : p ?? `${s}s`;
}

function joinNames(names: string[], max = 42): string {
  const j = names.join(" · ");
  return j.length <= max ? j : j.slice(0, max - 1).trimEnd() + "…";
}

// Action-first ordering: review/approve items lead, pipeline dates follow.
const ORDER: Record<TriageRow["type"], number> = {
  scripts_review: 0,
  videos_revision: 1,
  posts_scheduled: 2,
  pipeline: 3,
};

function toView(row: TriageRow, c: string, lang: Language): RowView {
  const es = lang === "es";
  switch (row.type) {
    case "scripts_review":
      return {
        key: "scripts",
        Icon: FileText,
        tint: HONEY,
        title: es
          ? `${row.count} ${plural(row.count, "script")} por revisar`
          : `${row.count} ${plural(row.count, "script")} to review`,
        sub: joinNames(row.sampleNames),
        href: `/clients/${c}/scripts?filter=needs_review`,
      };
    case "videos_revision":
      return {
        key: "videos",
        Icon: Film,
        tint: AQUA,
        title: es
          ? `${row.count} ${plural(row.count, "video")} por aprobar`
          : `${row.count} ${plural(row.count, "video")} to approve`,
        sub: joinNames(row.sampleNames),
        href: `/clients/${c}/editing-queue?status=Needs%20Revisions`,
      };
    case "posts_scheduled": {
      const rel = relativeDate(row.nextAt, new Date(), lang);
      return {
        key: "posts",
        Icon: Send,
        tint: GREEN,
        title: es
          ? `${row.count} ${plural(row.count, "post")} ${row.count === 1 ? "programado" : "programados"}`
          : `${row.count} ${plural(row.count, "post")} scheduled`,
        sub: [rel.label, joinNames(row.sampleNames, 28)].filter(Boolean).join(" · "),
        href: `/clients/${c}/content-calendar?window=upcoming`,
      };
    }
    case "pipeline": {
      const rel = relativeDate(row.at, new Date(), lang);
      return {
        key: `pipeline-${row.milestone}-${row.at}`,
        Icon: PIPELINE_ICON[row.milestone],
        tint: HONEY,
        title: pipelineMilestoneLabel(row.milestone, lang),
        sub: [rel.label, row.label].filter(Boolean).join(" · "),
        href: `/clients/${c}/strategy#pipeline`,
      };
    }
  }
}

interface Props {
  firstName: string;
  brandName: string | null;
  clientId: string | null;
}

export function MobileBrandDashboard({ firstName, brandName, clientId }: Props) {
  const navigate = useNavigate();
  const { language } = useLanguage();

  const ids = useMemo(() => (clientId ? [clientId] : []), [clientId]);
  const { data: rowsByClient, loading } = useTriageRows(ids);
  const pics = useClientProfilePics(ids);
  const picUrl = clientId ? pics[clientId] : null;

  const rows: RowView[] = useMemo(() => {
    if (!clientId) return [];
    const raw = rowsByClient[clientId] ?? [];
    return [...raw]
      .sort((a, b) => ORDER[a.type] - ORDER[b.type])
      .map((r) => toView(r, clientId, language));
  }, [rowsByClient, clientId, language]);

  const scoped = (p: string) => (clientId ? `/clients/${clientId}/${p}` : `/${p}`);

  const tiles: Array<{ label: string; sub: string; icon: LucideIcon; to: string }> = [
    { label: t.dashboard.tools.scripts.label[language], sub: t.dashboard.tileScriptsSub[language], icon: FileText, to: scoped("scripts") },
    { label: t.dashboard.tools.editingQueue.label[language], sub: t.dashboard.tileEditingSub[language], icon: Clapperboard, to: scoped("editing-queue") },
    { label: t.dashboard.tools.contentCalendar.label[language], sub: t.dashboard.tileCalendarSub[language], icon: Calendar, to: scoped("content-calendar") },
    { label: t.dashboard.leads[language], sub: t.dashboard.tileLeadsSub[language], icon: Target, to: scoped("leads") },
  ];

  const initials = (brandName ?? firstName).trim().slice(0, 2).toUpperCase();

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: BG, minHeight: "100%" }}>
      <div style={{ padding: "22px 18px 28px", maxWidth: 520, margin: "0 auto" }}>

        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex items-center gap-2.5"
          style={{ marginBottom: 18 }}
        >
          <ClientAvatar
            picUrl={picUrl}
            alt={brandName ?? firstName}
            size={32}
            fallback={
              <div
                className="flex items-center justify-center font-semibold"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "hsl(var(--bone) / 0.10)", color: TEXT,
                  fontSize: 12, flexShrink: 0,
                  fontFamily: "var(--font-body, Figtree), sans-serif",
                }}
              >
                {initials}
              </div>
            }
          />
          <span style={{ fontSize: 12.5, color: TEXT_MUTED, fontFamily: "var(--font-body, Figtree), sans-serif" }}>
            {brandName ?? firstName}
          </span>
        </motion.div>

        {/* H1 */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            fontSize: 30, fontWeight: 500, color: TEXT,
            letterSpacing: "-0.015em", lineHeight: 1.08, margin: "0 0 22px",
            fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
          }}
        >
          {language === "es" ? "Hola" : "Hi"} {firstName}{" "}
          <motion.span
            style={{ display: "inline-block", transformOrigin: "70% 70%" }}
            animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
          >
            👋
          </motion.span>
        </motion.h1>

        {/* Needs your attention */}
        <div
          style={{
            fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
            color: TEXT_SUBTLE, fontWeight: 600, marginBottom: 10,
            fontFamily: "var(--font-body, Figtree), sans-serif",
          }}
        >
          {t.dashboard.needsAttention[language]}
        </div>

        {loading && rows.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  height: 56, borderRadius: 13, background: ROW_BG,
                  border: `1px solid ${ROW_BORDER}`, opacity: 0.5,
                }}
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div
            className="flex items-center gap-2.5"
            style={{
              padding: "14px 14px", borderRadius: 13, marginBottom: 24,
              background: "rgba(127,181,138,0.10)", border: "1px solid rgba(127,181,138,0.22)",
              color: TEXT, fontSize: 13.5, fontFamily: "var(--font-body, Figtree), sans-serif",
            }}
          >
            <Check size={16} color={GREEN.fg} strokeWidth={2.25} />
            {t.dashboard.allCaughtUp[language]}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {rows.map((r, idx) => (
              <motion.div
                key={r.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + idx * 0.05 }}
              >
                <Link
                  to={r.href}
                  className="flex items-center gap-3"
                  style={{
                    padding: "12px 13px", borderRadius: 13, textDecoration: "none",
                    background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
                  }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 32, height: 32, borderRadius: 9, background: r.tint.bg }}
                  >
                    <r.Icon size={16} color={r.tint.fg} strokeWidth={1.9} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{ fontSize: 13.5, fontWeight: 500, color: TEXT, fontFamily: "var(--font-body, Figtree), sans-serif" }}
                    >
                      {r.title}
                    </div>
                    {r.sub && (
                      <div
                        className="truncate"
                        style={{ fontSize: 11, color: TEXT_SUBTLE, marginTop: 2, fontFamily: "var(--font-body, Figtree), sans-serif" }}
                      >
                        {r.sub}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} color={TEXT_SUBTLE} className="shrink-0" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Quick-access tiles */}
        <div className="grid grid-cols-2" style={{ gap: 10 }}>
          {tiles.map((tile, idx) => (
            <motion.button
              key={tile.label}
              type="button"
              onClick={() => navigate(tile.to)}
              className="text-left"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 + idx * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
              whileTap={{ scale: 0.98 }}
              style={{
                background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
                borderRadius: 14, padding: "14px 13px", cursor: "pointer",
              }}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: 26, height: 26, borderRadius: 8, background: AQUA.bg, marginBottom: 10 }}
              >
                <tile.icon size={15} color={AQUA.fg} strokeWidth={1.75} />
              </div>
              <div
                style={{
                  fontSize: 14, fontWeight: 500, color: TEXT, letterSpacing: "-0.005em",
                  fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                }}
              >
                {tile.label}
              </div>
              <div
                style={{ fontSize: 10.5, color: TEXT_SUBTLE, marginTop: 2, fontFamily: "var(--font-body, Figtree), sans-serif" }}
              >
                {tile.sub}
              </div>
            </motion.button>
          ))}
        </div>

      </div>
    </div>
  );
}
