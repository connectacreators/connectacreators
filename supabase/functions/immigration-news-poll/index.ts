import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =============================================================================
   immigration-news-poll — scheduled every ~10 min via pg_cron.
   Pulls official + breaking immigration news, dedupes against immigration_news,
   asks Haiku to score relevance AND extract the affected immigrant countries,
   then emails an alert for each relevant item (filtered by target countries).
   Each alert carries a "Generar ángulo de video" button that hits
   immigration-video-angle on demand. Mirrors the SMTP/Haiku/cron patterns used
   across the app (send-doctor-lead, generate-caption, auto-scrape-channels).
   ============================================================================= */

const CRON_SECRET = "connectacreators-cron-2026";
const ANGLE_TOKEN = "abg-news-angle-2026"; // guards the on-demand angle page
const MODEL = "claude-haiku-4-5-20251001";
const FUNCTIONS_BASE = "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1";

// ── CONFIG ───────────────────────────────────────────────────────────────
// Correos que reciben las alertas. Agrega el correo del abogado/cliente aquí,
// o define el secret IMMIGRATION_ALERT_TO (separado por comas) para anular.
const DEFAULT_RECIPIENTS = [
  "creatorsconnecta@gmail.com",
  // "cliente@sufirma.com",   // ← PON AQUÍ EL CORREO DEL CLIENTE
];

// Fallbacks only — the live values (editable from the Noticias page in-app,
// table immigration_news_settings) take priority. These apply only if that
// row is ever missing.
const FALLBACK_RELEVANCE_THRESHOLD = 0.75; // 0..1 — quality over quantity
const FALLBACK_TARGET_COUNTRIES: string[] = []; // empty = all countries
const FALLBACK_EXCLUDED_KEYWORDS: string[] = [];

const MAX_CANDIDATES = 40;    // cap per run
const MAX_EMAILS_PER_RUN = 8; // don't spam if a backlog appears

type Settings = { min_relevance_score: number; target_countries: string[]; excluded_keywords: string[] };
let SETTINGS: Settings = {
  min_relevance_score: FALLBACK_RELEVANCE_THRESHOLD,
  target_countries: FALLBACK_TARGET_COUNTRIES,
  excluded_keywords: FALLBACK_EXCLUDED_KEYWORDS,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Candidate = {
  source: string;
  external_id: string;
  url: string;
  title: string;
  summary: string;
  published_at: string | null;
};

// ── SOURCES ────────────────────────────────────────────────────────────────
async function fetchFederalRegister(): Promise<Candidate[]> {
  const agencies = [
    "u-s-citizenship-and-immigration-services",
    "executive-office-for-immigration-review",
    "immigration-and-customs-enforcement",
    "u-s-customs-and-border-protection",
    "homeland-security-department",
    "state-department",
  ];
  const params = new URLSearchParams();
  params.set("per_page", "20");
  params.set("order", "newest");
  ["document_number", "title", "abstract", "html_url", "publication_date", "type"].forEach((f) =>
    params.append("fields[]", f)
  );
  agencies.forEach((a) => params.append("conditions[agencies][]", a));
  // only the last few days so we don't reprocess history on first run
  const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  params.set("conditions[publication_date][gte]", since);

  try {
    const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).map((r: Record<string, unknown>) => ({
      source: "federal_register",
      external_id: String(r.document_number),
      url: String(r.html_url),
      title: String(r.title || ""),
      summary: String(r.abstract || r.type || ""),
      published_at: r.publication_date ? `${r.publication_date}T12:00:00Z` : null,
    }));
  } catch (e) {
    console.error("federal_register fetch failed:", e);
    return [];
  }
}

// Google News RSS wraps its <description> as HTML-entity-escaped markup
// (e.g. "&lt;a href=...&gt;Title&lt;/a&gt;"). Entities MUST decode before tags
// are stripped, or the escaped tags survive the strip and get resurrected as
// literal <a href="...huge-redirect-url..."> once decoded — leaking raw HTML
// (and a multi-hundred-char Google redirect URL) into the summary text.
function decodeEntities(s: string): string {
  const decoded = s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return decoded.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Minimal HTML-escape for dynamic text interpolated into email/page markup.
function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Subject headers in this codebase have never carried non-ASCII (no other
// SMTP send here uses accents/emoji in Subject) — normalize to plain ASCII so
// we never depend on denomailer's header-encoding path for the one field a
// broken encoding is most visible in the inbox list.
function asciiSafe(s: string): string {
  return (s || "").normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^\x20-\x7E]/g, "").trim();
}

