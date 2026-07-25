import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Newspaper, Loader2, ExternalLink, Settings2, Sparkles, RefreshCw, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useClientSwitcher } from "@/hooks/useClientSwitcher";
import { useScripts, type ScriptLine } from "@/hooks/useScripts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// The email side (immigration-news-poll) uses this exact token to gate the
// unauthenticated angle link; the in-app call reuses it in ?format=json mode.
// Same hardcoded-shared-token convention already used for x-cron-secret
// throughout this codebase.
const ANGLE_TOKEN = "abg-news-angle-2026";
const FUNCTIONS_BASE = "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1";

// Mirrors ScriptDocEditor's local plainToHtml — the block model stores both a
// plain-text `text` and a `rich_text` mirror for the doc editor to render.
function plainToHtml(s: string): string {
  if (!s) return "";
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\r?\n/g, "<br>");
}

type NewsRow = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  published_at: string | null;
  relevant: boolean;
  relevance_score: number;
  reason: string | null;
  countries: string[];
  created_at: string;
};

type Settings = {
  min_relevance_score: number;
  target_countries: string[];
  excluded_keywords: string[];
};

export default function ImmigrationNews() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { selectedClientId } = useClientSwitcher();
  const { saveScriptBlocks } = useScripts();
  const navigate = useNavigate();

  const [rows, setRows] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyRelevant, setOnlyRelevant] = useState(true);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({ min_relevance_score: 0.75, target_countries: [], excluded_keywords: [] });
  const [countriesText, setCountriesText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadNews = () => {
    setLoading(true);
    supabase
      .from("immigration_news")
      .select("id, title, summary, url, source, published_at, relevant, relevance_score, reason, countries, created_at")
      .order("created_at", { ascending: false })
      .limit(150)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data ?? []) as NewsRow[]);
        setLoading(false);
      });
  };

  const loadSettings = () => {
    supabase
      .from("immigration_news_settings")
      .select("min_relevance_score, target_countries, excluded_keywords")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const s = {
          min_relevance_score: Number(data.min_relevance_score),
          target_countries: data.target_countries ?? [],
          excluded_keywords: data.excluded_keywords ?? [],
        };
        setSettings(s);
        setCountriesText(s.target_countries.join(", "));
        setKeywordsText(s.excluded_keywords.join(", "));
      });
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadNews();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const allCountries = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => (r.countries || []).forEach((c) => { if (!/general/i.test(c)) set.add(c); }));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      // Filter live against the current threshold — NOT the `relevant` flag
      // stored at ingest time, which can disagree with relevance_score (it's
      // Haiku's own true/false call, possibly made under a different, older
      // threshold) and made the slider look broken.
      if (onlyRelevant && r.relevance_score < settings.min_relevance_score) return false;
      if (activeCountry && !(r.countries || []).some((c) => c.toLowerCase() === activeCountry.toLowerCase())) return false;
      if (q && !r.title.toLowerCase().includes(q) && !(r.summary || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, onlyRelevant, activeCountry, search, settings.min_relevance_score]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const target_countries = countriesText.split(",").map((c) => c.trim()).filter(Boolean);
      const excluded_keywords = keywordsText.split(",").map((k) => k.trim()).filter(Boolean);
      const { error } = await supabase
        .from("immigration_news_settings")
        .update({
          min_relevance_score: settings.min_relevance_score,
          target_countries,
          excluded_keywords,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw error;
      setSettings((s) => ({ ...s, target_countries, excluded_keywords }));
      toast.success("Configuración guardada — aplica desde la próxima revisión (una vez al día).");
      setSettingsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSavingSettings(false);
    }
  };

  const generateScript = async (row: NewsRow) => {
    if (!selectedClientId) {
      toast.error("Selecciona un cliente en la barra lateral primero.");
      return;
    }
    setGeneratingId(row.id);
    try {
      const res = await fetch(
        `${FUNCTIONS_BASE}/immigration-video-angle?id=${row.id}&t=${ANGLE_TOKEN}&format=json`
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo generar el ángulo");

      const { hook, script, cta } = data.angle as { hook: string; script: string; cta: string; why: string };
      const title = row.title.slice(0, 60);
      const raw_content = [hook, "", script, "", cta].filter(Boolean).join("\n");

      const { data: created, error } = await supabase
        .from("scripts")
        .insert({
          client_id: selectedClientId,
          title,
          idea_ganadora: title,
          raw_content,
          inspiration_url: row.url,
          inspiration_urls: [row.url],
        })
        .select("id")
        .single();
      if (error) throw error;

      // The editor renders script_lines (heading + line blocks per section),
      // not raw_content — populate Hook/Body/CTA directly so they aren't
      // empty when the script is first opened.
      const line = (section: ScriptLine["section"], text: string, i: number): ScriptLine[] => [
        { line_number: i * 2, line_type: "text_on_screen", section, text: section === "hook" ? "Hook" : section === "body" ? "Body" : "CTA", block_kind: "heading" },
        { line_number: i * 2 + 1, line_type: "actor", section, text, rich_text: plainToHtml(text), block_kind: "line" },
      ];
      const blocks: ScriptLine[] = [
        ...line("hook", hook, 0),
        ...line("body", script, 1),
        ...line("cta", cta, 2),
      ];
      await saveScriptBlocks(created.id, blocks);

      toast.success("Guion creado a partir de la noticia", {
        action: { label: "Abrir guion", onClick: () => navigate(`/clients/${selectedClientId}/scripts?scriptId=${created.id}`) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el guion");
    } finally {
      setGeneratingId(null);
    }
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Newspaper className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Noticias de Inmigración</h1>
            <p className="text-sm text-muted-foreground">
              Alertas automáticas una vez al día · Federal Register + Google News + Bing News
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadNews} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Configurar
          </Button>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar noticias…"
          className="h-9 max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Switch checked={onlyRelevant} onCheckedChange={setOnlyRelevant} id="only-relevant" />
          <Label htmlFor="only-relevant" className="text-sm cursor-pointer">Solo relevantes</Label>
        </div>
        {allCountries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allCountries.map((c) => (
              <Badge
                key={c}
                variant={activeCountry === c ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => setActiveCountry(activeCountry === c ? null : c)}
              >
                {c}
              </Badge>
            ))}
            {activeCountry && (
              <button onClick={() => setActiveCountry(null)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                <X className="h-3 w-3" /> limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {/* list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "Aún no hay noticias — el primer barrido llega en unos minutos." : "Ninguna noticia coincide con los filtros."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <Card key={row.id} className={row.relevance_score < settings.min_relevance_score ? "opacity-60" : undefined}>
              <CardContent className="py-4 space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {(row.countries || []).map((c) => (
                    <Badge key={c} variant="secondary" className="text-[11px]">{c}</Badge>
                  ))}
                  <Badge variant="outline" className="text-[11px] ml-auto">
                    {Math.round(row.relevance_score * 100)}% relevancia
                  </Badge>
                </div>
                <h3 className="font-semibold text-foreground leading-snug">{row.title}</h3>
                {row.reason && <p className="text-sm text-muted-foreground">{row.reason}</p>}
                <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {row.source === "federal_register" ? "Federal Register" : row.source === "bing_news" ? "Bing News" : "Google News"}
                    {row.published_at ? ` · ${new Date(row.published_at).toLocaleDateString("es-US")}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={row.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver noticia
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      disabled={generatingId === row.id}
                      onClick={() => generateScript(row)}
                    >
                      {generatingId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Generar guion
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar alertas</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Umbral mínimo de relevancia — {Math.round(settings.min_relevance_score * 100)}%</Label>
              <Slider
                value={[settings.min_relevance_score]}
                min={0} max={1} step={0.05}
                onValueChange={([v]) => setSettings((s) => ({ ...s, min_relevance_score: v }))}
              />
              <p className="text-xs text-muted-foreground">
                Solo se envían correos para noticias con relevancia igual o mayor. Anuncios rutinarios
                (ferias, asesorías gratis) puntúan bajo automáticamente.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="countries">Países objetivo (vacío = todos)</Label>
              <Input
                id="countries"
                value={countriesText}
                onChange={(e) => setCountriesText(e.target.value)}
                placeholder="Venezuela, Cuba, Haití"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords">Excluir por palabra clave</Label>
              <Input
                id="keywords"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="feria, asesoría gratis, evento"
              />
              <p className="text-xs text-muted-foreground">
                Cualquier noticia cuyo título o fuente contenga una de estas palabras se descarta antes
                de evaluarse.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
            <Button onClick={saveSettings} disabled={savingSettings}>
              {savingSettings && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
