import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useLanguage } from "@/hooks/useLanguage";
import { tr } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/lib/getAuthToken";
import { toast } from "sonner";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ArrowLeft, Plus, Trash2, Archive, Link2, Sparkles, X,
  TrendingUp, Eye, Zap, Flame, Play, ExternalLink,
  Folder, FolderPlus, Search, MoreHorizontal, Pencil, Check, ChevronRight, FolderInput,
} from "lucide-react";
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useVaultFolders, moveSavedToFolder, type VaultFolder } from "@/hooks/useVaultFolders";
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable,
  pointerWithin, type DragEndEvent,
} from "@dnd-kit/core";
import {
  fmtViews,
  fmtOutlier,
  timeAgo,
  proxyImg,
  getOutlierColor,
  viralBadgeClass,
  getViewsColor,
  getEngagementColor,
  gridGradientFor,
  PLATFORM_ICON,
} from "@/lib/viral-card-utils";

// ===================== TYPES =====================

interface ViralVideoLite {
  id: string;
  channel_username: string;
  platform: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string | null;
  scraped_at: string;
  analysis_status: "pending" | "analyzing" | "analyzed" | "failed" | null;
}

interface SavedEntry {
  id: string;
  client_id: string;
  saved_at: string;
  folder_id: string | null;
  viral_video: ViralVideoLite | null;
  clients?: { id: string; name: string } | null;
}

// ===================== SKELETON =====================

function VaultSkeleton() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="rounded-xl" style={{ aspectRatio: "4/5" }} />
        ))}
      </div>
    </div>
  );
}

// ===================== PAGE =====================