async function fetchGoogleNews(): Promise<Candidate[]> {
  const feeds = [
    "https://news.google.com/rss/search?q=(inmigraci%C3%B3n%20OR%20asilo%20OR%20TPS%20OR%20USCIS%20OR%20%22green%20card%22%20OR%20parole%20OR%20deportaci%C3%B3n)%20when:2d&hl=es-419&gl=US&ceid=US:es",
    "https://news.google.com/rss/search?q=(immigration%20OR%20asylum%20OR%20TPS%20OR%20USCIS%20OR%20parole%20OR%20%22green%20card%22%20OR%20deportation)%20when:2d&hl=en-US&gl=US&ceid=US:en",
  ];
  const out: Candidate[] = [];
  for (const feed of feeds) {
    try {
      const res = await fetch(feed, { headers: { "user-agent": "Mozilla/5.0 ConnectaBot" } });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = xml.split(/<item>/).slice(1);
      for (const item of items.slice(0, 15)) {
        const pick = (tag: string) => {
          const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
          return m ? decodeEntities(m[1]) : "";
        };
        const titleRaw = pick("title");
        const link = pick("link");
        const sourceName = pick("source"); // clean <source> tag — no markup, unlike <description>
        if (!titleRaw || !link) continue;
        // Google News always appends " - Publisher" to the title; strip it
        // when it exactly matches the known source, so the title (used in
        // Subject + hero headline) doesn't duplicate the publisher.
        const title = sourceName && titleRaw.endsWith(` - ${sourceName}`)
          ? titleRaw.slice(0, -(sourceName.length + 3)).trim()
          : titleRaw;
        out.push({
          source: "google_news",
          external_id: (pick("guid") || link).slice(0, 400),
          url: link,
          title,
          summary: sourceName ? `Fuente: ${sourceName}` : "",
          published_at: pick("pubDate") ? new Date(pick("pubDate")).toISOString() : null,
        });
      }
    } catch (e) {
      console.error("google_news fetch failed:", e);
    }
  }
  return out;
}

// ── HAIKU: relevance + country extraction ───────────────────────────────────
type Scored = { i: number; relevant: boolean; score: number; reason: string; countries: string[] };

// Chunk so a big batch never overruns max_tokens (truncated JSON = silent 0s).
async function scoreWithHaiku(items: Candidate[], apiKey: string): Promise<{ scored: Scored[]; usage: { input_tokens: number; output_tokens: number } }> {
  const CHUNK = 12;
  const scored: Scored[] = [];
  let input_tokens = 0, output_tokens = 0;
  for (let start = 0; start < items.length; start += CHUNK) {
    const chunk = items.slice(start, start + CHUNK);
    const r = await scoreChunk(chunk, apiKey);
    for (const s of r.scored) scored.push({ ...s, i: s.i + start }); // remap local → global index
    input_tokens += r.usage?.input_tokens || 0;
    output_tokens += r.usage?.output_tokens || 0;
  }
  return { scored, usage: { input_tokens, output_tokens } };
}

