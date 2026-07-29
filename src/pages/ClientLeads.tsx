// The client-facing leads view.
//
// Clients previously shared LeadTracker with admins — one 1706-line
// component with ~20 `isSubscriber` branches deciding what to hide. That
// makes the client experience a by-product of the admin tool rather than a
// thing designed for them: they inherited the staff filter chrome, the
// Notion-flavoured modals, and every layout decision made for someone
// managing five accounts at once.
//
// This is the opposite: read-mostly, one client, no chrome that doesn't
// earn its place. A client wants to know how many leads came in, which ones
// are booked, and how to reach them. Everything else is noise.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Calendar, Mail, Phone, Search, TrendingUp, Users, Loader2 } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { leadService } from "@/services/leadService";
import {
  statusBadgeStyle, statusSolid, canonicalizeStatus,
} from "@/lib/leads/statusTokens";
import "@/styles/surface-modern.css";

interface ClientLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  notes: string;
  createdAt: string;
  bookingDate: string;
  bookingTime: string;
  booked: boolean;
}

const BOOKED_STATUSES = new Set(["Booked", "Appointment Booked"]);
const isBooked = (l: ClientLead) =>
  l.status !== "Canceled" && (!!l.bookingDate || l.booked || BOOKED_STATUSES.has(l.status));