export default function Vault() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const { clients, loading: clientsLoading } = useClients(!!user);
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { showOutOfCreditsModal } = useOutOfCredits();

  const isStaff = isAdmin || isVideographer;
  const isMasterMode = isAdmin && !urlClientId;

  const [entries, setEntries] = useState<SavedEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Master vault: client filter state
  const [filterClientId, setFilterClientId] = useState<string | null>(null);
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);

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

  const fetchEntries = useCallback(async () => {
    setLoadingEntries(true);
    if (isMasterMode) {
      let query = supabase
        .from("saved_videos")
        .select("id, client_id, saved_at, folder_id, viral_video:viral_videos(id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at, analysis_status), clients(id, name)")
        .order("saved_at", { ascending: false });
      if (filterClientId) query = query.eq("client_id", filterClientId);
      const { data, error } = await query;
      if (error) console.error(error);
      setEntries((data as unknown as SavedEntry[]) || []);
      setLoadingEntries(false);
      return;
    }
    if (!resolvedClientId) { setLoadingEntries(false); return; }
    const { data, error } = await supabase
      .from("saved_videos")
      .select("id, client_id, saved_at, folder_id, viral_video:viral_videos(id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at, analysis_status)")
      .eq("client_id", resolvedClientId)
      .order("saved_at", { ascending: false });
    if (error) console.error(error);
    setEntries((data as unknown as SavedEntry[]) || []);
    setLoadingEntries(false);
  }, [resolvedClientId, isMasterMode, filterClientId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handlePasteUrl = async () => {
    if (!newUrl.trim()) return;
    if (!resolvedClientId) {
      toast.error(tr({ en: "Open Vault from a client to add videos.", es: "Abre el Vault desde un cliente para agregar videos." }, language));
      return;
    }
    setCreating(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-framework-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: newUrl.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.insufficient_credits) {
          showOutOfCreditsModal();
          setCreating(false);
          return;
        }
        // Even if analysis failed, a row may have been inserted — still save the bookmark.
        if (!data.id) {
          throw new Error(data.error || "Failed to add video");
        }
        toast.warning(tr({ en: `Saved — analysis failed, retry on the detail page`, es: `Guardado — falló el análisis, reintenta en el detalle` }, language));
      }

      const viralVideoId = data.id as string | undefined;
      if (!viralVideoId) throw new Error("Missing video id in response");

      // Insert (or no-op) the saved_videos row.
      const { error: saveErr } = await supabase
        .from("saved_videos")
        .upsert(
          { client_id: resolvedClientId, viral_video_id: viralVideoId, saved_by: user?.id ?? null },
          { onConflict: "client_id,viral_video_id", ignoreDuplicates: true }
        );
      if (saveErr) throw saveErr;

      // Toast based on scrape status, fallback to generic.
      const status = data.status as string | undefined;
      if (status === "already_analyzed" || status === "raced_existing") {
        toast.success(tr({ en: `Saved — @${data.channel_username}`, es: `Guardado — @${data.channel_username}` }, language));
      } else if (status === "analyzed_existing") {
        toast.success(tr({ en: `Saved & analyzed — @${data.channel_username}`, es: `Guardado y analizado — @${data.channel_username}` }, language));
      } else if (res.ok) {
        toast.success(tr({ en: `Saved & analyzed — @${data.channel_username}`, es: `Guardado y analizado — @${data.channel_username}` }, language));
      }

      setShowCreate(false);
      setNewUrl("");
      fetchEntries();
    } catch (e: any) {
      toast.error(e.message || "Error saving video");
    } finally {
      setCreating(false);
    }
  };

  const handleUnsave = async (id: string) => {
    if (!confirm(tr({ en: "Remove from Vault?", es: "¿Eliminar del Vault?" }, language))) return;
    const { error } = await supabase.from("saved_videos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast.success(tr({ en: "Removed from Vault", es: "Eliminado del Vault" }, language));
  };

  // Folders are per-client — only available once a specific client is resolved
  // (a folder needs an owner; master "All Clients" shows a flat grid).
  const folderClientId = resolvedClientId ?? null;
  const { folders, createFolder, renameFolder, deleteFolder } = useVaultFolders(folderClientId);

  const handleMoveToFolder = useCallback(async (savedIds: string[], folderId: string | null) => {
    setEntries((prev) => prev.map((e) => (savedIds.includes(e.id) ? { ...e, folder_id: folderId } : e)));
    await moveSavedToFolder(savedIds, folderId);
  }, []);

  const folderProps = {
    foldersEnabled: !!folderClientId,
    folders,
    onCreateFolder: createFolder,
    onRenameFolder: renameFolder,
    onDeleteFolder: deleteFolder,
    onMoveToFolder: handleMoveToFolder,
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

  // Staff layout (sidebar provided by DashboardLayout)
  if (isStaff) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
          <VaultContent
            entries={entries}
            loadingEntries={loadingEntries}
            hasClientId={!!resolvedClientId}
            showCreate={showCreate}
            setShowCreate={setShowCreate}
            newUrl={newUrl}
            setNewUrl={setNewUrl}
            creating={creating}
            handlePasteUrl={handlePasteUrl}
            handleUnsave={handleUnsave}
            language={language}
            isMasterMode={isMasterMode}
            allClients={allClients}
            filterClientId={filterClientId}
            onFilterClient={setFilterClientId}
            {...folderProps}
          />
        </div>
      </PageTransition>
    );
  }

  // Regular user — standalone page
  return (
    <PageTransition className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background">
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
          entries={entries}
          loadingEntries={loadingEntries}
          hasClientId={!!resolvedClientId}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          newUrl={newUrl}
          setNewUrl={setNewUrl}
          creating={creating}
          handlePasteUrl={handlePasteUrl}
          handleUnsave={handleUnsave}
          language={language}
          {...folderProps}
        />
      </div>
    </PageTransition>
  );
}

// ===================== VAULT CONTENT (shared) =====================

// ===================== FOLDER UI =====================

// Drop target wrapper — highlights when a video card hovers over it.
function DroppableVaultFolder({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `vfolder-${id}` });
  return (
    <div ref={setNodeRef} className={cn("rounded-lg transition-all", isOver && "ring-2 ring-primary ring-offset-1 ring-offset-background scale-[1.03]")}>
      {children}
    </div>
  );
}

