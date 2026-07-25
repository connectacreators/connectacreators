import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =============================================================================
   immigration-video-angle — on-demand, opened from the alert email button.
   Given a news row id + token, generates (once, then caches) a talking-head
   video angle: a strong 3-second hook, a simplified plain-Spanish explanation
   of the article, and why it matters + a CTA to comment "ASILO". Returns a
   branded mobile-friendly page. verify_jwt=false; guarded by a shared token.
   ============================================================================= */

const ANGLE_TOKEN = "abg-news-angle-2026";
const MODEL = "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const page = (inner: string) => new Response(
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ángulo de video — Connecta</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0B0A10; color:#F4F0E8; font-family:-apple-system,Segoe UI,Roboto,sans-serif; line-height:1.6; }
  .wrap { max-width:680px; margin:0 auto; padding:32px 22px 64px; }
  .eyebrow { color:#E6C780; font-size:12px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; }
  h1 { font-size:26px; line-height:1.2; margin:10px 0 22px; }
  .badge { display:inline-block; background:#E6C780; color:#2A2008; font-weight:700; font-size:12px; padding:4px 11px; border-radius:99px; margin:0 6px 8px 0; }
  .card { background:rgba(255,255,255,0.045); border:1px solid rgba(244,240,232,0.1); border-radius:18px; padding:24px; margin:0 0 16px; }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:0.1em; color:#E6C780; margin:0 0 10px; }
  .hook { font-size:21px; font-weight:700; line-height:1.35; color:#fff; }
  .body { font-size:16px; color:rgba(244,240,232,0.82); white-space:pre-wrap; }
  a.src { color:#9FB6D6; text-decoration:none; font-size:15px; }
  button { background:linear-gradient(160deg,#E6C780,#C9A85C); color:#2A2008; font-weight:800; font-size:15px; border:0; padding:13px 24px; border-radius:99px; cursor:pointer; }
  .muted { color:rgba(244,240,232,0.4); font-size:13px; }
</style></head><body><div class="wrap">${inner}</div>
<script>
  function copyScript(){ const t=document.getElementById('script').innerText; navigator.clipboard.writeText(t).then(()=>{const b=document.getElementById('copyBtn'); b.innerText='¡Copiado!'; setTimeout(()=>b.innerText='Copiar guion',1600);}); }
</script></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } }
);

async function fetchArticleText(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 ConnectaBot" }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return "";
    const html = await res.text();
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.slice(0, 4000);
  } catch { return ""; }
}

async function generateAngle(row: { title: string; summary: string; url: string; countries: string[] }, apiKey: string) {
  const article = await fetchArticleText(row.url);
  const country = (row.countries || []).find((c) => !/general/i.test(c));
  const prompt = `Eres guionista de videos cortos (talking-head, vertical) para un ABOGADO DE INMIGRACIÓN que le habla a inmigrantes en EE.UU. en español claro y cercano.

Con esta noticia, escribe el ángulo del video. Devuelve SOLO JSON:
{"hook":"1 sola frase, gancho fuerte para los primeros 3 segundos${country ? ` — cuando aplique, dirígete a la comunidad de ${country}` : ""}","script":"guion hablado de 5-8 frases: explica la noticia SIMPLIFICADA en español sencillo, qué significa para el inmigrante y qué debe hacer; cierra invitando a comentar la palabra ASILO para más info","why":"1 frase: por qué le importa a esta comunidad"}

TÍTULO: ${row.title}
RESUMEN: ${row.summary}
${article ? `CONTENIDO: ${article}` : ""}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Haiku ${res.status}`);
  const json = await res.json();
  const text = (json.content?.[0]?.text || "").trim();
  const m = text.match(/\{[\s\S]*\}/);
  return { angle: m ? JSON.parse(m[0]) : { hook: "", script: text, why: "" }, usage: json.usage };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const wantsJson = url.searchParams.get("format") === "json";
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (url.searchParams.get("t") !== ANGLE_TOKEN || !id) {
    if (wantsJson) return new Response(JSON.stringify({ error: "invalid_token_or_id" }), { status: 401, headers: jsonHeaders });
    return page(`<p class="eyebrow">Acceso no válido</p><h1>Enlace inválido o vencido.</h1>`);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: row } = await supabase
    .from("immigration_news")
    .select("id, title, summary, url, countries, angle_text")
    .eq("id", id).maybeSingle();
  if (!row) {
    if (wantsJson) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: jsonHeaders });
    return page(`<p class="eyebrow">No encontrado</p><h1>No se encontró la noticia.</h1>`);
  }

  let angle: { hook: string; script: string; why: string };
  if (row.angle_text) {
    angle = JSON.parse(row.angle_text);
  } else {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      if (wantsJson) return new Response(JSON.stringify({ error: "missing_api_key" }), { status: 500, headers: jsonHeaders });
      return page(`<h1>Falta configurar ANTHROPIC_API_KEY.</h1>`);
    }
    try {
      const g = await generateAngle(row, apiKey);
      angle = g.angle;
      await supabase.from("immigration_news").update({ angle_text: JSON.stringify(angle), angle_generated_at: new Date().toISOString() }).eq("id", id);
      if (g.usage) {
        await supabase.from("anthropic_usage_log").insert({
          function_name: "immigration-video-angle", model: MODEL,
          input_tokens: g.usage.input_tokens, output_tokens: g.usage.output_tokens, cost_usd: 0,
        }).then(() => {}, () => {});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (wantsJson) return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
      return page(`<p class="eyebrow">Error</p><h1>No se pudo generar el ángulo.</h1><p class="muted">${escapeHtml(msg)}</p>`);
    }
  }

  // JSON mode: used by the in-app Noticias page to draft a script for the
  // active client, without rendering the standalone HTML page.
  if (wantsJson) {
    return new Response(JSON.stringify({ id: row.id, title: row.title, url: row.url, countries: row.countries, angle }), { headers: jsonHeaders });
  }

  const badges = (row.countries || []).map((c) => `<span class="badge">${escapeHtml(c)}</span>`).join("");
  return page(`
    <p class="eyebrow">🎬 Ángulo de video · talking-head</p>
    <h1>${escapeHtml(row.title)}</h1>
    <div>${badges}</div>
    <div class="card"><h2>Hook (primeros 3s)</h2><p class="hook">${escapeHtml(angle.hook || "—")}</p></div>
    <div class="card"><h2>Guion</h2><p class="body" id="script">${escapeHtml(angle.script || "")}</p></div>
    ${angle.why ? `<div class="card"><h2>Por qué les importa</h2><p class="body">${escapeHtml(angle.why)}</p></div>` : ""}
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:8px">
      <button id="copyBtn" onclick="copyScript()">Copiar guion</button>
      <a class="src" href="${row.url}" target="_blank" rel="noopener">Leer la noticia completa →</a>
    </div>
  `);
});
