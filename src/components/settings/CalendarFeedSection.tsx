// Admin-only: issue / copy / revoke the read-only iCal subscribe URL that
// Google Calendar polls for production dates.
//
// The URL embeds a bearer token because Google fetches subscribed feeds
// from its own servers with no session — see supabase/functions/
// calendar-feed. That makes the link itself the credential, so the UI
// treats it as a secret: masked until revealed, and "Regenerate" is framed
// as breaking any calendar already subscribed to the old link.
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Copy, Check, Loader2, RefreshCw, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SUPABASE_URL = "https://hxojqrilwhhrvloiwmfo.supabase.co";
const feedTbl = () => (supabase as any).from("calendar_feed_tokens");

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function CalendarFeedSection() {
  const { user, role } = useAuth();
  const { language } = useLanguage();
  const es = language === "es";

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isAdmin = role === "admin";

  useEffect(() => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    feedTbl()
      .select("token")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { token: string } | null }) => {
        setToken(data?.token ?? null);
        setLoading(false);
      });
  }, [user, isAdmin]);

  const issue = useCallback(async () => {
    if (!user) return;
    setWorking(true);
    const next = randomToken();
    const { error } = await feedTbl().upsert(
      { user_id: user.id, token: next, created_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setWorking(false);
    if (error) {
      toast.error(es ? "No se pudo generar el enlace" : "Couldn't generate the link");
      return;
    }
    setToken(next);
    setRevealed(true);
    toast.success(es ? "Enlace de calendario listo" : "Calendar link ready");
  }, [user, es]);

  const revoke = useCallback(async () => {
    if (!user) return;
    setWorking(true);
    const { error } = await feedTbl().delete().eq("user_id", user.id);
    setWorking(false);
    if (error) {
      toast.error(es ? "No se pudo revocar" : "Couldn't revoke");
      return;
    }
    setToken(null);
    setRevealed(false);
    toast.success(es ? "Enlace revocado" : "Link revoked");
  }, [user, es]);

  if (!isAdmin) return null;

  const feedUrl = token ? `${SUPABASE_URL}/functions/v1/calendar-feed?token=${token}` : "";
  const masked = token ? `${SUPABASE_URL}/functions/v1/calendar-feed?token=${"•".repeat(16)}` : "";

  const copy = async () => {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="glass-card rounded-xl p-6 space-y-4 mt-8">
      <h2 className="flex items-center gap-2 font-serif text-lg font-light text-foreground" style={{ letterSpacing: "0.02em" }}>
        <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1.75} />
        {es ? "Calendario de Google" : "Google Calendar"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {es
          ? "Suscríbete a tus fechas de producción (filmación, guiones, edición, publicaciones) desde Google Calendar. Solo lectura — esto publica tus fechas, nunca lee ni modifica tu cuenta de Google."
          : "Subscribe to your production dates (filming, scripts, editing, posting) from Google Calendar. Read-only — this publishes your dates, it never reads or changes your Google account."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {es ? "Cargando…" : "Loading…"}
        </div>
      ) : !token ? (
        <Button onClick={issue} disabled={working} className="gap-2">
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          {es ? "Generar enlace de calendario" : "Generate calendar link"}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground">
              {revealed ? feedUrl : masked}
            </code>
            <Button variant="outline" size="sm" onClick={() => setRevealed((v) => !v)} className="shrink-0 gap-1.5">
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? (es ? "Copiado" : "Copied") : (es ? "Copiar" : "Copy")}
            </Button>
          </div>

          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>{es ? "Copia el enlace de arriba." : "Copy the link above."}</li>
            <li>
              {es
                ? "En Google Calendar: Otros calendarios → + → Desde URL."
                : "In Google Calendar: Other calendars → + → From URL."}
            </li>
            <li>{es ? "Pega el enlace y añade el calendario." : "Paste the link and add the calendar."}</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            {es
              ? "Google actualiza los calendarios suscritos cada pocas horas, así que los cambios no aparecen al instante."
              : "Google refreshes subscribed calendars every few hours, so changes won't appear instantly."}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={issue} disabled={working} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {es ? "Regenerar" : "Regenerate"}
            </Button>
            <Button variant="outline" size="sm" onClick={revoke} disabled={working} className="gap-1.5 text-red-400 hover:text-red-300">
              {es ? "Revocar" : "Revoke"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {es
              ? "Cualquiera con este enlace puede ver tus fechas. Regenerar o revocar desconecta los calendarios ya suscritos."
              : "Anyone with this link can see your dates. Regenerating or revoking will break calendars already subscribed to the old link."}
          </p>
        </div>
      )}
    </div>
  );
}
