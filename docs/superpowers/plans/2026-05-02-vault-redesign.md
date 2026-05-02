# Vault Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Vault page as a dark media library with a compact header, stats bar, 6-column portrait card grid, and a slide-in right drawer for creating templates.

**Architecture:** All changes are contained in `src/pages/Vault.tsx`. The `VaultContent` shared component gets a new header, stats bar, and grid layout. `VaultTemplateCard` becomes a portrait thumbnail card. The inline create form becomes a fixed slide-in drawer. All data fetching, edge function calls, and the detail modal are preserved unchanged.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, existing Supabase/edge function wiring

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/pages/Vault.tsx` |

---

### Task 1: Replace hero header with compact header + stats bar

**Files:**
- Modify: `src/pages/Vault.tsx`

The existing hero header (`<div className="relative overflow-hidden bg-gradient-to-br...">`) is replaced with a compact two-row header (title + button row, then stats bar). A `stats` useMemo is added to `VaultContent` to sum hook/body/CTA lines.

- [ ] **Step 1: Add `stats` useMemo inside `VaultContent`**

In `VaultContent`, after the function signature opening (line ~337 after `}: VaultContentProps) {`), add:

```tsx
  const stats = useMemo(() => {
    let hooks = 0, body = 0, ctas = 0;
    templates.forEach((t) => {
      if (!Array.isArray(t.template_lines)) return;
      t.template_lines.forEach((line: any) => {
        const s = (line.section || "").toLowerCase();
        if (s.includes("hook")) hooks++;
        else if (s.includes("cta") || s.includes("call")) ctas++;
        else body++;
      });
    });
    return { hooks, body, ctas };
  }, [templates]);
```

Note: `useMemo` is already imported at the top of the file.

- [ ] **Step 2: Replace the hero header block**

Find the entire hero header block — it starts with:
```tsx
      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-background via-primary/5 to-background border-b border-border/60 mb-8 -mx-4 sm:-mx-6 px-4 sm:px-6 py-8">
```
and ends after the closing `</div>` of the outer `<div className="relative">` wrapper (ends around line ~416 with `</div>`).

Replace the entire block with:

```tsx
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
```

- [ ] **Step 3: Remove the old count badge above the grid**

Inside `VaultContent`, in the templates-exist branch, find and delete the count badge block:
```tsx
            {/* Count badge */}
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                <Archive className="w-3 h-3" />
                {templates.length} {tr({ en: "templates", es: "plantillas" }, language)}
              </div>
              <div className="flex-1 h-px bg-border/40" />
            </div>
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Vault.tsx
git commit -m "feat(vault): compact header with stats bar"
```

---

### Task 2: Redesign VaultTemplateCard as portrait thumbnail card

**Files:**
- Modify: `src/pages/Vault.tsx` (the `VaultTemplateCard` function, lines ~593–791)

Replace the full masonry card with a compact portrait card. The modal stays completely unchanged — only the outer card shell changes.

- [ ] **Step 1: Replace the VaultTemplateCard function**

Find the line:
```tsx
function VaultTemplateCard({
```

Replace the entire `VaultTemplateCard` function (everything from that line to the final `}` at line 791) with:

```tsx
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

  const sectionConfig = {
    hook: { label: "HOOK", color: "text-[#22d3ee]", bg: "bg-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.15)]", badge: "bg-[rgba(8,145,178,0.12)] text-[#22d3ee] border-[rgba(8,145,178,0.25)]" },
    body: { label: "BODY", color: "text-[#94a3b8]",  bg: "bg-[rgba(148,163,184,0.04)] border-[rgba(148,163,184,0.12)]",   badge: "bg-[rgba(148,163,184,0.08)] text-[#94a3b8] border-[rgba(148,163,184,0.2)]" },
    cta:  { label: "CTA",  color: "text-[#a3e635]", bg: "bg-[rgba(132,204,22,0.04)] border-[rgba(132,204,22,0.12)]", badge: "bg-[rgba(132,204,22,0.08)] text-[#a3e635] border-[rgba(132,204,22,0.2)]" },
  };

  return (
    <>
      {/* Portrait card */}
      <div
        className="group relative rounded-[10px] overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform duration-200"
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

        {/* Client badge (master mode) — top left below platform */}
        {clientName && (
          <div
            className="absolute top-2 left-2 mt-5 text-[8px] font-bold px-1.5 py-0.5 rounded truncate max-w-[80%]"
            style={{ background: "rgba(8,145,178,0.25)", color: "#22d3ee", border: "1px solid rgba(8,145,178,0.3)" }}
          >
            {clientName}
          </div>
        )}

        {/* Delete button — top right, on hover */}
        <button
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
      )}
    </>
  );
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Vault.tsx
git commit -m "feat(vault): portrait thumbnail card design"
```

---

### Task 3: Replace masonry grid with 6-column CSS grid + ghost card

**Files:**
- Modify: `src/pages/Vault.tsx`

- [ ] **Step 1: Replace the masonry grid**

Find:
```tsx
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
```

Replace with:

```tsx
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
                className="rounded-[10px] flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#22d3ee]/30"
                style={{ aspectRatio: "9/14", background: "rgba(255,255,255,0.02)", border: "1.5px dashed rgba(255,255,255,0.1)" }}
              >
                <Plus className="w-4 h-4 text-[#22d3ee]/50" />
                <span className="text-[10px] font-semibold text-white/25">Add</span>
              </button>
            </div>