function FolderChip({ label, count, active, onOpen, menu }: {
  label: string; count: number; active: boolean; onOpen: () => void; menu?: React.ReactNode;
}) {
  return (
    <div className={cn("group flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-lg border text-xs font-medium transition-colors",
      active ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border")}>
      <button onClick={onOpen} className="flex items-center gap-1.5">
        <Folder className={cn("w-3.5 h-3.5", active ? "text-primary" : "")} />
        <span className="max-w-[130px] truncate">{label}</span>
        <span className="text-[10px] tabular-nums opacity-60">{count}</span>
      </button>
      {menu}
    </div>
  );
}

function FolderChipMenu({ onRename, onDelete, labels }: {
  onRename: () => void; onDelete: () => void; labels: { rename: string; del: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} className="p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity" aria-label="Folder menu">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="end" onClick={(e) => e.stopPropagation()}>
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-colors" onClick={() => { setOpen(false); onRename(); }}>
          <Pencil className="w-4 h-4" /> {labels.rename}
        </button>
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors" onClick={() => { setOpen(false); onDelete(); }}>
          <Trash2 className="w-4 h-4" /> {labels.del}
        </button>
      </PopoverContent>
    </Popover>
  );
}

interface VaultContentProps {
  entries: SavedEntry[];
  loadingEntries: boolean;
  hasClientId: boolean;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  newUrl: string;
  setNewUrl: (v: string) => void;
  creating: boolean;
  handlePasteUrl: () => void;
  handleUnsave: (id: string) => void;
  language: "en" | "es";
  isMasterMode?: boolean;
  allClients?: { id: string; name: string }[];
  filterClientId?: string | null;
  onFilterClient?: (id: string | null) => void;
  // Folders
  foldersEnabled: boolean;
  folders: VaultFolder[];
  onCreateFolder: (name: string) => Promise<string | null>;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveToFolder: (savedIds: string[], folderId: string | null) => void;
}

type SortKey = "recent" | "views" | "outlier";

function VaultContent({
  entries, loadingEntries, hasClientId, showCreate, setShowCreate,
  newUrl, setNewUrl, creating, handlePasteUrl, handleUnsave,
  language, isMasterMode, allClients, filterClientId, onFilterClient,
  foldersEnabled, folders, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveToFolder,
}: VaultContentProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  // null = All, "unfiled" = no folder, else a folder id.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  // Select-all runs once per rename session (see the Scripts fix).
  const renameSelectedOnce = useRef<string | null>(null);

  // Per-folder counts (of non-stale saves).
  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    let unfiled = 0;
    for (const e of entries) {
      if (e.folder_id) m.set(e.folder_id, (m.get(e.folder_id) ?? 0) + 1);
      else unfiled++;
    }
    return { m, unfiled };
  }, [entries]);

  // Folder filter → search → sort.
  const visibleEntries = useMemo(() => {
    let list = entries;
    if (activeFolder === "unfiled") list = list.filter((e) => !e.folder_id);
    else if (activeFolder) list = list.filter((e) => e.folder_id === activeFolder);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => {
      const v = e.viral_video;
      return (v?.caption?.toLowerCase().includes(q) || v?.channel_username?.toLowerCase().includes(q));
    });
    const sorted = [...list];
    if (sort === "views") sorted.sort((a, b) => (b.viral_video?.views_count ?? 0) - (a.viral_video?.views_count ?? 0));
    else if (sort === "outlier") sorted.sort((a, b) => (b.viral_video?.outlier_score ?? 0) - (a.viral_video?.outlier_score ?? 0));
    // "recent" keeps the saved_at DESC order from the query.
    return sorted;
  }, [entries, activeFolder, search, sort]);

  const stats = useMemo(() => {
    let analyzed = 0, pending = 0;
    entries.forEach((e) => {
      const s = e.viral_video?.analysis_status;
      if (s === "analyzed") analyzed++;
      else if (s === "analyzing" || s === "pending") pending++;
    });
    return { saved: entries.length, analyzed, pending };
  }, [entries]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
  );
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const savedId = String(active.id).replace("card-", "");
    if (overId.startsWith("vfolder-")) {
      const folderId = overId.replace("vfolder-", "");
      onMoveToFolder([savedId], folderId === "unfiled" ? null : folderId);
    }
  };

  const commitCreateFolder = async () => {
    const name = newFolderName.trim();
    setCreatingFolder(false);
    setNewFolderName("");
    if (name) await onCreateFolder(name);
  };
  const startRename = (f: VaultFolder) => {
    renameSelectedOnce.current = null;
    setFolderRenameValue(f.name);
    setRenamingFolderId(f.id);
  };
  const commitRename = () => {
    const id = renamingFolderId;
    setRenamingFolderId(null);
    if (id && folderRenameValue.trim()) onRenameFolder(id, folderRenameValue.trim());
  };

  const activeFolderName = activeFolder && activeFolder !== "unfiled"
    ? folders.find((f) => f.id === activeFolder)?.name
    : activeFolder === "unfiled" ? tr({ en: "Unfiled", es: "Sin carpeta" }, language) : null;

  const closeDrawer = () => { setShowCreate(false); setNewUrl(""); };

  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate]);

  return (
    <div className="space-y-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-[10px] font-sans tracking-[2px] uppercase text-muted-foreground">
              {isMasterMode
                ? tr({ en: "Master Vault", es: "Vault Maestro" }, language)
                : tr({ en: "Saved Videos", es: "Videos Guardados" }, language)}
            </span>
          </div>
          <h1 className="text-2xl font-serif text-foreground leading-tight">
            {isMasterMode ? tr({ en: "Master Vault", es: "Vault Maestro" }, language) : "Vault"}
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            {isMasterMode
              ? tr({ en: "All clients' saved videos in one place", es: "Todos los videos guardados en un lugar" }, language)
              : tr({ en: "Your saved viral videos", es: "Tus videos virales guardados" }, language)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {foldersEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}
              className="h-9 px-3 gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              {tr({ en: "New Folder", es: "Nueva Carpeta" }, language)}
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            disabled={!hasClientId}
            onClick={() => setShowCreate(true)}
            className="h-9 px-4 gap-2"
            title={isMasterMode && !hasClientId ? tr({ en: "Select a client filter first", es: "Selecciona un cliente primero" }, language) : undefined}
          >
            <Plus className="w-4 h-4" />
            {tr({ en: "Add by URL", es: "Añadir por URL" }, language)}
          </Button>
        </div>
      </div>

      <DndContext sensors={dndSensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>

      {/* ── Toolbar: client filter (master) · search · sort · stats ── */}
      {entries.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {isMasterMode && allClients && allClients.length > 0 && (
            <Select value={filterClientId ?? "__all__"} onValueChange={(v) => onFilterClient?.(v === "__all__" ? null : v)}>
              <SelectTrigger className="h-8 text-xs w-44 border-border/60 bg-muted/30 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tr({ en: "All Clients", es: "Todos los Clientes" }, language)}</SelectItem>
                {allClients.map(client => (<SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
          <div className="relative flex-1 min-w-[160px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={tr({ en: "Search saved videos…", es: "Buscar videos…" }, language)}
              className="w-full h-8 pl-9 pr-8 bg-input border border-border/60 rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-muted-foreground" /></button>
            )}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 text-xs w-40 border-border/60 bg-muted/30 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{tr({ en: "Recently saved", es: "Guardado reciente" }, language)}</SelectItem>
              <SelectItem value="views">{tr({ en: "Most views", es: "Más vistas" }, language)}</SelectItem>
              <SelectItem value="outlier">{tr({ en: "Highest outlier", es: "Mayor outlier" }, language)}</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
            <span><span className="text-foreground font-semibold tabular-nums">{stats.saved}</span> {tr({ en: "saved", es: "guardados" }, language)}</span>
            <span><span className="text-primary font-semibold tabular-nums">{stats.analyzed}</span> {tr({ en: "analyzed", es: "analizados" }, language)}</span>
          </div>
        </div>
      )}

      {/* ── Folder row ── */}
      {foldersEnabled && (folders.length > 0 || creatingFolder) && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <FolderChip
            label={tr({ en: "All", es: "Todos" }, language)} count={entries.length}
            active={activeFolder === null} onOpen={() => setActiveFolder(null)}
          />
          {folderCounts.unfiled > 0 && (
            <DroppableVaultFolder id="unfiled">
              <FolderChip
                label={tr({ en: "Unfiled", es: "Sin carpeta" }, language)} count={folderCounts.unfiled}
                active={activeFolder === "unfiled"} onOpen={() => setActiveFolder("unfiled")}
              />
            </DroppableVaultFolder>
          )}
          {folders.map((f) => (
            <DroppableVaultFolder key={f.id} id={f.id}>
              {renamingFolderId === f.id ? (
                <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-primary/50 bg-card">
                  <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    autoFocus value={folderRenameValue}
                    onChange={(e) => setFolderRenameValue(e.target.value)}
                    onFocus={(e) => { if (renameSelectedOnce.current === f.id) return; renameSelectedOnce.current = f.id; e.currentTarget.select(); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(); } if (e.key === "Escape") setRenamingFolderId(null); }}
                    onBlur={commitRename}
                    className="w-28 bg-transparent text-xs text-foreground focus:outline-none"
                  />
                </div>
              ) : (
                <FolderChip
                  label={f.name} count={folderCounts.m.get(f.id) ?? 0}
                  active={activeFolder === f.id} onOpen={() => setActiveFolder(f.id)}
                  menu={
                    <FolderChipMenu
                      onRename={() => startRename(f)}
                      onDelete={() => {
                        if (confirm(tr({ en: `Delete folder "${f.name}"? Its videos stay in the Vault.`, es: `¿Eliminar la carpeta "${f.name}"? Sus videos permanecen en el Vault.` }, language))) {
                          if (activeFolder === f.id) setActiveFolder(null);
                          onDeleteFolder(f.id);
                        }
                      }}
                      labels={{ rename: tr({ en: "Rename", es: "Renombrar" }, language), del: tr({ en: "Delete", es: "Eliminar" }, language) }}
                    />
                  }
                />
              )}
            </DroppableVaultFolder>
          ))}
          {creatingFolder && (
            <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-primary/50 bg-card">
              <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCreateFolder(); } if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); } }}
                onBlur={commitCreateFolder}
                placeholder={tr({ en: "Folder name", es: "Nombre" }, language)}
                className="w-28 bg-transparent text-xs text-foreground placeholder-muted-foreground focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Breadcrumb when inside a folder ── */}
      {activeFolderName && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <button onClick={() => setActiveFolder(null)} className="hover:text-foreground transition-colors">Vault</button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{activeFolderName}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* ── Entry list ── */}
        {loadingEntries ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="rounded-xl" style={{ aspectRatio: "4/5" }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
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
                    {tr({ en: "Save a video from Viral Today, the canvas, or paste a URL to start.", es: "Guarda un video desde Viral Today, el canvas, o pega una URL para empezar." }, language)}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2 rounded-xl mx-auto" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" />
                  {tr({ en: "Add by URL", es: "Añadir por URL" }, language)}
                </Button>
              </>
            ) : (
              <div>
                <p className="text-base font-semibold text-foreground">
                  {tr({ en: "No saves yet", es: "Sin guardados aún" }, language)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {tr({ en: "Select a client filter above to add saves, or they will appear here once created.", es: "Selecciona un cliente arriba para agregar guardados." }, language)}
                </p>
              </div>
            )}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {search
              ? tr({ en: "No saved videos match your search.", es: "Ningún video coincide con tu búsqueda." }, language)
              : tr({ en: "This folder is empty. Drag videos here to add them.", es: "Esta carpeta está vacía. Arrastra videos aquí." }, language)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {visibleEntries.map((entry) => (
              <SavedVideoCard
                key={entry.id}
                entry={entry}
                language={language}
                handleUnsave={handleUnsave}
                clientName={isMasterMode ? entry.clients?.name : undefined}
                folders={foldersEnabled ? folders : undefined}
                onMoveToFolder={onMoveToFolder}
              />
            ))}
          </div>
        )}
      </div>
      </DndContext>

      {/* ── Slide-in Create Drawer ── */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.5)",
          opacity: showCreate ? 1 : 0,
          pointerEvents: showCreate ? "auto" : "none",
        }}
        onClick={closeDrawer}
      />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col bg-card border-l border-border/60 transition-transform duration-300 ease-out"
        style={{
          width: "420px",
          maxWidth: "100vw",
          transform: showCreate ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-serif text-foreground leading-tight">
                {tr({ en: "Save Video by URL", es: "Guardar Video por URL" }, language)}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr({ en: "Paste a TikTok, Instagram, or YouTube URL", es: "Pega una URL de TikTok, Instagram o YouTube" }, language)}
              </p>
            </div>
          </div>
          <button
            onClick={closeDrawer}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-muted/40 hover:bg-muted transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {tr({ en: "Video URL", es: "URL del Video" }, language)}
            </label>
            <div className="relative">
              <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={tr({ en: "TikTok, Instagram, YouTube URL...", es: "URL de TikTok, Instagram, YouTube..." }, language)}
                className="pl-10 h-11 bg-background border-border/60 focus:border-primary/60 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !creating && newUrl.trim()) handlePasteUrl();
                }}
              />
            </div>
          </div>

          {creating && (
            <div className="border border-border/60 bg-muted/30 rounded-xl p-5 text-center space-y-3">
              <Loader2 className="w-5 h-5 mx-auto animate-spin text-primary/70" />
              <p className="text-sm text-muted-foreground">
                {tr({ en: "Adding & analyzing video...", es: "Agregando y analizando video..." }, language)}
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border/40">
          <Button
            variant="default"
            onClick={handlePasteUrl}
            disabled={creating || !newUrl.trim()}
            className="w-full h-11 gap-2"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {tr({ en: "Adding & Analyzing...", es: "Agregando y Analizando..." }, language)}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {tr({ en: "Save to Vault", es: "Guardar en Vault" }, language)}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===================== SAVED VIDEO CARD =====================

function SavedVideoCard({
  entry,
  language,
  handleUnsave,
  clientName,
  folders,
  onMoveToFolder,
}: {
  entry: SavedEntry;
  language: "en" | "es";
  handleUnsave: (id: string) => void;
  clientName?: string;
  folders?: VaultFolder[];
  onMoveToFolder?: (savedIds: string[], folderId: string | null) => void;
}) {
  const navigate = useNavigate();
  const video = entry.viral_video;
  const [imgError, setImgError] = useState(false);
  // Draggable onto folder chips. Cards stay clickable — dnd-kit's 8px
  // activation distance means a click never starts a drag.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `card-${entry.id}` });

  // Stale row (viral_video deleted) — render a degraded card with just unsave.
  if (!video) {
    return (
      <div className="relative flex flex-col rounded-xl overflow-hidden bg-card border border-border opacity-60">
        <div className="aspect-[4/5] bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground">{tr({ en: "Video unavailable", es: "Video no disponible" }, language)}</span>
        </div>
        <button
          onClick={() => handleUnsave(entry.id)}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-red-600/80 transition-colors"
          title={tr({ en: "Remove from Vault", es: "Eliminar del Vault" }, language)}
        >
          <Trash2 className="w-3 h-3 text-white/80" />
        </button>
      </div>
    );
  }

  const PlatformIcon = PLATFORM_ICON[video.platform] ?? PLATFORM_ICON.instagram;
  const outlierColor = getOutlierColor(video.outlier_score);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="group relative flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        onClick={() => navigate(`/viral-today/video/${video.id}`)}
        className="block relative aspect-[4/5] bg-muted overflow-hidden cursor-pointer"
      >
        <div
          className="absolute inset-0"
          style={{ background: gridGradientFor(video.channel_username) }}
        />
        {(() => {
          const src = proxyImg(video.thumbnail_url, video.video_url);
          return !imgError && src ? (
            <img
              src={src}
              alt={video.caption?.slice(0, 60) ?? "video"}
              className="relative w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-8 h-8 text-white/60" />
            </div>
          );
        })()}

        {/* Platform badge — top left */}
        <div className="absolute top-2 left-2 z-10">
          <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10">
            <PlatformIcon className="w-3 h-3 text-white/80" />
          </div>
        </div>

        {/* Client badge (master mode) — second row down */}
        {clientName && (
          <div
            className="absolute z-10 text-[9px] font-medium px-1.5 py-0.5 rounded truncate max-w-[80%] bg-primary/15 text-primary border border-primary/25"
            style={{ top: "36px", left: "8px" }}
          >
            {clientName}
          </div>
        )}

        {/* Top right: move-to-folder · open original · unsave */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {folders && onMoveToFolder && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                  title={tr({ en: "Move to folder", es: "Mover a carpeta" }, language)}
                >
                  <FolderInput className="w-3 h-3 text-white/80" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1 max-h-64 overflow-y-auto" align="end" onClick={(e) => e.stopPropagation()}>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{tr({ en: "Move to", es: "Mover a" }, language)}</div>
                {folders.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">{tr({ en: "No folders yet", es: "Sin carpetas" }, language)}</div>
                )}
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onMoveToFolder([entry.id], f.id)}
                    className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left hover:bg-muted transition-colors",
                      entry.folder_id === f.id ? "text-primary" : "text-foreground")}
                  >
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    {entry.folder_id === f.id && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                ))}
                {entry.folder_id && (
                  <button
                    onClick={() => onMoveToFolder([entry.id], null)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left text-muted-foreground hover:bg-muted transition-colors mt-0.5 border-t border-border/40"
                  >
                    <X className="w-3.5 h-3.5 shrink-0" />
                    {tr({ en: "Remove from folder", es: "Quitar de carpeta" }, language)}
                  </button>
                )}
              </PopoverContent>
            </Popover>
          )}
          {video.video_url && (
            <a
              href={video.video_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-black/80 transition-colors"
              title={tr({ en: "Open original", es: "Abrir original" }, language)}
            >
              <ExternalLink className="w-3 h-3 text-white/80" />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleUnsave(entry.id); }}
            className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-red-600/80 transition-colors opacity-0 group-hover:opacity-100"
            title={tr({ en: "Remove from Vault", es: "Eliminar del Vault" }, language)}
          >
            <Trash2 className="w-3 h-3 text-white/80" />
          </button>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center pointer-events-none">
          <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity duration-200" />
        </div>

        {/* Bottom-right: analyze status badge */}
        <div className="absolute bottom-2 right-2 z-10">
          {video.analysis_status === "analyzed" && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/90 backdrop-blur-sm text-primary-foreground text-[10px] font-medium border border-primary/30"
              title={tr({ en: "Analyzed", es: "Analizado" }, language)}
            >
              <Sparkles className="w-3 h-3" />
              <span>{tr({ en: "Analyzed", es: "Analizado" }, language)}</span>
            </div>
          )}
          {video.analysis_status === "analyzing" && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{tr({ en: "Analyzing", es: "Analizando" }, language)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
        <p className="text-[11px] text-foreground leading-snug line-clamp-2 font-medium min-h-[2.5em]">
          {video.caption || <span className="text-muted-foreground italic">No caption</span>}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-medium">@{video.channel_username}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(entry.saved_at)}</span>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1" title="Outlier score">
            {video.outlier_score >= 15 ? (
              <Flame className="text-orange-400 w-3.5 h-3.5" />
            ) : (
              <TrendingUp className={cn("w-3 h-3", outlierColor)} />
            )}
            <span className={viralBadgeClass(video.outlier_score)}>
              {fmtOutlier(video.outlier_score)}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Views">
            <Eye className={cn("w-3 h-3", getViewsColor(video.views_count))} />
            <span className={cn("text-[10px] font-medium tabular-nums", getViewsColor(video.views_count))}>
              {fmtViews(video.views_count)}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Engagement rate">
            <Zap className={cn("w-3 h-3", getEngagementColor(video.engagement_rate))} />
            <span className={cn("text-[10px] font-medium tabular-nums", getEngagementColor(video.engagement_rate))}>
              {video.engagement_rate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
