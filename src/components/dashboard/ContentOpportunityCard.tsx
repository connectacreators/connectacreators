// src/components/dashboard/ContentOpportunityCard.tsx
//
// Proactive "what to post" tip — reads the single open companion_alerts row
// (kind='content_opportunity') for this client, written by the daily
// scan-content-opportunities edge function (see that file for the
// detection logic: client industry -> niche -> best unseen matching
// viral_videos row). Renders nothing if there's no open tip.
//
// Animation is deliberately NOT the DraftingScene typewriter (that's
// claimed for "AI is writing something") or Viral Today's calm grid-fade
// (claimed for "browsing a feed") — this is "a new signal arrived": a
// quiet radar ping that blooms into the card, approved via a live preview
// artifact before this was built.
import { useEffect, useState } from "react";
import { X, TrendingUp, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import UseInScriptModal from "@/components/viral-today/UseInScriptModal";

// companion_alerts isn't in the generated Supabase types (it's only ever
// been queried from edge functions before this component) — same cast
// convention useVaultFolders.ts uses for the same reason.
const db = supabase as any;

interface OpportunityPayload {
  video_id: string;
  video_url: string;
  caption: string | null;
  hook_text: string | null;
  thumbnail_url: string | null;
  channel_username: string | null;
  platform: string | null;
  outlier_score: number | null;
  views_count: number | null;
  niche: string;
}

interface OpportunityAlert {
  id: string;
  title: string;
  body: string | null;
  payload: OpportunityPayload;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ContentOpportunityCard({ clientId, clientName, en }: { clientId: string; clientName: string; en: boolean }) {
  const [alert, setAlert] = useState<OpportunityAlert | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [showUseInScript, setShowUseInScript] = useState(false);
  const [blooming, setBlooming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    db
      .from("companion_alerts")
      .select("id, title, body, payload")
      .eq("client_id", clientId)
      .eq("kind", "content_opportunity")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setAlert(data as OpportunityAlert);
        // Kick the bloom on the next frame so the CSS animation actually
        // plays (mounting with the class already present would be a no-op).
        if (!prefersReducedMotion()) requestAnimationFrame(() => setBlooming(true));
      });
    return () => { cancelled = true; };
  }, [clientId]);

  if (!alert) return null;
  const p = alert.payload;

  async function handleDismiss() {
    setDismissing(true);
    const { error } = await db.from("companion_alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", alert!.id);
    if (!error) setAlert(null);
    setDismissing(false);
  }

  const reduced = prefersReducedMotion();

  return (
    <>
      <div className="relative w-full max-w-4xl mb-5" style={{ minHeight: reduced || blooming ? undefined : 60 }}>
        {!reduced && (
          <span
            className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
            style={{
              background: "hsl(var(--aqua))",
              opacity: blooming ? 0 : 1,
              transition: "opacity 0.3s ease",
            }}
          >
            <span
              className="absolute inset-[-6px] rounded-full"
              style={{
                border: "1.5px solid hsl(var(--aqua))",
                opacity: blooming ? 0 : 0.8,
                animation: blooming ? undefined : "content-opp-ping 0.9s ease-out infinite",
              }}
            />
          </span>
        )}
        <div
          className="relative flex items-center gap-4 rounded-xl p-4"
          style={{
            background: "hsl(var(--aqua) / 0.05)",
            border: "1px solid hsl(var(--aqua) / 0.22)",
            opacity: reduced ? 1 : blooming ? 1 : 0,
            transform: reduced ? undefined : blooming ? "scale(1)" : "scale(0.94)",
            transition: reduced ? undefined : "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {p.thumbnail_url ? (
            <img
              src={p.thumbnail_url}
              alt=""
              className="w-11 h-14 rounded-md object-cover flex-shrink-0"
              style={{ border: "1px solid hsl(var(--aqua) / 0.15)" }}
            />
          ) : (
            <div
              className="w-11 h-14 rounded-md flex-shrink-0 flex items-center justify-center"
              style={{ background: "hsl(var(--aqua) / 0.12)" }}
            >
              <Sparkles className="w-4 h-4" style={{ color: "hsl(var(--aqua))" }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3 h-3" style={{ color: "hsl(var(--aqua))" }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "hsl(var(--aqua))" }}>
                {en ? "Trending in your niche" : "Tendencia en tu nicho"}
              </span>
              {p.outlier_score != null && (
                <span
                  className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: "hsl(var(--aqua) / 0.15)", color: "hsl(var(--aqua))" }}
                >
                  {Math.round(p.outlier_score * 10) / 10}x
                </span>
              )}
            </div>
            <p className="text-sm text-foreground leading-snug line-clamp-2">
              {p.hook_text || p.caption || alert.title}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setShowUseInScript(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "hsl(var(--aqua))", color: "hsl(var(--ink))" }}
            >
              {en ? "Use idea" : "Usar idea"}
            </button>
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              aria-label={en ? "Dismiss" : "Descartar"}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showUseInScript && (
        <UseInScriptModal
          open={showUseInScript}
          onClose={() => setShowUseInScript(false)}
          video={{ id: p.video_id, video_url: p.video_url, caption: p.caption, channel_username: p.channel_username }}
          clientOptions={[{ id: clientId, name: clientName }]}
        />
      )}
    </>
  );
}
