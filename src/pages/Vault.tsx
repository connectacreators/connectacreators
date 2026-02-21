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
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, ArrowLeft, Plus, Trash2, Archive, Link2, CalendarDays, Sparkles, X, ChevronDown, ChevronUp, Play,
} from "lucide-react";

import AnimatedDots from "@/components/ui/AnimatedDots";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";

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
}

export default function Vault() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const { clients, loading: clientsLoading } = useClients(!!user);
  const { language } = useLanguage();
  const navigate = useNavigate();

  const isStaff = isAdmin || isVideographer;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const [templates, setTemplates] = useState<VaultTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newThumbnailUrl, setNewThumbnailUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Resolve client ID
  const resolvedClientId = urlClientId || (
    !isStaff && clients.length > 0
      ? clients.find((c) => c.user_id === user?.id)?.id
      : undefined
  );

  const fetchTemplates = useCallback(async () => {
    if (!resolvedClientId) return;
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from("vault_templates")
      .select("*")
      .eq("client_id", resolvedClientId)
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    setTemplates((data as VaultTemplate[]) || []);
    setLoadingTemplates(false);
  }, [resolvedClientId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!newUrl.trim() || !resolvedClientId) return;
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
      const { transcription } = await transcribeRes.json();
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

      // Step 3: Auto-fetch thumbnail via edge function
      let thumbnailUrl = newThumbnailUrl.trim() || null;
      if (!thumbnailUrl) {
        try {
          toast.info(tr({ en: "Fetching thumbnail...", es: "Obteniendo miniatura..." }, language));
          const thumbRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-thumbnail`,
            { method: "POST", headers, body: JSON.stringify({ url: newUrl.trim() }) }
          );
          if (thumbRes.ok) {
            const thumbData = await thumbRes.json();
            if (thumbData.thumbnail_url) thumbnailUrl = thumbData.thumbnail_url;
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
      setNewThumbnailUrl("");
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Staff layout with sidebar
  if (isStaff) {
    return (
      <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
        <AnimatedDots />
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/clients" />
        <main className="flex-1 flex flex-col min-h-screen">
          <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
          <div className="flex-1 px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
            <VaultContent
              templates={templates}
              loadingTemplates={loadingTemplates}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              newUrl={newUrl}
              setNewUrl={setNewUrl}
              newName={newName}
              setNewName={setNewName}
              newThumbnailUrl={newThumbnailUrl}
              setNewThumbnailUrl={setNewThumbnailUrl}
              creating={creating}
              handleCreate={handleCreate}
              handleDelete={handleDelete}
              backPath={backPath}
              language={language}
            />
          </div>
        </main>
      </div>
    );
  }

  // Regular user — standalone page
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      <header className="border-b border-border/50 sticky top-0 z-50 bg-gradient-to-r from-background/90 to-card/90 backdrop-blur-xl">
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
      <div className="container mx-auto px-3 sm:px-6 py-6 max-w-4xl">
        <VaultContent
          templates={templates}
          loadingTemplates={loadingTemplates}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
            newUrl={newUrl}
            setNewUrl={setNewUrl}
            newName={newName}
            setNewName={setNewName}
            newThumbnailUrl={newThumbnailUrl}
            setNewThumbnailUrl={setNewThumbnailUrl}
            creating={creating}
            handleCreate={handleCreate}
            handleDelete={handleDelete}
            backPath={backPath}
            language={language}
        />
      </div>
    </div>
  );
}

// ===================== VAULT CONTENT (shared) =====================

interface VaultContentProps {
  templates: VaultTemplate[];
  loadingTemplates: boolean;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  newUrl: string;
  setNewUrl: (v: string) => void;
  newName: string;
  setNewName: (v: string) => void;
  newThumbnailUrl: string;
  setNewThumbnailUrl: (v: string) => void;
  creating: boolean;
  handleCreate: () => void;
  handleDelete: (id: string) => void;
  backPath: string;
  language: "en" | "es";
}

function VaultContent({
  templates, loadingTemplates, showCreate, setShowCreate,
  newUrl, setNewUrl, newName, setNewName, newThumbnailUrl, setNewThumbnailUrl,
  creating, handleCreate, handleDelete,
  backPath, language,
}: VaultContentProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link to={backPath} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {tr({ en: "Go Back", es: "Volver" }, language)}
        </Link>
        <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Archive className="w-5 h-5 text-primary" />
            Vault
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {tr({ en: "Save viral video structures as reusable templates", es: "Guarda estructuras de videos virales como plantillas reutilizables" }, language)}
          </p>
        </div>
        <Button variant="cta" size="sm" className="gap-2" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreate
            ? tr({ en: "Cancel", es: "Cancelar" }, language)
            : tr({ en: "New Template", es: "Nueva Plantilla" }, language)}
        </Button>
      </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              {tr({ en: "Paste a video URL to transcribe and templatize", es: "Pega una URL de video para transcribir y templatizar" }, language)}
            </p>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder={tr({ en: "Video URL (TikTok, Instagram, YouTube...)", es: "URL del video (TikTok, Instagram, YouTube...)" }, language)}
              className="text-sm"
            />
             <Input
               value={newName}
               onChange={(e) => setNewName(e.target.value)}
               placeholder={tr({ en: "Template name (optional)", es: "Nombre de la plantilla (opcional)" }, language)}
               className="text-sm"
             />
             <Input
               value={newThumbnailUrl}
               onChange={(e) => setNewThumbnailUrl(e.target.value)}
               placeholder={tr({ en: "Thumbnail image URL (optional)", es: "URL de imagen miniatura (opcional)" }, language)}
               className="text-sm"
            />
            <Button
              variant="cta"
              onClick={handleCreate}
              disabled={creating || !newUrl.trim()}
              className="gap-2 w-full"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {creating
                ? tr({ en: "Transcribing & Analyzing...", es: "Transcribiendo y Analizando..." }, language)
                : tr({ en: "Transcribe & Templatize", es: "Transcribir y Templatizar" }, language)}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Template list */}
      {loadingTemplates ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16">
          <Archive className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {tr({ en: "No templates yet. Create one from a viral video!", es: "No hay plantillas aún. ¡Crea una desde un video viral!" }, language)}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {templates.map((tpl) => (
            <VaultTemplateCard
              key={tpl.id}
              tpl={tpl}
              language={language}
              handleDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== VAULT TEMPLATE CARD =====================

function VaultTemplateCard({
  tpl,
  language,
  handleDelete,
}: {
  tpl: VaultTemplate;
  language: "en" | "es";
  handleDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const thumbnail = (tpl as any).thumbnail_url || null;

  const lines = useMemo(() => {
    if (!tpl.template_lines) return [];
    if (Array.isArray(tpl.template_lines)) return tpl.template_lines;
    return [];
  }, [tpl.template_lines]);

  const previewLines = lines.slice(0, 3);
  const hasMore = lines.length > 3;

  return (
    <Card className="group hover:border-primary/30 transition-colors overflow-hidden flex flex-col">
      {/* Thumbnail area */}
      <div className="relative aspect-[9/16] max-h-[220px] bg-muted/30 overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={tpl.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/20">
            <Archive className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
        {tpl.source_url && (
          <a
            href={tpl.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 text-foreground ml-0.5" fill="currentColor" />
            </div>
          </a>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-white hover:text-destructive bg-black/40 hover:bg-black/60 h-7 w-7 p-0 rounded-full"
          onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Content area */}
      <CardContent className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-foreground truncate">{tpl.name}</h3>

        {/* Script preview */}
        {previewLines.length > 0 && (
          <div className="mt-2 space-y-1">
            {previewLines.map((line: any, i: number) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                <span className="text-[9px] font-medium uppercase tracking-wider text-primary/70 bg-primary/5 px-1 py-0.5 rounded shrink-0">
                  {line.section || line.line_type || "Line"}
                </span>
                <span className="text-muted-foreground line-clamp-1">{line.text}</span>
              </div>
            ))}
            {hasMore && !expanded && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] text-primary hover:text-primary h-6 px-1.5 gap-1"
                onClick={() => setExpanded(true)}
              >
                <ChevronDown className="w-3 h-3" />
                {tr({ en: "More", es: "Más" }, language)}
              </Button>
            )}
            {expanded && (
              <div className="space-y-1 border-t border-border/50 pt-1.5">
                {lines.slice(3).map((line: any, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-primary/70 bg-primary/5 px-1 py-0.5 rounded shrink-0">
                      {line.section || line.line_type || "Line"}
                    </span>
                    <span className="text-muted-foreground">{line.text}</span>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[11px] text-primary hover:text-primary h-6 px-1.5 gap-1"
                  onClick={() => setExpanded(false)}
                >
                  <ChevronUp className="w-3 h-3" />
                  {tr({ en: "Collapse", es: "Colapsar" }, language)}
                </Button>
              </div>
            )}
          </div>
        )}

        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-auto pt-2">
          <CalendarDays className="w-3 h-3" />
          {new Date(tpl.created_at).toLocaleDateString()}
        </span>
      </CardContent>
    </Card>
  );
}