async function scoreChunk(items: Candidate[], apiKey: string) {
  const list = items.map((c, i) => ({ i, title: c.title, summary: c.summary.slice(0, 400) }));
  const prompt = `Eres analista de contenido para un ABOGADO DE INMIGRACIÓN en EE.UU. que hace videos cortos (talking-head) para su comunidad de inmigrantes.

Para cada noticia del arreglo, decide si es un DESARROLLO REAL que un abogado debería explicar en video HOY: cambios de política o ley, fallos judiciales, nuevas fechas límite, TPS, asilo, parole, green card, redadas, decisiones de USCIS/EOIR/DHS.

BAJA prioridad (score < 0.5) aunque mencionen inmigración — NO son "desarrollos", son anuncios de servicios rutinarios sin novedad legal:
- Consulados u organizaciones ofreciendo asesoría/orientación legal gratuita, ferias, talleres, eventos comunitarios
- Piezas genéricas de "conoce tus derechos" sin un cambio o fecha límite nueva
- Perfiles de interés humano sin implicación legal para terceros
- Opinión, editoriales, o cobertura ya vieja repetida por otro medio

Devuelve SOLO un arreglo JSON, un objeto por noticia, en el MISMO orden e índice:
[{"i":0,"relevant":true,"score":0.0-1.0,"reason":"≤12 palabras en español","countries":["Venezuela"]}]

- "score": qué tan urgente/accionable es para un video (0=nada, 1=urgente/altísima). Un anuncio de servicio rutinario nunca pasa de 0.4.
- "countries": nacionalidades de inmigrantes afectadas (ej. "Venezuela","Cuba","Haití","México","Nicaragua"). Si aplica a TODOS o no es específico de un país, usa ["General"].

Noticias:
${JSON.stringify(list)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Haiku ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = (json.content?.[0]?.text || "").trim();
  const match = text.match(/\[[\s\S]*\]/);
  const scored = match ? JSON.parse(match[0]) : [];
  return { scored, usage: json.usage };
}

// ── EMAIL ────────────────────────────────────────────────────────────────
function recipients(): string[] {
  const env = Deno.env.get("IMMIGRATION_ALERT_TO");
  const list = env ? env.split(",") : DEFAULT_RECIPIENTS;
  return list.map((e) => e.trim()).filter(Boolean);
}

function passesCountryFilter(countries: string[]): boolean {
  const targets = SETTINGS.target_countries.map((c) => c.toLowerCase());
  if (targets.length === 0) return true; // no filter → all countries
  const cs = (countries || []).map((c) => c.toLowerCase());
  if (cs.some((c) => c.includes("general") || c.includes("todos") || c.includes("all"))) return true;
  return cs.some((c) => targets.some((t) => c.includes(t) || t.includes(c)));
}

// Cheap deterministic pre-filter before spending a Haiku call — skip routine
// service announcements / promos the admin has explicitly excluded by
// keyword (e.g. "asesoría gratis", "feria", "consulado móvil").
function isExcludedByKeyword(candidate: Candidate): boolean {
  const kws = SETTINGS.excluded_keywords.map((k) => k.toLowerCase()).filter(Boolean);
  if (!kws.length) return false;
  const haystack = `${candidate.title} ${candidate.summary}`.toLowerCase();
  return kws.some((k) => haystack.includes(k));
}

function alertHtml(row: {
  id: string; title: string; summary: string; url: string;
  source: string; published_at: string | null; countries: string[]; reason: string; relevance_score: number;
}): string {
  const badges = (row.countries || []).map((c) =>
    `<span style="display:inline-block;background:#E6C780;color:#2A2008;font-weight:700;font-size:12px;padding:4px 10px;border-radius:99px;margin:0 6px 6px 0">${escapeHtml(c)}</span>`
  ).join("");
  const src = row.source === "federal_register" ? "Federal Register (oficial)" : "Google News";
  const when = row.published_at ? new Date(row.published_at).toLocaleString("es-US", { timeZone: "America/Denver" }) : "—";
  const angleUrl = `${FUNCTIONS_BASE}/immigration-video-angle?id=${row.id}&t=${ANGLE_TOKEN}`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#0B0A10;color:#F4F0E8;border-radius:16px;overflow:hidden;border:1px solid rgba(244,240,232,0.1)">
  <div style="padding:22px 26px;border-bottom:1px solid rgba(244,240,232,0.1)">
    <span style="color:#E6C780;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase">🚨 Nueva noticia de inmigración</span>
  </div>
  <div style="padding:26px">
    <div style="margin-bottom:14px">${badges}</div>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${escapeHtml(row.title)}</h1>
    <p style="font-size:15px;line-height:1.6;color:rgba(244,240,232,0.72);margin:0 0 18px">${escapeHtml((row.summary || "").slice(0, 400))}</p>
    <p style="font-size:13px;color:rgba(244,240,232,0.5);margin:0 0 4px"><b style="color:#E6C780">Por qué importa:</b> ${escapeHtml(row.reason || "—")}</p>
    <p style="font-size:12px;color:rgba(244,240,232,0.4);margin:0 0 22px">${src} · ${when} · relevancia ${(row.relevance_score * 100).toFixed(0)}%</p>
    <a href="${angleUrl}" style="display:inline-block;background:linear-gradient(160deg,#E6C780,#C9A85C);color:#2A2008;font-weight:800;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:99px">🎬 Generar ángulo de video →</a>
    <div style="margin-top:16px"><a href="${row.url}" style="color:#9FB6D6;font-size:14px;text-decoration:none">Leer la noticia completa →</a></div>
  </div>
</div>`;
}

