import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useLanguage } from "@/hooks/useLanguage";
import { tr } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ArrowLeft, Plus, Trash2, Archive, Link2, Sparkles, X, FileText,
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-[10px]">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="rounded-[10px]" style={{ aspectRatio: "9/14" }} />
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
  const { showOutOfCreditsModal } = useOutOfCredits();

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
        if (err.insufficient_credits) {
          showOutOfCreditsModal();
          setCreating(false);
          return;
        }
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
        if (err.insufficient_credits) {
          showOutOfCreditsModal();
          setCreating(false);
          return;
        }
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
  language, isMasterMode, allClients, filterClientId, onFilterClient,
}: VaultContentProps) {
  const stats = useMemo(() => {
    let hooks = 0, body = 0, ctas = 0;
    templates.forEach((t) => {
      if (!Array.isArray(t.template_lines)) return;
      t.template_lines.forEach((line: any) => {
        const s = (line.section || line.line_type || "").toLowerCase();
        if (s.includes("hook")) hooks++;
        else if (s.includes("cta") || s.includes("call")) ctas++;
        else body++;
      });
    });
    return { hooks, body, ctas };
  }, [templates]);

  const closeDrawer = () => { setShowCreate(false); setNewUrl(""); setNewName(""); };

  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showCreate]);

  return (
    <div className="space-y-0" style={{ fontFamily: "Arial, sans-serif" }}>

      {/* ── Compact Header ── */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-[#22d3ee]" />
            <span className="text-[10px] font-bold tracking-[2px] uppercase text-muted-foreground">
              {isMasterMode
                ? tr({ en: "Master Vault", es: "Vault Maestro" }, language)
                : tr({ en: "Template Library", es: "Biblioteca de Plantillas" }, language)}
            </span>
          </div>
          <h1 className="text-xl font-black text-foreground leading-tight">
            {isMasterMode ? tr({ en: "Master Vault", es: "Vault Maestro" }, language) : "Vault"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isMasterMode
              ? tr({ en: "All clients' templates in one place", es: "Todas las plantillas en un lugar" }, language)
              : tr({ en: "Saved viral video structures", es: "Estructuras de videos virales guardadas" }, language)}
          </p>
        </div>
        <Button
          variant="cta"
          size="sm"
          disabled={!hasClientId}
          onClick={() => setShowCreate(true)}
          className="h-9 px-4 gap-2 rounded-lg font-semibold flex-shrink-0 shadow-lg shadow-primary/20"
          title={isMasterMode && !hasClientId ? tr({ en: "Select a client filter first", es: "Selecciona un cliente primero" }, language) : undefined}
        >
          <Plus className="w-4 h-4" />
          {tr({ en: "New Template", es: "Nueva Plantilla" }, language)}
        </Button>
      </div>

      {/* ── Stats bar ── */}
      {templates.length > 0 && (
        <div className="flex gap-5 py-2.5 mb-3 border-b border-border/40">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{tr({ en: "Templates", es: "Plantillas" }, language)}</span>
            <span className="text-foreground font-bold text-sm ml-1.5">{templates.length}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Hook</span>
            <span className="text-[#22d3ee] font-bold text-sm ml-1.5">{stats.hooks}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Body</span>
            <span className="text-[#a3e635] font-bold text-sm ml-1.5">{stats.body}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">CTA</span>
            <span className="text-[#f59e0b] font-bold text-sm ml-1.5">{stats.ctas}</span>
          </div>
        </div>
      )}

      {/* ── Master mode: client filter dropdown ── */}
      {isMasterMode && allClients && allClients.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Filter:</span>
          <Select
            value={filterClientId ?? "__all__"}
            onValueChange={(v) => onFilterClient?.(v === "__all__" ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs w-48 border-border/60 bg-muted/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{tr({ en: "All Clients", es: "Todos los Clientes" }, language)}</SelectItem>
              {allClients.map(client => (
                <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterClientId && (
            <button onClick={() => onFilterClient?.(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
      )}

      <div className="space-y-6">
        {/* ── Template list ── */}
        {loadingTemplates ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-[10px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="rounded-[10px]" style={{ aspectRatio: "9/14" }} />
            ))}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-[10px]">
            {templates.map((tpl) => (
              <VaultTemplateCard
                key={tpl.id}
                tpl={tpl}
                language={language}
                handleDelete={handleDelete}
                clientName={isMasterMode ? tpl.clients?.name : undefined}
              />
            ))}
            {/* Ghost card — opens create drawer */}
            <button
              disabled={!hasClientId}
              onClick={() => setShowCreate(true)}
              aria-label="Add new template"
              title={!hasClientId ? tr({ en: "Select a client filter first", es: "Selecciona un cliente primero" }, language) : undefined}
              className="rounded-[10px] flex flex-col items-center justify-center gap-2 border border-dashed border-white/10 hover:border-[#22d3ee]/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ aspectRatio: "9/14", background: "rgba(255,255,255,0.02)" }}
            >
              <Plus className="w-4 h-4 text-[#22d3ee]/50" />
              <span className="text-[10px] font-semibold text-white/25">Add</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Slide-in Create Drawer ── */}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.5)",
          opacity: showCreate ? 1 : 0,
          pointerEvents: showCreate ? "auto" : "none",
        }}
        onClick={closeDrawer}
      />
      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out"
        style={{
          width: "420px",
          maxWidth: "100vw",
          background: "#0f1623",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          transform: showCreate ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {tr({ en: "New Template", es: "Nueva Plantilla" }, language)}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr({ en: "Paste a video URL to extract structure", es: "Pega una URL para extraer la estructura" }, language)}
              </p>
            </div>
          </div>
          <button
            onClick={closeDrawer}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}
            aria-label="Close drawer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !creating && newUrl.trim()) handleCreate();
                }}
              />
            </div>
          </div>

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {tr({ en: "Template Name", es: "Nombre de Plantilla" }, language)}{" "}
              <span className="normal-case font-normal text-muted-foreground/50">
                ({tr({ en: "optional", es: "opcional" }, language)})
              </span>
            </label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tr({ en: "e.g. Shock Fact Hook, Story CTA...", es: "ej. Hook Dato Impactante, Historia CTA..." }, language)}
              className="h-12 rounded-xl bg-card border-border/60 focus:border-primary/60 text-sm"
            />
          </div>

          {/* Loading animation */}
          {creating && (
            <div className="border border-primary/20 rounded-2xl p-5 text-center space-y-3" style={{ background: "rgba(255,255,255,0.03)" }}>
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

        {/* Drawer footer */}
        <div className="p-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Button
            variant="cta"
            onClick={handleCreate}
            disabled={creating || !newUrl.trim()}
            className="w-full h-12 rounded-xl text-base font-semibold gap-3 shadow-lg shadow-primary/20"
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
        </div>
      </div>
    </div>
  );
}

// ===================== VAULT TEMPLATE CARD =====================

const SECTION_CONFIG = {
  hook: { label: "HOOK", color: "text-[#22d3ee]", bg: "bg-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.15)]", badge: "bg-[rgba(8,145,178,0.12)] text-[#22d3ee] border-[rgba(8,145,178,0.25)]" },
  body: { label: "BODY", color: "text-[#94a3b8]",  bg: "bg-[rgba(148,163,184,0.04)] border-[rgba(148,163,184,0.12)]",   badge: "bg-[rgba(148,163,184,0.08)] text-[#94a3b8] border-[rgba(148,163,184,0.2)]" },
  cta:  { label: "CTA",  color: "text-[#a3e635]", bg: "bg-[rgba(132,204,22,0.04)] border-[rgba(132,204,22,0.12)]", badge: "bg-[rgba(132,204,22,0.08)] text-[#a3e635] border-[rgba(132,204,22,0.2)]" },
};

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
  const [showTranscription, setShowTranscription] = useState(false);

  const sourceInfo = useMemo(() => {
    const url = tpl.source_url || "";
    const igMatch = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (igMatch) return { label: "IG" };
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { label: "YT" };
    if (url.includes("tiktok.com")) return { label: "TikTok" };
    return { label: null };
  }, [tpl.source_url]);

  const lines = useMemo(() => {
    if (!tpl.template_lines) return [];
    if (Array.isArray(tpl.template_lines)) return tpl.template_lines;
    return [];
  }, [tpl.template_lines]);


  return (
    <>
      {/* Portrait card */}
      <div
        className={`group relative rounded-[10px] overflow-hidden hover:scale-[1.02] transition-transform duration-200 ${lines.length > 0 ? "cursor-pointer" : "cursor-default"}`}
        style={{ aspectRatio: "9/14" }}
        onClick={() => lines.length > 0 && setShowTranscription(true)}
      >
        {/* Background */}
        {tpl.thumbnail_url ? (
          <img
            src={tpl.thumbnail_url}
            alt={tpl.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(160deg, #1a2535, #0d1520)" }}
          />
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.95) 100%)" }}
        />

        {/* Platform badge — top left */}
        {sourceInfo.label && (
          <div
            className="absolute top-2 left-2 text-white text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            {sourceInfo.label}
          </div>
        )}

        {/* Client badge (master mode) */}
        {clientName && (
          <div
            className="absolute left-2 text-[8px] font-bold px-1.5 py-0.5 rounded truncate max-w-[80%]"
            style={{ top: sourceInfo.label ? "28px" : "8px", background: "rgba(8,145,178,0.25)", color: "#22d3ee", border: "1px solid rgba(8,145,178,0.3)" }}
          >
            {clientName}
          </div>
        )}

        {/* Delete button — top right, on hover */}
        <button
          aria-label="Delete template"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded-full transition-opacity"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
        >
          <Trash2 className="w-3 h-3 text-white" />
        </button>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="text-white text-[11px] font-bold leading-tight line-clamp-2 mb-1.5">{tpl.name}</p>
          {lines.length > 0 && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(34,211,238,0.15)", color: "#22d3ee" }}
            >
              {lines.length} lines
            </span>
          )}
        </div>
      </div>

      {/* Template detail modal — unchanged */}
      {lines.length > 0 && (
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
                const meta = SECTION_CONFIG[sectionKey];
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
      )}
    </>
  );
}
