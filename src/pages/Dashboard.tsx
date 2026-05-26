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

import { useDashboardPendingItems } from "@/hooks/useDashboardPendingItems";
import { ActiveClientBreadcrumb } from "@/components/dashboard/ActiveClientBreadcrumb";
import { RobbyInsightRow } from "@/components/dashboard/RobbyInsightRow";
import { getRobbyInsights } from "@/components/dashboard/getRobbyInsights";
import { ToolFolders } from "@/components/dashboard/ToolFolders";
import { SingleBrandDashboard } from "@/components/dashboard/SingleBrandDashboard";

// Triage view
import { useTriageClients } from "@/hooks/useTriageClients";
import { useTriageRows } from "@/hooks/useTriageRows";
import { TriageClientBlock } from "@/components/dashboard/TriageClientBlock";

interface Client {
  id: string;
  name: string;
}

export default function Dashboard() {
  const { user, loading: authLoading, isAdmin, isConnectaPlus, isUser } = useAuth();
  const [searchParams] = useSearchParams();
  const { setIsOpen: setDrawerOpen } = useCompanion();

  const activeClientId = searchParams.get("client");

  // Single-brand role: doesn't manage other clients, just sees their own
  const isSingleBrand = isConnectaPlus || (isUser && !isAdmin);

  const [clients, setClients] = useState<Client[]>([]);
  const [, setClientsLoading] = useState(true);
  const [ownClient, setOwnClient] = useState<Client | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setClientsLoading(true);

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

  const clientIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const { data: pendingByClient } = useDashboardPendingItems(clientIds);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? null,
    [clients, activeClientId],
  );

  const onInsightClick = (insightPrompt: string) => {
    (window as any).__companionPendingPrompt = insightPrompt;
    setDrawerOpen(true);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(20,20,20,0.40)" }} />
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
      <div className="min-h-screen" style={{ background: "#EAE6DC", padding: "22px 28px" }}>
        <ActiveClientBreadcrumb clientName={activeClient.name} />
        <h1
          style={{
            fontSize: 26,
            fontWeight: 500,
            color: "#141414",
            letterSpacing: "-0.01em",
            marginBottom: 14,
            fontFamily: "'EB Garamond', Georgia, serif",
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

  return (
    <div className="min-h-screen" style={{ background: "#EAE6DC", padding: "22px 28px" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ fontSize: 13, color: "rgba(20,20,20,0.55)", marginBottom: 6, fontFamily: "Figtree, sans-serif", letterSpacing: "0.02em" }}
        >
          Hey {firstName}!
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.08 }}
          style={{ fontSize: 38, fontWeight: 500, color: "#141414", letterSpacing: "-0.015em", marginBottom: 6, fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          What do you want to do today?
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.14 }}
          style={{ fontSize: 12, color: "rgba(20,20,20,0.55)", fontFamily: "Figtree, sans-serif" }}
        >
          {loading
            ? "Loading…"
            : totalClients === 0
              ? "No Connecta Plus clients yet."
              : pendingCount === 0
                ? `All caught up across ${totalClients} Connecta Plus client${totalClients === 1 ? "" : "s"}.`
                : `${pendingCount} client${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} you today.`}
        </motion.p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(20,20,20,0.40)" }} />
        </div>
      ) : (
        <div>
          {blocks.map((b, idx) => (
            <motion.div
              key={b.client.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.18 + idx * 0.05 }}
            >
              <TriageClientBlock client={b.client} rows={b.rows} />
            </motion.div>
          ))}

          {totalClients === 0 && (
            <p
              style={{
                textAlign: "center",
                marginTop: 16,
                fontSize: 13,
                color: "rgba(20,20,20,0.55)",
                fontFamily: "Figtree, sans-serif",
              }}
            >
              <a href="/clients" style={{ color: "#141414", textDecoration: "underline" }}>Add a Connecta Plus client →</a>
            </p>
          )}

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a
              href="/clients"
              style={{ fontSize: 12, color: "rgba(20,20,20,0.45)", fontFamily: "Figtree, sans-serif" }}
            >
              View all clients
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
