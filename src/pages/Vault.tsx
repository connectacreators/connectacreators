import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useLanguage } from "@/hooks/useLanguage";
import { tr } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, ArrowLeft, Plus, Trash2, Archive, Link2, CalendarDays, Sparkles, X, FileText,
} from "lucide-react";
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VaultTemplate {
  id: string;
  client_id: string;
  name: string;
  source_url: string | null;
  thumbnail_url: string | null;
  transcription: string | null;
  structure_analysis: any;
  template_lines: any;
  created_at: string;
  clients?: { id: string; name: string } | null;
}

function VaultSkeleton() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card/50 overflow-hidden">
            <Skeleton className="h-36 w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Vault() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const { clients, loading: clientsLoading } = useClients(!!user);
  const { language } = useLanguage();
  const navigate = useNavigate();

  const isStaff = isAdmin || isVideographer;
  const isMasterMode = isAdmin && !urlClientId;

  const [templates, setTemplates] = useState<VaultTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Master vault: client filter state
  const [filterClientId, setFilterClientId] = useState<string | null>(null);
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);

  // Fetch clients list for master vault filter
  useEffect(() => {
    if (!isMasterMode) return;
    supabase.from("clients").select("id, name").order("name")
      .then(({ data }) => { if (data) setAllClients(data); });
  }, [isMasterMode]);

  // Resolve client ID — in master mode uses filter selection for create
  const resolvedClientId = urlClientId || (
    isMasterMode
      ? (filterClientId ?? undefined)
      : (!isStaff && clients.length > 0
          ? clients.find((c) => c.user_id === user?.id)?.id
          : undefined)
  );

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    if (isMasterMode) {
      let query = supabase
        .from("vault_templates")
        .select("*, clients(id, name)")
        .order("created_at", { ascending: false });
      if (filterClientId) query = query.eq("client_id", filterClientId);
      const { data, error } = await query;
      if (error) console.error(error);
      setTemplates((data as VaultTemplate[]) || []);
      setLoadingTemplates(false);
      return;
    }
    if (!resolvedClientId) { setLoadingTemplates(false); return; }
    const { data, error } = await supabase
      .from("vault_templates")
      .select("*")
      .eq("client_id", resolvedClientId)
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    setTemplates((data as VaultTemplate[]) || []);
    setLoadingTemplates(false);
  }, [resolvedClientId, isMasterMode, filterClientId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!newUrl.trim()) return;
    if (!resolvedClientId) {
      toast.error(tr({ en: "Open Vault from a client's profile to add templates.", es: "Abre el Vault desde el perfil de un cliente para agregar plantillas." }, language));
      return;
    }
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      };

      // Step 1: Transcribe
      toast.info(tr({ en: "Transcribing video...", es: "Transcribiendo video..." }, language));
      const transcribeRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-video`,
        { method: "POST", headers, body: JSON.stringify({ url: newUrl.trim() }) }
      );
      if (!transcribeRes.ok) {
        const err = await transcribeRes.json().catch(() => ({ error: "Transcription failed" }));
        throw new Error(err.error || "Transcription failed");
      }
      const { transcription, thumbnail_url: transcribedThumb } = await transcribeRes.json();
      if (!transcription) throw new Error("Empty transcription");

      // Step 2: Analyze & templatize
      toast.info(tr({ en: "Analyzing structure...", es: "Analizando estructura..." }, language));
      const analyzeRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-build-script`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ step: "analyze-template", transcription }),
        }
      );
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error || "Analysis failed");
      }
      const analysis = await analyzeRes.json();

      // Step 3: Determine thumbnail from transcribe response or fetch-thumbnail fallback
      let thumbnailUrl = transcribedThumb || null;
      if (!thumbnailUrl) {
        try {
          const thumbRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-thumbnail`,
            { method: "POST", headers, body: JSON.stringify({ url: newUrl.trim() }) }
          );
          if (thumbRes.ok) {
            const thumbData = await thumbRes.json();
            if (thumbData.thumbnail_url) {
              thumbnailUrl = thumbData.thumbnail_url;
            }
          }
        } catch { /* ignore */ }
      }

      // Step 4: Save to DB
      const templateName = newName.trim() || analysis.suggested_name || "Template";
      const { error } = await supabase.from("vault_templates").insert({
        client_id: resolvedClientId,
        name: templateName,
        source_url: newUrl.trim(),
        thumbnail_url: thumbnailUrl,
        transcription,
        structure_analysis: analysis.structure_analysis || null,
        template_lines: analysis.template_lines || null,
      } as any);
      if (error) throw error;

      toast.success(tr({ en: "Template saved to Vault!", es: "¡Plantilla guardada en el Vault!" }, language));
      setShowCreate(false);
      setNewUrl("");
      setNewName("");
      fetchTemplates();
    } catch (e: any) {
      toast.error(e.message || "Error creating template");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(tr({ en: "Delete this template?", es: "¿Eliminar esta plantilla?" }, language))) return;
    const { error } = await supabase.from("vault_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success(tr({ en: "Template deleted", es: "Plantilla eliminada" }, language));
  };

  const backPath = urlClientId ? `/clients/${urlClientId}` : "/dashboard";

  if (authLoading || clientsLoading) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <VaultSkeleton />
      </PageTransition>
    );
  }

  // Editors cannot access vault
  if (!authLoading && user && !isStaff && !urlClientId) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  // Staff layout with sidebar
  if (isStaff) {
    return (
        <PageTransition className="flex-1 flex flex-col min-h-screen">
          <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
            <VaultContent
              templates={templates}
              loadingTemplates={loadingTemplates}
              hasClientId={!!resolvedClientId}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              newUrl={newUrl}
              setNewUrl={setNewUrl}
              newName={newName}
              setNewName={setNewName}
              creating={creating}
              handleCreate={handleCreate}
              handleDelete={handleDelete}
              backPath={backPath}
              language={language}
              isMasterMode={isMasterMode}
              allClients={allClients}
              filterClientId={filterClientId}
              onFilterClient={setFilterClientId}
            />
          </div>
        </PageTransition>
    );
  }

  // Regular user — standalone page
  return (
    <PageTransition className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background" style={{ fontFamily: "Arial, sans-serif" }}>
      <header className="border-b border-border/50 sticky top-0 z-50 bg-gradient-to-r from-background/90 to-card/90 backdrop-blur-xl hidden lg:block">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{tr({ en: "Dashboard", es: "Dashboard" }, language)}</span>
          </Link>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Archive className="w-5 h-5 text-primary" />
            Vault
          </h1>
          <div className="w-16" />
        </div>
      </header>
      <div className="container mx-auto px-3 sm:px-6 py-6 max-w-6xl">
        <VaultContent
          templates={templates}
          loadingTemplates={loadingTemplates}
          hasClientId={!!resolvedClientId}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
            newUrl={newUrl}
            setNewUrl={setNewUrl}
            newName={newName}
            setNewName={setNewName}
            creating={creating}
            handleCreate={handleCreate}
            handleDelete={handleDelete}
            backPath={backPath}
            language={language}
        />
      </div>
    </PageTransition>
  );
}

// ===================== VAULT CONTENT (shared) =====================

interface VaultContentProps {
  templates: VaultTemplate[];
  loadingTemplates: boolean;
  hasClientId: boolean;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  newUrl: string;
  setNewUrl: (v: string) => void;
  newName: string;
  setNewName: (v: string) => void;
  creating: boolean;
  handleCreate: () => void;
  handleDelete: (id: string) => void;
  backPath: string;
  language: "en" | "es";
  isMasterMode?: boolean;
  allClients?: { id: string; name: string }[];
  filterClientId?: string | null;
  onFilterClient?: (id: string | null) => void;
}

function VaultContent({
  templates, loadingTemplates, hasClientId, showCreate, setShowCreate,
  newUrl, setNewUrl, newName, setNewName,
  creating, handleCreate, handleDelete,
  backPath, language, isMasterMode, allClients, filterClientId, onFilterClient,
}: VaultContentProps) {
  return (
    <div className="space-y-0" style={{ fontFamily: "Arial, sans-serif" }}>

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-background via-primary/5 to-background border-b border-border/60 mb-8 -mx-4 sm:-mx-6 px-4 sm:px-6 py-8">
        {/* Decorative glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary/5 rounded-full blur-2xl" />
        </div>

        <div className="relative">
          <Link to={backPath} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="w-3.5 h-3.5" />
            {tr({ en: "Go Back", es: "Volver" }, language)}
          </Link>

          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
                <Archive className="w-3.5 h-3.5" />
                {isMasterMode
                  ? tr({ en: "Master Vault", es: "Vault Maestro" }, language)
                  : tr({ en: "Template Library", es: "Biblioteca de Plantillas" }, language)}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                {isMasterMode ? tr({ en: "Master Vault", es: "Vault Maestro" }, language) : "Vault"}
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm">
                {isMasterMode
                  ? tr({ en: "All clients' vault templates in one place. Filter by client.", es: "Todas las plantillas de los clientes en un solo lugar. Filtra por cliente." }, language)
                  : tr({ en: "Save viral video structures as reusable templates for your scripts.", es: "Guarda estructuras de videos virales como plantillas reutilizables para tus scripts." }, language)}
              </p>
            </div>

            <Button
              variant="cta"
              size="sm"
              disabled={!hasClientId}
              onClick={() => setShowCreate(!showCreate)}
              className="h-10 px-5 gap-2 rounded-xl font-semibold flex-shrink-0 shadow-lg shadow-primary/20"
              title={isMasterMode && !hasClientId ? tr({ en: "Select a client filter first to add a template", es: "Selecciona un cliente para agregar una plantilla" }, language) : undefined}
            >
              {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showCreate
                ? tr({ en: "Cancel", es: "Cancelar" }, language)
                : tr({ en: "New Template", es: "Nueva Plantilla" }, language)}
            </Button>
          </div>

          {/* ── Master mode: client filter chips ── */}
          {isMasterMode && allClients && allClients.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => onFilterClient?.(null)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  !filterClientId
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30"
                    : "bg-primary/10 text-primary/70 border-primary/20 hover:border-primary/40 hover:text-primary"
                }`}
              >
                {tr({ en: "All Clients", es: "Todos los Clientes" }, language)}
              </button>
              {allClients.map(client => (
                <button
                  key={client.id}
                  onClick={() => onFilterClient?.(client.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    filterClientId === client.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {client.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* ── Create Form ── */}
        {showCreate && (
          <div className="glass-card glass-card-cyan rounded-2xl overflow-hidden">
            {/* Form header */}
            <div className="px-5 py-4 border-b border-primary/15 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {tr({ en: "Add from Viral Video", es: "Agregar desde Video Viral" }, language)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tr({ en: "AI transcribes and extracts the reusable hook/body/CTA structure", es: "La IA transcribe y extrae la estructura reutilizable de hook/cuerpo/CTA" }, language)}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* URL input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tr({ en: "Video URL", es: "URL del Video" }, language)}
                </label>
                <div className="relative">
                  <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder={tr({ en: "TikTok, Instagram, YouTube URL...", es: "URL de TikTok, Instagram, YouTube..." }, language)}
                    className="pl-10 h-12 rounded-xl bg-card border-border/60 focus:border-primary/60 text-sm"
                  />
                </div>
              </div>

              {/* Name input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tr({ en: "Template Name", es: "Nombre de Plantilla" }, language)}{" "}
                  <span className="normal-case font-normal text-muted-foreground/50">({tr({ en: "optional", es: "opcional" }, language)})</span>
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={tr({ en: "e.g. Shock Fact Hook, Story CTA...", es: "ej. Hook Dato Impactante, Historia CTA..." }, language)}
                  className="h-12 rounded-xl bg-card border-border/60 focus:border-primary/60 text-sm"
                />
              </div>

              {/* Generate button */}
              <Button
                variant="cta"
                onClick={handleCreate}
                disabled={creating || !newUrl.trim()}
                className="w-full h-12 rounded-xl text-base font-semibold gap-3 transition-all shadow-lg shadow-primary/20"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {tr({ en: "Transcribing & Analyzing...", es: "Transcribiendo y Analizando..." }, language)}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    {tr({ en: "Transcribe & Templatize", es: "Transcribir y Templatizar" }, language)}
                  </>
                )}
              </Button>

              {/* Loading animation */}
              {creating && (
                <div className="bg-card/50 border border-primary/20 rounded-2xl p-5 text-center space-y-3">
                  <div className="flex justify-center gap-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-2.5 h-2.5 rounded-full bg-primary/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.1}s` }}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tr({ en: "AI is extracting the viral structure...", es: "La IA está extrayendo la estructura viral..." }, language)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Template list ── */}
        {loadingTemplates ? (
          <div className="py-16 text-center space-y-4">
            <div className="flex justify-center gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-primary/40 animate-bounce"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {tr({ en: "Loading templates...", es: "Cargando plantillas..." }, language)}
            </p>
          </div>
        ) : templates.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Archive className="w-7 h-7 text-primary/40" />
            </div>
            {hasClientId ? (
              <>
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {tr({ en: "Vault is empty", es: "El Vault está vacío" }, language)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tr({ en: "Save a viral video's structure as your first template.", es: "Guarda la estructura de un video viral como tu primera plantilla." }, language)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-xl mx-auto"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="w-4 h-4" />
                  {tr({ en: "Add First Template", es: "Agregar Primera Plantilla" }, language)}
                </Button>
              </>
            ) : (
              <div>
                <p className="text-base font-semibold text-foreground">
                  {tr({ en: "No templates yet", es: "Sin plantillas aún" }, language)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {tr({ en: "Select a client filter above to add templates, or they will appear here once created.", es: "Selecciona un cliente arriba para agregar plantillas, o aparecerán aquí una vez creadas." }, language)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Count badge */}
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                <Archive className="w-3 h-3" />
                {templates.length} {tr({ en: "templates", es: "plantillas" }, language)}
              </div>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className="break-inside-avoid mb-3">
                  <VaultTemplateCard
                    tpl={tpl}
                    language={language}
                    handleDelete={handleDelete}
                    clientName={isMasterMode ? tpl.clients?.name : undefined}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ===================== VAULT TEMPLATE CARD =====================

function VaultTemplateCard({
  tpl,
  language,
  handleDelete,
  clientName,
}: {
  tpl: VaultTemplate;
  language: "en" | "es";
  handleDelete: (id: string) => void;
  clientName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);

  // Detect source type for thumbnail rendering
  const sourceInfo = useMemo(() => {
    const url = tpl.source_url || "";
    const igMatch = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (igMatch) return { type: "instagram" as const, id: igMatch[1], label: "Instagram" };
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { type: "youtube" as const, id: ytMatch[1], label: "YouTube" };
    if (url.includes("tiktok.com")) return { type: "tiktok" as const, id: null, label: "TikTok" };
    return { type: "other" as const, id: null, label: null };
  }, [tpl.source_url]);

  const lines = useMemo(() => {
    if (!tpl.template_lines) return [];
    if (Array.isArray(tpl.template_lines)) return tpl.template_lines;
    return [];
  }, [tpl.template_lines]);

  const previewLines = lines.slice(0, 3);
  const hasMore = lines.length > 3;

  // Section color config (matches wizard's line-type colors)
  const sectionConfig = {
    hook: { label: "HOOK", color: "text-[#22d3ee]", bg: "bg-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.15)]", badge: "bg-[rgba(8,145,178,0.12)] text-[#22d3ee] border-[rgba(8,145,178,0.25)]" },
    body: { label: "BODY", color: "text-[#94a3b8]",  bg: "bg-[rgba(148,163,184,0.04)] border-[rgba(148,163,184,0.12)]",   badge: "bg-[rgba(148,163,184,0.08)] text-[#94a3b8] border-[rgba(148,163,184,0.2)]" },
    cta:  { label: "CTA",  color: "text-[#a3e635]", bg: "bg-[rgba(132,204,22,0.04)] border-[rgba(132,204,22,0.12)]", badge: "bg-[rgba(132,204,22,0.08)] text-[#a3e635] border-[rgba(132,204,22,0.2)]" },
  };

  return (
    <div
      className="group relative glass-card rounded-2xl hover:border-[rgba(8,145,178,0.25)] transition-all duration-200 overflow-hidden flex flex-col cursor-pointer hover:shadow-lg hover:shadow-primary/5"
      style={{ fontFamily: "Arial, sans-serif" }}
      onClick={() => lines.length > 0 && setShowTranscription(true)}
    >
      {/* Thumbnail */}
      <div className="relative bg-gradient-to-br from-muted/40 to-muted/20 overflow-hidden flex-shrink-0">
        {tpl.thumbnail_url ? (
          <img
            src={tpl.thumbnail_url}
            alt={tpl.name}
            className="w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[9/16] max-h-[200px] flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 to-primary/5">
            <Archive className="w-8 h-8 text-primary/30" />
            <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Template</span>
          </div>
        )}

        {/* Gradient overlay at bottom of thumbnail */}
        <div
          className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
          style={{ background: "linear-gradient(transparent, rgba(6,9,12,0.85))" }}
        />

        {/* Source platform badge — top left */}
        {sourceInfo.label && (
          <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md rounded-md px-1.5 py-0.5 text-[9px] text-slate-400">
            {sourceInfo.label}
          </div>
        )}

        {/* Line count badge — bottom right */}
        {lines.length > 0 && (
          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            <FileText className="w-2.5 h-2.5" />
            {lines.length} lines
          </div>
        )}

        {/* Delete button — top right, on hover */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-white hover:text-red-400 bg-black/50 hover:bg-black/70 backdrop-blur-sm h-7 w-7 p-0 rounded-full transition-all"
          onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        {/* Name + date */}
        <div>
          {clientName && (
            <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/20 mb-1 truncate max-w-full">
              {clientName}
            </span>
          )}
          <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {tpl.name}
          </h3>
          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-1">
            <CalendarDays className="w-2.5 h-2.5" />
            {new Date(tpl.created_at).toLocaleDateString()}
          </span>
        </div>

        {/* Hook preview */}
        {previewLines.length > 0 && (
          <div className="space-y-1 mt-1">
            {previewLines.slice(0, 2).map((line: any, i: number) => {
              const sec = (line.section || "body").toLowerCase() as keyof typeof sectionConfig;
              const cfg = sectionConfig[sec] || sectionConfig.body;
              return (
                <div key={i} className="flex items-start gap-1.5">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">{line.text}</span>
                </div>
              );
            })}
            {lines.length > 2 && (
              <p className="text-[10px] text-primary/60 font-medium">
                +{lines.length - 2} {tr({ en: "more lines", es: "líneas más" }, language)}
              </p>
            )}
          </div>
        )}

        {/* View CTA */}
        {lines.length > 0 && (
          <div className="mt-auto pt-1">
            <span className="text-[11px] text-primary font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <FileText className="w-3 h-3" />
              {tr({ en: "View template →", es: "Ver plantilla →" }, language)}
            </span>
          </div>
        )}
      </div>

      {/* Template Modal */}
      {lines.length > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          <Dialog open={showTranscription} onOpenChange={setShowTranscription}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" style={{ fontFamily: "Arial, sans-serif" }}>
            <DialogHeader className="border-b border-border/60 pb-4">
              <DialogTitle className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-foreground truncate">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground font-normal">{lines.length} {tr({ en: "template lines", es: "líneas de plantilla" }, language)}</p>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 space-y-3 pr-1 pt-2">
              {(["hook", "body", "cta"] as const).map((sectionKey) => {
                const sectionLines = lines.filter((l: any) => {
                  const s = (l.section || l.line_type || "").toLowerCase();
                  if (sectionKey === "hook") return s.includes("hook");
                  if (sectionKey === "cta") return s.includes("cta") || s.includes("call");
                  return !s.includes("hook") && !s.includes("cta") && !s.includes("call");
                });
                if (sectionLines.length === 0) return null;
                const meta = sectionConfig[sectionKey];
                return (
                  <div key={sectionKey} className={`rounded-2xl border p-4 space-y-3 ${meta.bg}`}>
                    <div className={`inline-flex items-center gap-2 text-xs font-bold tracking-widest px-3 py-1 rounded-full border ${meta.badge}`}>
                      {meta.label}
                    </div>
                    {sectionLines.map((line: any, i: number) => (
                      <div key={i} className="space-y-1">
                        {line.line_type && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {line.line_type}
                          </span>
                        )}
                        <p className="text-sm text-foreground leading-relaxed italic">"{line.text}"</p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