```

- [ ] **Step 2: Also update the VaultSkeleton to match the new grid**

Find the `VaultSkeleton` function and replace its return:

```tsx
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
```

- [ ] **Step 3: Replace loading state inside VaultContent**

Find the loading bounce-dots block:
```tsx
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
```

Replace the loading state div with the grid skeleton:
```tsx
        {loadingTemplates ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-[10px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="rounded-[10px]" style={{ aspectRatio: "9/14" }} />
            ))}
          </div>
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Vault.tsx
git commit -m "feat(vault): 6-column grid with ghost add card"
```

---

### Task 4: Replace inline create form with slide-in drawer

**Files:**
- Modify: `src/pages/Vault.tsx`

The `showCreate` state already exists and is passed into `VaultContent`. The inline form block is replaced with a fixed slide-in drawer. The `handleCreate` already calls `setShowCreate(false)` on success — the drawer closes automatically.

- [ ] **Step 1: Add Escape-key close effect inside `VaultContent`**

Inside the `VaultContent` function body, after the `stats` useMemo, add:

```tsx
  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowCreate(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showCreate, setShowCreate]);
```

Note: `useEffect` is already imported at the top of the file.

- [ ] **Step 2: Remove the inline create form block**

Find and delete the entire inline create form:
```tsx
        {/* ── Create Form ── */}
        {showCreate && (
          <div className="glass-card glass-card-cyan rounded-2xl overflow-hidden">
            ...
          </div>
        )}
```
(Delete from `{/* ── Create Form ── */}` through its closing `)}`)

- [ ] **Step 3: Add the slide-in drawer at the end of VaultContent's return**

At the very end of `VaultContent`'s return, just before the final closing `</div>` of the root `<div className="space-y-0">`, add:

```tsx
      {/* ── Slide-in Create Drawer ── */}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.5)",
          opacity: showCreate ? 1 : 0,
          pointerEvents: showCreate ? "auto" : "none",
        }}
        onClick={() => setShowCreate(false)}
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
            onClick={() => setShowCreate(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}
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
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit and push**

```bash
git add src/pages/Vault.tsx
git commit -m "feat(vault): slide-in drawer for new template creation"
git push origin main
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Vault page**

Navigate to `/vault` or `/clients/:id/vault`. Verify:
- Compact header with teal dot, "Vault" title, "+ New Template" button
- Stats bar shows template count, hook/body/CTA line totals
- 6-column portrait grid (responsive)
- Cards show thumbnail (or dark gradient fallback), platform badge, name, line count

- [ ] **Step 3: Test drawer**

Click "+ New Template" — verify:
- Right panel slides in from the right
- Dark overlay appears behind it
- Clicking the overlay closes the drawer
- Pressing Escape closes the drawer
- Filling in URL + clicking "Transcribe & Templatize" works same as before
- On success, drawer closes and new card appears in grid

- [ ] **Step 4: Test ghost card**

Click the ghost "+" card at the end of the grid — verify it also opens the drawer.

- [ ] **Step 5: Test template detail modal**

Click any card — verify the existing detail modal still opens with Hook/Body/CTA sections.
