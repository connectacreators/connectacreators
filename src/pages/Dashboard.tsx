// src/pages/Dashboard.tsx
//
// Dashboard — adapts to the user's role:
//
//   1) ADMIN / agency operator (manages multiple clients)
//      - Agency triage view: per-client blocks listing the rows that need
//        attention (scripts to review, videos in revision, posts scheduled,
//        pipeline gaps). Empty roster collapses gracefully.
//      - Client-scoped (?client=X): breadcrumb + Robby's read + tool folders
//        (preserved from the previous design).
//
//   2) CONNECTA PLUS / SUBSCRIBER (single-brand end user, e.g. Dr Calvin)
//      - No multi-client roster.
//      - Always scoped to their own client (auto-resolved via subscriber_clients).
//      - Greeting + 6 prompts + tool folders (scoped to their brand).
//
// Spec: docs/superpowers/specs/2026-05-15-agency-dashboard-redesign-design.md

import { useMemo, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanion } from "@/contexts/CompanionContext";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2 } from "lucide-react";

import { useViewMode } from "@/hooks/useViewMode";
import { useDashboardPendingItems } from "@/hooks/useDashboardPendingItems";
import { ActiveClientBreadcrumb } from "@/components/dashboard/ActiveClientBreadcrumb";
import { RobbyInsightRow } from "@/components/dashboard/RobbyInsightRow";
import { getRobbyInsights } from "@/components/dashboard/getRobbyInsights";
import { ToolFolders } from "@/components/dashboard/ToolFolders";
import { SingleBrandDashboard } from "@/components/dashboard/SingleBrandDashboard";

// Triage view
import { useTriageClients } from "@/hooks/useTriageClients";
import { useTriageRows } from "@/hooks/useTriageRows";
import { useClientProfilePics } from "@/hooks/useClientProfilePics";
import { TriageClientBlock } from "@/components/dashboard/TriageClientBlock";
import { buildAgenda } from "@/lib/triage/buildAgenda";
import { AgendaLane } from "@/components/dashboard/AgendaLane";
import { MasterViewToggle, useMasterView } from "@/components/dashboard/MasterViewToggle";

interface Client {
  id: string;
  name: string;
}

// ── Greeting cache ──────────────────────────────────────────────
// The dashboard greeting ("Hi {brand}") needs the resolved client name, but
// that name only arrives after an async Supabase round-trip — so on refresh
// the greeting briefly flashes the firstName fallback ("Hi info") before
// swapping to the brand. We cache the last-resolved roster/ownClient in
// localStorage and hydrate React state from it synchronously on mount, so the
// correct name paints on the first frame. The live fetch then refreshes it.
const CACHE_KEY = "dashboard_client_cache";

interface DashboardCache {
  userId: string;
  clients: Client[];
  ownClient: Client | null;
}