/** Parse a bare YYYY-MM-DD as local, not UTC, so the day never shifts back. */
function parseLocalDate(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

export default function ClientLeads() {
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const { language } = useLanguage();
  const en = language === "en";

  const [clientId, setClientId] = useState<string | null>(null);
  const [resolvingClient, setResolvingClient] = useState(true);
  const [leads, setLeads] = useState<ClientLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyBooked, setOnlyBooked] = useState(false);

  // Same resolution LeadTracker uses: the subscriber_clients junction first,
  // then a direct clients.user_id lookup for accounts predating it.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("subscriber_clients")
      .select("client_id")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.client_id) {
          setClientId(data.client_id);
          setResolvingClient(false);
          return;
        }
        supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle()
          .then(({ data: fb }) => {
            if (cancelled) return;
            setClientId(fb?.id ?? null);
            setResolvingClient(false);
          });
      });
    return () => { cancelled = true; };
  }, [user]);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await leadService.getLeadsByClient(clientId);
      setLeads(
        rows
          .map((r) => ({
            id: r.id,
            name: r.name || "",
            email: r.email || "",
            phone: r.phone || "",
            status: canonicalizeStatus(r.status) || "New Lead",
            source: r.source || "",
            notes: r.notes || "",
            createdAt: r.created_at || "",
            bookingDate: r.booking_date || "",
            bookingTime: r.booking_time || "",
            booked: !!r.booked,
          }))
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const total = leads.length;
    const booked = leads.filter(isBooked).length;
    const thisMonth = leads.filter((l) => {
      if (!l.createdAt) return false;
      const d = new Date(l.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { total, booked, thisMonth, rate: total ? Math.round((booked / total) * 100) : 0 };
  }, [leads]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (onlyBooked && !isBooked(l)) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q)
      );
    });
  }, [leads, search, onlyBooked]);

  // Staff have the full tracker; this route is only the client's view of
  // their own leads.
  if (authLoading || resolvingClient) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isAdmin || isVideographer) return <Navigate to="/leads" replace />;
  if (!clientId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {en
            ? "No client account is linked to your login yet. Please contact your team."
            : "Aún no hay una cuenta de cliente vinculada a tu acceso. Contacta a tu equipo."}
        </p>
      </div>
    );
  }

  const STAT_CARDS = [
    { label: en ? "Total leads" : "Leads totales", value: stats.total, icon: Users },
    { label: en ? "Booked" : "Agendados", value: stats.booked, icon: Calendar },
    { label: en ? "This month" : "Este mes", value: stats.thisMonth, icon: TrendingUp },
    { label: en ? "Booking rate" : "Tasa de reserva", value: `${stats.rate}%`, icon: TrendingUp },
  ];

  return (
    <PageTransition className="surface-modern flex-1 overflow-y-auto">
      <div className="container mx-auto max-w-4xl px-4 py-8 md:px-7">
        <header className="mb-8">
          <h1 className="sm-display mb-1 text-[28px] md:text-[34px]">
            {en ? "Your leads" : "Tus leads"}
          </h1>
          <p className="sm-muted text-sm">
            {en
              ? "Everyone who reached out, and where they are in the process."
              : "Todos los que se contactaron y en qué punto del proceso están."}
          </p>
        </header>

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {STAT_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="sm-card sm-rise flex flex-col gap-3 p-5"
                style={{ "--sm-delay": `${i * 60}ms` } as React.CSSProperties}
              >
                <div className="flex items-start justify-between">
                  <p className="sm-eyebrow">{card.label}</p>
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: "hsl(var(--aqua) / 0.10)", border: "1px solid hsl(var(--aqua) / 0.22)" }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: "hsl(var(--aqua))" }} />
                  </div>
                </div>
                <p
                  className="leading-none"
                  style={{
                    fontFamily: "var(--font-display, 'Inter Tight'), sans-serif",
                    fontWeight: 600,
                    fontSize: "clamp(28px, 4.5vw, 40px)",
                    letterSpacing: "-0.03em",
                    color: "hsl(var(--bone))",
                  }}
                >
                  {card.value}
                </p>
              </div>
            );
          })}
        </div>

        {/* Two controls, not a filter bar. A client with one account doesn't
            need client/source/date/sort selectors. */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="sm-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={en ? "Search by name, email or phone" : "Buscar por nombre, correo o teléfono"}
              className="border-transparent bg-[hsl(var(--bone)/0.05)] pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlyBooked((v) => !v)}
            className={`sm-btn ${onlyBooked ? "sm-btn-primary" : "sm-btn-ghost"}`}
            aria-pressed={onlyBooked}
          >
            <Calendar className="h-3.5 w-3.5" />
            {en ? "Booked only" : "Solo agendados"}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--bone) / 0.4)" }} />
          </div>
        ) : error ? (
          <div className="sm-card p-8 text-center">
            <p className="sm-muted text-sm">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="sm-card p-12 text-center">
            <p className="sm-muted text-sm">
              {leads.length === 0
                ? en ? "No leads yet. They'll appear here as they come in." : "Aún no hay leads. Aparecerán aquí conforme lleguen."
                : en ? "No leads match that search." : "Ningún lead coincide con esa búsqueda."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((lead, i) => (
              <div
                key={lead.id}
                className="sm-row sm-rise p-4"
                style={{ "--sm-delay": `${Math.min(i, 12) * 35}ms` } as React.CSSProperties}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold" style={{ color: "hsl(var(--bone))" }}>
                        {lead.name || (en ? "Unnamed lead" : "Lead sin nombre")}
                      </h3>
                      <span className="sm-pill" style={statusBadgeStyle(lead.status)}>
                        <span className="sm-pill-dot" />
                        {lead.status}
                      </span>
                    </div>
                    <div className="sm-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:underline" onClick={(e) => e.stopPropagation()}>
                          <Mail className="h-3 w-3" />
                          {lead.email}
                        </a>
                      )}
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:underline" onClick={(e) => e.stopPropagation()}>
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </a>
                      )}
                      {isBooked(lead) && lead.bookingDate ? (
                        <span className="flex items-center gap-1 font-medium" style={{ color: statusSolid("Booked") }}>
                          <Calendar className="h-3 w-3" />
                          {parseLocalDate(lead.bookingDate).toLocaleDateString(en ? "en-US" : "es-MX", {
                            month: "short", day: "numeric",
                          })}
                          {lead.bookingTime ? ` · ${lead.bookingTime}` : ""}
                        </span>
                      ) : lead.createdAt ? (
                        <span className="sm-faint flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {en ? "Came in" : "Llegó"}{" "}
                          {new Date(lead.createdAt).toLocaleDateString(en ? "en-US" : "es-MX", {
                            month: "short", day: "numeric",
                          })}
                        </span>
                      ) : null}
                    </div>
                    {lead.notes && <p className="sm-faint mt-1 line-clamp-1 text-xs">{lead.notes}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
