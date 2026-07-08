import { Loader2 } from "lucide-react";
import type { ClientChannelLink } from "@/hooks/useClientViralChannels";
import type { ViralPlatform } from "@/lib/viral/channelHandle";

const PLATFORM_LABEL: Record<ViralPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// IG first — it's the priority platform for the "only one" quick action.
const PRIORITY: ViralPlatform[] = ["instagram", "tiktok", "youtube"];

interface Props {
  missing: ClientChannelLink[];
  adding: boolean;
  en: boolean;
  onAdd: (targets: { platform: ViralPlatform; username: string }[]) => void;
  onDismiss: () => void;
}

/** Team-only warning shown when onboarding handles aren't tracked on Viral
 *  Today yet. Offers add-all / add-priority-platform / not-now. */
export function AddToViralTodayBanner({ missing, adding, en, onAdd, onDismiss }: Props) {
  if (missing.length === 0) return null;

  const priority = PRIORITY
    .map(p => missing.find(m => m.platform === p))
    .find((m): m is ClientChannelLink => !!m);

  const handleList = missing.map(m => `@${m.username} (${PLATFORM_LABEL[m.platform]})`).join(", ");

  return (
    <div className="flex flex-col gap-2 mb-3 px-3 py-2.5 rounded-lg" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
      <div className="flex items-start gap-2">
        <span style={{ color: "#f59e0b", fontSize: 13, lineHeight: 1.2, marginTop: 1 }}>⚠</span>
        <p className="text-[11px] leading-relaxed" style={{ color: "#f59e0b" }}>
          {en
            ? <>{handleList} {missing.length === 1 ? "is" : "are"} not on Viral Today — posts aren't being tracked, so performance and audience analysis run without real post data.</>
            : <>{handleList} no {missing.length === 1 ? "está" : "están"} en Viral Today — los posts no se están monitoreando, así que el análisis corre sin datos reales.</>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap pl-6">
        {adding ? (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#f59e0b" }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            {en ? "Adding channels & scraping…" : "Añadiendo canales y escaneando…"}
          </span>
        ) : (
          <>
            <button
              onClick={() => onAdd(missing.map(({ platform, username }) => ({ platform, username })))}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-opacity hover:opacity-80"
              style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}
            >
              {missing.length > 1 ? (en ? "Yes, add all" : "Sí, añadir todos") : (en ? "Yes, add it" : "Sí, añadirlo")}
            </button>
            {missing.length > 1 && priority && (
              <button
                onClick={() => onAdd([{ platform: priority.platform, username: priority.username }])}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-opacity hover:opacity-80"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                {en ? `Only ${PLATFORM_LABEL[priority.platform]}` : `Solo ${PLATFORM_LABEL[priority.platform]}`}
              </button>
            )}
            <button
              onClick={onDismiss}
              className="text-[11px] px-2.5 py-1 rounded-md text-white/40 hover:text-white/70 transition-colors"
            >
              {en ? "Not now" : "Ahora no"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
