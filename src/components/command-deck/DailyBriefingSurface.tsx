// The Command Deck's Briefing Surface — third sibling to
// RevisionReviewSurface and ScriptEditSurface. Opens when
// get_today_briefing fires on /ai: the orb shrinks back (same
// focusMode/mini-orb treatment CommandCenter gives the other two) and the
// caller's open work for today reveals group by group.
//
// Rows stagger in on a fixed cadence rather than typing out character by
// character — this is a scannable checklist, not prose, and a typewriter
// would make you wait to read a number you could have read instantly.
// Reuses broadcast-fade-in from src/index.css so the reveal reads as the
// same system as the script surface's.
import { ArrowLeft, Clapperboard, Send, FileText } from "lucide-react";

export interface BriefingRevision {
  id: string;
  title: string;
  client: string | null;
  deadline: string | null;
}

export interface BriefingScriptGap {
  client: string;
  done: number;
  quota: number;
  missing: number;
}

export interface BriefingState {
  revisions: BriefingRevision[];
  outbound: { sent: number; target: number; remaining: number };
  scriptGaps: BriefingScriptGap[];
}

// Each row waits on the rows before it, across groups — so the whole
// briefing reads top to bottom once, instead of three groups racing.
const STAGGER_MS = 90;
const revealStyle = (index: number) => ({
  animation: `broadcast-fade-in 0.45s cubic-bezier(0.16, 0.8, 0.24, 1) ${index * STAGGER_MS}ms both`,
});

function GroupHeading({
  icon: Icon,
  label,
  accent,
  index,
}: {
  icon: typeof Send;
  label: string;
  accent: string;
  index: number;
}) {
  return (
    <div
      className="flex items-center gap-2 font-mono text-[9px] uppercase mb-2"
      style={{ letterSpacing: "0.14em", color: accent, ...revealStyle(index) }}
    >
      <Icon className="w-3 h-3" strokeWidth={2} />
      {label}
    </div>
  );
}

export default function DailyBriefingSurface({
  briefing,
  onClose,
}: {
  briefing: BriefingState;
  onClose: () => void;
}) {
  const { revisions, outbound, scriptGaps } = briefing;

  // One running counter so the stagger continues across group boundaries.
  let row = 0;
  const nothingDue = revisions.length === 0 && outbound.remaining === 0 && scriptGaps.length === 0;

  return (
    <div className="w-full max-w-2xl flex-1 flex flex-col min-h-0 items-center overflow-y-auto py-4">
      <div className="w-full flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
            style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.6)" }}
          >
            <span
              className="inline-block w-1 h-1 rounded-full"
              style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
            />
            Today
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[9.5px] font-mono uppercase transition-colors px-2 py-1 rounded-full"
            style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--bone) / 0.85)"; e.currentTarget.style.borderColor = "hsl(var(--aqua) / 0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--bone) / 0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to deck
          </button>
        </div>

        {nothingDue && (
          <p
            className="font-serif text-center"
            style={{ fontSize: 20, color: "hsl(var(--bone) / 0.7)", ...revealStyle(0) }}
          >
            Nothing outstanding — you're clear for today.
          </p>
        )}

        {revisions.length > 0 && (
          <div>
            <GroupHeading icon={Clapperboard} label="Videos that need your revision" accent="hsl(var(--honey))" index={row++} />
            <ol className="flex flex-col gap-2">
              {revisions.map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline gap-2.5 text-[14px] leading-snug"
                  style={{ color: "hsl(var(--bone) / 0.85)", ...revealStyle(row++) }}
                >
                  <span className="font-mono text-[11px] shrink-0" style={{ color: "hsl(var(--honey) / 0.7)" }}>
                    {String(revisions.indexOf(r) + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 min-w-0">
                    {r.title}
                    {r.client && (
                      <span className="font-mono text-[10px] ml-2" style={{ color: "hsl(var(--bone) / 0.35)" }}>
                        {r.client}
                      </span>
                    )}
                  </span>
                  {r.deadline && (
                    <span className="font-mono text-[10px] shrink-0" style={{ color: "hsl(var(--bone) / 0.35)" }}>
                      {r.deadline}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {outbound.remaining > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <GroupHeading icon={Send} label="Outbound" accent="hsl(var(--aqua))" index={row++} />
            <p className="text-[14px] leading-snug" style={{ color: "hsl(var(--bone) / 0.85)", ...revealStyle(row++) }}>
              You need to send{" "}
              <b style={{ color: "hsl(var(--aqua))" }}>{outbound.remaining} more message{outbound.remaining === 1 ? "" : "s"}</b>{" "}
              today
              <span className="font-mono text-[10px] ml-2" style={{ color: "hsl(var(--bone) / 0.35)" }}>
                {outbound.sent}/{outbound.target} sent
              </span>
            </p>
          </div>
        )}

        {scriptGaps.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <GroupHeading icon={FileText} label="Scripts behind quota" accent="hsl(var(--good, 141 33% 61%))" index={row++} />
            <ul className="flex flex-col gap-2">
              {scriptGaps.map((s) => (
                <li
                  key={s.client}
                  className="flex items-baseline gap-2 text-[14px] leading-snug"
                  style={{ color: "hsl(var(--bone) / 0.85)", ...revealStyle(row++) }}
                >
                  <span className="flex-1 min-w-0">
                    You need to script for <b style={{ color: "hsl(var(--bone))" }}>{s.client}</b>
                  </span>
                  <span className="font-mono text-[10px] shrink-0" style={{ color: "hsl(var(--bone) / 0.35)" }}>
                    {s.done}/{s.quota}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