function readDashboardCache(): DashboardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DashboardCache) : null;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const { user, loading: authLoading, isAdmin, isConnectaPlus, isUser } = useAuth();
  const [searchParams] = useSearchParams();
  const { setIsOpen: setDrawerOpen } = useCompanion();

  const activeClientId = searchParams.get("client");
  const viewMode = useViewMode();

  // Single-brand role: doesn't manage other clients, just sees their own
  const isSingleBrand = isConnectaPlus || (isUser && !isAdmin);

  // Hydrate from cache synchronously so the greeting paints the right name on
  // the first frame instead of flashing the firstName fallback.
  const cachedDashboard = readDashboardCache();
  const [clients, setClients] = useState<Client[]>(cachedDashboard?.clients ?? []);
  const [, setClientsLoading] = useState(true);
  const [ownClient, setOwnClient] = useState<Client | null>(cachedDashboard?.ownClient ?? null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setClientsLoading(true);

    // If the cache belongs to a different account (same device, switched login),
    // drop it so the previous brand can't linger while the fresh fetch runs.
    const cached = readDashboardCache();
    if (cached && cached.userId !== user.id) {
      setClients([]);
      setOwnClient(null);
    }

    // Single-brand users: fetch ONLY their own client (no roster)
    if (isSingleBrand) {
      supabase
        .from("subscriber_clients")
        .select("client_id, is_primary, clients(id, name)")
        .eq("subscriber_user_id", user.id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          const c = (data as any)?.clients ?? null;
          if (c) {
            setOwnClient({ id: c.id, name: c.name });
          } else {
            // Fallback: direct user_id lookup on clients
            supabase
              .from("clients")
              .select("id, name")
              .eq("user_id", user.id)
              .maybeSingle()
              .then(({ data: fb }) => {
                if (cancelled) return;
                if (fb) setOwnClient(fb as Client);
                setClientsLoading(false);
              });
            return;
          }
          setClientsLoading(false);
        });
      return () => { cancelled = true; };
    }

    // Admin/agency: fetch all clients (still needed for the drilldown branch
    // so we can resolve ?client=<id> → client name).
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[Dashboard] failed to load clients:", error);
          setClients([]);
        } else {
          setClients((data ?? []) as Client[]);
        }
        setClientsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, isSingleBrand]);

  // Admin "Me" mode: resolve the admin's own client so the dropdown's "Me"
  // selection can mirror their own brand dashboard. (Single-brand users
  // already get ownClient from the effect above.)
  useEffect(() => {
    if (!user || isSingleBrand) return;
    let cancelled = false;
    supabase
      .from("subscriber_clients")
      .select("client_id, clients(id, name)")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const c = (data as any)?.clients ?? null;
        if (c) {
          setOwnClient({ id: c.id, name: c.name });
          return;
        }
        supabase
          .from("clients")
          .select("id, name")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data: fb }) => {
            if (!cancelled && fb) setOwnClient(fb as Client);
          });
      });
    return () => { cancelled = true; };
  }, [user, isSingleBrand]);

  // Persist the resolved roster/ownClient so the next refresh hydrates instantly.
  useEffect(() => {
    if (!user) return;
    if (clients.length === 0 && !ownClient) return;
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ userId: user.id, clients, ownClient } satisfies DashboardCache),
      );
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [user, clients, ownClient]);

  const clientIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const { data: pendingByClient } = useDashboardPendingItems(clientIds);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? null,
    [clients, activeClientId],
  );

  // The client the sidebar dropdown currently points at:
  //   "master" → null (agency roster), "me" → admin's own client,
  //   else a specific client UUID. Used to mirror that client's dashboard.
  const selectedClientId =
    viewMode === "master" ? null
    : viewMode === "me" ? (ownClient?.id ?? null)
    : viewMode;

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    if (ownClient?.id === selectedClientId) return ownClient;
    return clients.find((c) => c.id === selectedClientId) ?? null;
  }, [selectedClientId, clients, ownClient]);

  const onInsightClick = (insightPrompt: string) => {
    (window as any).__companionPendingPrompt = insightPrompt;
    setDrawerOpen(true);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "hsl(var(--ink-on-cream) / 0.40)" }} />
      </div>
    );
  }
  if (!user) return <ScriptsLogin />;

  const firstName =
    ((user.user_metadata?.first_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "there");

  // ───────────────────────────────────────────────────────────────
  // SINGLE-BRAND VIEW (unchanged)
  // ───────────────────────────────────────────────────────────────
  if (isSingleBrand) {
    return (
      <SingleBrandDashboard
        firstName={firstName}
        brandName={ownClient?.name ?? null}
        clientId={ownClient?.id ?? null}
      />
    );
  }

  // ───────────────────────────────────────────────────────────────
  // ADMIN / AGENCY DRILLDOWN — preserved
  // ───────────────────────────────────────────────────────────────
  if (activeClient) {
    return (
      <div className="min-h-screen" style={{ background: "hsl(var(--cream))", padding: "22px 28px" }}>
        <ActiveClientBreadcrumb clientName={activeClient.name} />
        <h1
          style={{
            fontSize: 26,
            fontWeight: 500,
            color: "hsl(var(--ink-on-cream))",
            letterSpacing: "-0.01em",
            marginBottom: 14,
            fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
          }}
        >
          Robby's read on {activeClient.name}
        </h1>
        {getRobbyInsights(activeClient.name, pendingByClient[activeClient.id] ?? []).map((ins) => (
          <RobbyInsightRow
            key={ins.id}
            icon={ins.icon}
            text={ins.text}
            actionLabel={ins.actionLabel}
            onClick={() => onInsightClick(ins.prompt)}
          />
        ))}
        <ToolFolders activeClientId={activeClient.id} />
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────
  // ADMIN ACTING AS A SELECTED CLIENT — mirror their 3-card dashboard
  // (dropdown set to "Me" or a specific client). Only "Master" shows triage.
  // ───────────────────────────────────────────────────────────────
  if (selectedClient) {
    return (
      <SingleBrandDashboard
        firstName={firstName}
        brandName={selectedClient.name}
        clientId={selectedClient.id}
      />
    );
  }

  // ───────────────────────────────────────────────────────────────
  // ADMIN / AGENCY TRIAGE VIEW
  // ───────────────────────────────────────────────────────────────
  return <AdminTriageView firstName={firstName} />;
}

// ----------------------------------------------------------------
// AdminTriageView
// ----------------------------------------------------------------

function AdminTriageView({ firstName }: { firstName: string }) {
  const { clients: triageClients, loading: clientsLoading } = useTriageClients();
  const clientIds = useMemo(() => triageClients.map((c) => c.id), [triageClients]);
  const { data: rowsByClient, loading: rowsLoading } = useTriageRows(clientIds);
  const profilePics = useClientProfilePics(clientIds);
  const [view, setView] = useMasterView();
  const agenda = useMemo(
    () => buildAgenda(triageClients, rowsByClient),
    [triageClients, rowsByClient],
  );

  const blocks = useMemo(() => {
    const list = triageClients
      .map((c) => ({ client: c, rows: rowsByClient[c.id] ?? [] }))
      .filter((b) => b.rows.length > 0);

    // Sort: any pipeline row today OR a post scheduled today first; then by total rows desc; then alpha.
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(24, 0, 0, 0);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    function hasToday(rows: typeof list[number]['rows']): boolean {
      for (const r of rows) {
        if (r.type === 'pipeline') {
          const t = new Date(r.at).getTime();
          if (t >= startOfToday.getTime() && t < startOfTomorrow.getTime()) return true;
        } else if (r.type === 'posts_scheduled') {
          const t = new Date(r.nextAt).getTime();
          if (t >= startOfToday.getTime() && t < startOfTomorrow.getTime()) return true;
        }
      }
      return false;
    }

    return list.sort((a, b) => {
      const aToday = hasToday(a.rows);
      const bToday = hasToday(b.rows);
      if (aToday !== bToday) return aToday ? -1 : 1;
      if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
      return a.client.name.localeCompare(b.client.name);
    });
  }, [triageClients, rowsByClient]);

  const totalClients = triageClients.length;
  const pendingCount = blocks.length;
  const loading = clientsLoading || rowsLoading;

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div
      className="relative"
      style={{
        minHeight: "100%",
        background:
          "radial-gradient(1100px 600px at 50% -200px, rgba(197,136,47,0.12), hsl(var(--bone) / 0) 60%), hsl(var(--cream))",
        padding: "40px 28px 64px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <MasterViewToggle view={view} onChange={setView} />
        </div>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontSize: 11,
              color: "hsl(var(--ink-on-cream) / 0.45)",
              marginBottom: 12,
              fontFamily: "var(--font-body, Figtree), sans-serif",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {today}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.04 }}
            style={{
              fontSize: 14,
              color: "hsl(var(--ink-on-cream) / 0.6)",
              marginBottom: 4,
              fontFamily: "var(--font-body, Figtree), sans-serif",
            }}
          >
            Hey {firstName}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.08 }}
            style={{
              fontSize: 42,
              fontWeight: 500,
              color: "hsl(var(--ink-on-cream))",
              letterSpacing: "-0.02em",
              marginBottom: 10,
              fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
              lineHeight: 1.1,
            }}
          >
            What do you want to do today?
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.14 }}
            style={{ fontSize: 13, color: "hsl(var(--ink-on-cream) / 0.55)", fontFamily: "var(--font-body, Figtree), sans-serif" }}
          >
            {loading
              ? "Loading…"
              : totalClients === 0
                ? "No Connecta Plus clients yet."
                : pendingCount === 0
                  ? `All caught up across ${totalClients} Connecta Plus client${totalClients === 1 ? "" : "s"}.`
                  : `${pendingCount} of ${totalClients} client${totalClients === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} you today.`}
          </motion.p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "hsl(var(--ink-on-cream) / 0.40)" }} />
          </div>
        ) : pendingCount === 0 && totalClients > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.18 }}
            style={{
              textAlign: "center",
              padding: "48px 32px",
              background: "rgba(255,255,255,0.45)",
              border: "1px solid hsl(var(--ink-on-cream) / 0.07)",
              borderRadius: 20,
              backdropFilter: "blur(6px)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                background: "rgba(74,149,136,0.18)",
                color: "#2F6B62",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                marginBottom: 12,
              }}
            >
              ✓
            </div>
            <p
              style={{
                fontSize: 22,
                fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                color: "hsl(var(--ink-on-cream))",
                marginBottom: 4,
                letterSpacing: "-0.01em",
              }}
            >
              Nothing on fire.
            </p>
            <p style={{ fontSize: 13, color: "hsl(var(--ink-on-cream) / 0.55)", fontFamily: "var(--font-body, Figtree), sans-serif" }}>
              Take a breath, or get ahead on next week's content.
            </p>
          </motion.div>
        ) : view === "tasks" ? (
          <div>
            {agenda.map((lane) => (
              <AgendaLane key={lane.key} lane={lane} picByClient={profilePics} />
            ))}
          </div>
        ) : (
          <div>
            {blocks.map((b, idx) => (
              <motion.div
                key={b.client.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.18 + idx * 0.06 }}
              >
                <TriageClientBlock client={b.client} rows={b.rows} picUrl={profilePics[b.client.id]} />
              </motion.div>
            ))}

            {totalClients === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.18 }}
                style={{
                  textAlign: "center",
                  padding: "36px 32px",
                  background: "rgba(255,255,255,0.45)",
                  border: "1px dashed hsl(var(--ink-on-cream) / 0.18)",
                  borderRadius: 20,
                }}
              >
                <p style={{ fontSize: 14, color: "hsl(var(--ink-on-cream) / 0.6)", fontFamily: "var(--font-body, Figtree), sans-serif", marginBottom: 8 }}>
                  No Connecta Plus clients yet.
                </p>
                <a
                  href="/clients"
                  style={{
                    fontSize: 13,
                    color: "hsl(var(--ink-on-cream))",
                    textDecoration: "underline",
                    fontFamily: "var(--font-body, Figtree), sans-serif",
                  }}
                >
                  Add your first client →
                </a>
              </motion.div>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 36 }}>
          <a
            href="/clients"
            style={{
              fontSize: 11.5,
              color: "hsl(var(--ink-on-cream) / 0.45)",
              fontFamily: "var(--font-body, Figtree), sans-serif",
              letterSpacing: "0.06em",
              textDecoration: "none",
              borderBottom: "1px solid hsl(var(--ink-on-cream) / 0.15)",
              paddingBottom: 1,
            }}
          >
            View all clients
          </a>
        </div>
      </div>
    </div>
  );
}