async function sendAlert(row: Parameters<typeof alertHtml>[0]) {
  const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
  const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
  const smtpUser = Deno.env.get("SMTP_USER") || "";
  const smtpPass = Deno.env.get("SMTP_PASS") || "";
  if (!smtpUser || !smtpPass) return false;
  const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
  const client = new SMTPClient({
    connection: { hostname: smtpHost, port: smtpPort, tls: smtpPort === 465, auth: { username: smtpUser, password: smtpPass } },
  });
  const country = (row.countries || [])[0] && !/general/i.test(row.countries[0]) ? row.countries[0] : "";
  const prefix = country ? `[${asciiSafe(country)}] ` : "";
  await client.send({
    from: smtpUser,
    to: recipients(),
    // Subject stays plain-ASCII: this codebase has never sent a non-ASCII (let
    // alone emoji) Subject header before, and a broken/garbled subject line is
    // most likely a MIME-header-encoding gap in denomailer for those bytes.
    // The rich Spanish text + emoji live in the HTML body instead, unaffected.
    subject: `Alerta de inmigracion: ${prefix}${asciiSafe(row.title).slice(0, 90)}`,
    content: `${row.title}\n\n${row.summary}\n\nGenerar angulo de video: ${FUNCTIONS_BASE}/immigration-video-angle?id=${row.id}&t=${ANGLE_TOKEN}\n\nFuente: ${row.url}`,
    html: alertHtml(row),
  });
  await client.close();
  return true;
}

// ── MAIN ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  try {
    // 0. load live settings (editable from the Noticias page) — fall back to
    // the constants above if the singleton row is ever missing
    const { data: settingsRow } = await supabase
      .from("immigration_news_settings")
      .select("min_relevance_score, target_countries, excluded_keywords")
      .eq("id", true)
      .maybeSingle();
    if (settingsRow) {
      SETTINGS = {
        min_relevance_score: Number(settingsRow.min_relevance_score) || FALLBACK_RELEVANCE_THRESHOLD,
        target_countries: settingsRow.target_countries || FALLBACK_TARGET_COUNTRIES,
        excluded_keywords: settingsRow.excluded_keywords || FALLBACK_EXCLUDED_KEYWORDS,
      };
    }

    // 1. gather + cap
    const gathered = [...(await fetchFederalRegister()), ...(await fetchGoogleNews())].slice(0, MAX_CANDIDATES);
    const raw = gathered.filter((c) => !isExcludedByKeyword(c));

    // 2. dedupe against what we've already seen
    const existing = new Set<string>();
    if (raw.length) {
      const { data } = await supabase
        .from("immigration_news")
        .select("source, external_id")
        .in("external_id", raw.map((c) => c.external_id));
      (data || []).forEach((r) => existing.add(`${r.source}::${r.external_id}`));
    }
    const fresh = raw.filter((c) => !existing.has(`${c.source}::${c.external_id}`));
    if (!fresh.length) {
      return new Response(JSON.stringify({ ok: true, fresh: 0, emailed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. score relevance + countries with Haiku
    let scored: Array<{ i: number; relevant: boolean; score: number; reason: string; countries: string[] }> = [];
    if (apiKey) {
      try {
        const r = await scoreWithHaiku(fresh, apiKey);
        scored = r.scored;
        if (r.usage) {
          await supabase.from("anthropic_usage_log").insert({
            function_name: "immigration-news-poll", model: MODEL,
            input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cost_usd: 0,
          }).then(() => {}, () => {});
        }
      } catch (e) {
        console.error("scoring failed:", e);
      }
    }
    const byIndex = new Map(scored.map((s) => [s.i, s]));

    // 4. persist all fresh (marks them seen) + collect the relevant ones to email
    const toEmail: Array<Parameters<typeof alertHtml>[0]> = [];
    const rows = fresh.map((c, i) => {
      const s = byIndex.get(i);
      const countries = s?.countries?.length ? s.countries : ["General"];
      const relevant = !!s?.relevant && (s?.score ?? 0) >= SETTINGS.min_relevance_score;
      return {
        source: c.source, external_id: c.external_id, url: c.url, title: c.title,
        summary: c.summary, published_at: c.published_at,
        relevant, relevance_score: s?.score ?? 0, reason: s?.reason ?? "", countries,
      };
    });

    const { data: inserted, error: insErr } = await supabase
      .from("immigration_news")
      .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: true })
      .select("id, title, summary, url, source, published_at, countries, reason, relevance_score, relevant");
    if (insErr) console.error("insert error:", insErr);

    for (const row of inserted || []) {
      if (row.relevant && passesCountryFilter(row.countries) && toEmail.length < MAX_EMAILS_PER_RUN) {
        toEmail.push(row as Parameters<typeof alertHtml>[0]);
      }
    }

    // 5. email + mark alerted
    let emailed = 0;
    for (const row of toEmail) {
      try {
        if (await sendAlert(row)) {
          emailed++;
          await supabase.from("immigration_news").update({ alerted_at: new Date().toISOString() }).eq("id", row.id);
        }
      } catch (e) {
        console.error("email failed:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, fetched: raw.length, fresh: fresh.length, relevant: toEmail.length, emailed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("immigration-news-poll error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
