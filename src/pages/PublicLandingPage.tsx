import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Service = { emoji: string; title: string; description: string };
type Testimonial = { quote: string; author: string; rating?: number };

type LandingPage = {
  id: string;
  client_id: string;
  slug: string;
  is_published: boolean;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  hero_headline: string | null;
  hero_subheadline: string | null;
  cta_button_text: string;
  about_title: string | null;
  about_description: string | null;
  show_booking: boolean;
  services: Service[];
  testimonials: Testimonial[];
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  contact_hours: string | null;
  clinic_photo_url: string | null;
  map_embed_url: string | null;
  about_us_text?: string | null;
  about_photo_1_url?: string | null;
  about_photo_2_url?: string | null;
  booking_type?: string | null;
  vimeo_embed_url?: string | null;
  booking_cta_url?: string | null;
  booking_cta_text?: string | null;
  language?: string | null;
  about_section_title?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  favicon_url?: string | null;
  og_image_url?: string | null;
  hero_image_url?: string | null;
  font_family?: string | null;
  fb_pixel_id?: string | null;
  show_sticky_cta?: boolean;
  trust_stat_1_number?: string | null;
  trust_stat_1_label?: string | null;
  trust_stat_2_number?: string | null;
  trust_stat_2_label?: string | null;
  trust_stat_3_number?: string | null;
  trust_stat_3_label?: string | null;
};

const PAGE_TRANSLATIONS = {
  en: {
    pageNotAvailable: "This page is not available.",
    previewMode: "PREVIEW MODE — This page is not yet published publicly",
    teamMember: "Team member",
    calendarFallback: "Can't see the calendar? Click here to open it",
    viewSchedule: "View Our Schedule",
    testimonialsHeading: "WHAT OUR CLIENTS SAY",
    contactHeading: "CONTACT INFORMATION",
  },
  es: {
    pageNotAvailable: "Esta página no está disponible.",
    previewMode: "MODO VISTA PREVIA — Esta página aún no está publicada públicamente",
    teamMember: "Miembro del equipo",
    calendarFallback: "¿No puedes ver el calendario? Haz clic aquí para abrirlo",
    viewSchedule: "Ver Nuestro Horario",
    testimonialsHeading: "LO QUE DICEN NUESTROS PACIENTES",
    contactHeading: "INFORMACIÓN DE LA CLÍNICA",
  },
};

const KNOWN_HOSTS = ["connectacreators.com", "www.connectacreators.com", "connecta.so", "www.connecta.so", "localhost"];

function isCustomDomain(hostname: string) {
  return !KNOWN_HOSTS.includes(hostname) && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/);
}

// ── Color utilities ────────────────────────────────────────────────────────
function hexLuminance(hex: string): number {
  try {
    const clean = hex.replace("#", "").padEnd(6, "0");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const lin = (c: number) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  } catch { return 1; }
}

function isLight(hex: string): boolean {
  return hexLuminance(hex) > 0.35;
}

// Blend a hex color toward white (amount 0–1, 1 = full white)
function lighten(hex: string, amount: number): string {
  try {
    const clean = hex.replace("#", "").padEnd(6, "0");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const blend = (c: number) => Math.round(c + (255 - c) * amount);
    return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
  } catch { return hex; }
}

// Blend a hex color toward black (amount 0–1, 1 = full black)
function darken(hex: string, amount: number): string {
  try {
    const clean = hex.replace("#", "").padEnd(6, "0");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const blend = (c: number) => Math.round(c * (1 - amount));
    return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
  } catch { return hex; }
}

export default function PublicLandingPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeH, setIframeH] = useState(720);

  const hostname = window.location.hostname;
  const usingCustomDomain = isCustomDomain(hostname);

  useEffect(() => {
    let query = supabase.from("landing_pages").select("*");
    if (usingCustomDomain) {
      query = query.eq("custom_domain", hostname);
    } else {
      if (!slug) { setLoading(false); return; }
      query = query.eq("slug", slug);
      if (!isPreview) query = query.eq("is_published", true);
    }
    query.maybeSingle().then(({ data }) => {
      setPage(data ? { ...data, services: data.services || [], testimonials: data.testimonials || [] } : null);
      setLoading(false);
    });
  }, [slug, isPreview, usingCustomDomain, hostname]);

  useEffect(() => {
    const fn = (e: MessageEvent) => {
      if (e.data?.type === "booking-height" && typeof e.data.height === "number")
        setIframeH(Math.max(680, e.data.height + 48));
    };
    window.addEventListener("message", fn);
    return () => window.removeEventListener("message", fn);
  }, []);

  useEffect(() => {
    if (!page) return;
    // Page title
    document.title = page.seo_title || page.hero_headline || "Book an Appointment";
    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) { metaDesc = document.createElement("meta"); metaDesc.name = "description"; document.head.appendChild(metaDesc); }
    if (page.seo_description) metaDesc.content = page.seo_description;
    // Favicon
    if (page.favicon_url) {
      let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (!favicon) { favicon = document.createElement("link"); favicon.rel = "icon"; document.head.appendChild(favicon); }
      favicon.href = page.favicon_url;
    }
    // OG tags
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute("property", property); document.head.appendChild(el); }
      el.content = content;
    };
    if (page.seo_title) setMeta("og:title", page.seo_title);
    if (page.seo_description) setMeta("og:description", page.seo_description);
    if (page.og_image_url) setMeta("og:image", page.og_image_url);
    setMeta("og:type", "website");
  }, [page]);

  // Facebook Pixel — keyed by page.fb_pixel_id (or legacy domain map)
  useEffect(() => {
    if (!page) return;
    const LEGACY_DOMAIN_PIXELS: Record<string, string> = {
      "saratogachiropracticutah.store": "942091105339252",
    };
    const pixelId = page.fb_pixel_id || LEGACY_DOMAIN_PIXELS[hostname] || null;
    if (!pixelId || document.getElementById("fb-pixel-script")) return;

    const script = document.createElement("script");
    script.id = "fb-pixel-script";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);

    const inline = document.createElement("script");
    inline.id = "fb-pixel-init";
    inline.textContent = `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];}(window,document,'script','','','','');
    fbq('init','${pixelId}');
    fbq('track','PageView');
  `;
    document.head.appendChild(inline);

    const ns = document.createElement("noscript");
    ns.id = "fb-pixel-noscript";
    ns.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1" />`;
    document.body.appendChild(ns);

    return () => {
      document.getElementById("fb-pixel-script")?.remove();
      document.getElementById("fb-pixel-init")?.remove();
      document.getElementById("fb-pixel-noscript")?.remove();
      delete (window as any).fbq;
      delete (window as any)._fbq;
    };
  }, [page, hostname]);

  // Load Google Font for selected font_family
  useEffect(() => {
    if (!page?.font_family) return;
    const id = "public-page-font";
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Lato:wght@400;700&family=Playfair+Display:wght@400;700&family=Oswald:wght@400;700&display=swap";
    document.head.appendChild(link);
  }, [page?.font_family]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 style={{ width: 32, height: 32, color: "#C4922A", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (!page) return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <p style={{ fontFamily: "Arial, sans-serif", fontSize: 18, color: "#555", textAlign: "center" }}>
        {PAGE_TRANSLATIONS.en.pageNotAvailable}
      </p>
    </div>
  );

  const tr = PAGE_TRANSLATIONS[page.language === "es" ? "es" : "en"];

  // ── Derive full color palette from the two user-chosen colors ─────────────
  const accent = page.primary_color || "#C4922A";          // brand accent
  const bgBase = page.secondary_color || "#ffffff";        // page background

  const bgIsLight = isLight(bgBase);

  // Section backgrounds — two alternating shades
  const bg1 = bgBase;                                      // main bg (hero wrapper, contact)
  const bg2 = bgIsLight ? darken(bgBase, 0.04) : lighten(bgBase, 0.07); // subtle alternate

  // Card/surface background
  const cardBg = bgIsLight ? "#ffffff" : lighten(bgBase, 0.1);
  const cardBorder = bgIsLight ? "#e8e8e8" : "rgba(255,255,255,0.1)";

  // Text colors — guaranteed contrast against bgBase
  const textPrimary = bgIsLight ? "#1a1a1a" : "#f0f0f0";
  const textMuted   = bgIsLight ? "#555555" : "#aaaaaa";
  const textLight   = bgIsLight ? "#888888" : "#777777";

  // Accent on bg — if accent is too close to bg, flip it to white/black
  const accentLum = hexLuminance(accent);
  const bgLum = hexLuminance(bgBase);
  const contrastRatio = (Math.max(accentLum, bgLum) + 0.05) / (Math.min(accentLum, bgLum) + 0.05);
  const safeAccent = contrastRatio >= 2.5 ? accent : (bgIsLight ? "#1a1a1a" : "#f0f0f0");

  const heroTextColor = page.hero_image_url ? "#ffffff" : textPrimary;
  const heroMutedColor = page.hero_image_url ? "rgba(255,255,255,0.85)" : textMuted;

  const services = page.services || [];
  const testimonials = page.testimonials || [];
  const hasServices = services.length > 0 || !!(page.about_title || page.about_description);
  const hasTesti = testimonials.length > 0;
  const hasContact = !!(page.contact_phone || page.contact_email || page.contact_address || page.contact_hours);
  const avatarColors = ["#e84393", "#6c5ce7", "#00b894", "#fd79a8", "#0984e3", "#e17055"];

  const headingStyle: React.CSSProperties = {
    fontFamily: page.font_family || "Arial, sans-serif",
    fontWeight: 700,
    color: textPrimary,
    textAlign: "center",
  };

  return (
    <div style={{ fontFamily: page.font_family || "Arial, sans-serif", background: bg1, minHeight: "100vh", paddingBottom: (page.show_sticky_cta ?? true) ? 80 : 0 }}>

      {/* ── PREVIEW BANNER ─────────────────────── */}
      {isPreview && !usingCustomDomain && (
        <div style={{ background: "#1a1a1a", color: "#fff", fontSize: 12, textAlign: "center", padding: "7px 16px", letterSpacing: "0.05em", position: "sticky", top: 0, zIndex: 999 }}>
          {tr.previewMode}
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>

        {/* ── HERO ─────────────────────────────── */}
        <div style={{
          paddingTop: 40,
          paddingBottom: 28,
          textAlign: "center",
          ...(page.hero_image_url ? {
            backgroundImage: `url(${page.hero_image_url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            position: "relative" as const,
            margin: "0 -16px",
            padding: "40px 16px 28px",
          } : {}),
        }}>
          {page.hero_image_url && (
            <div style={{
              position: "absolute" as const,
              inset: 0,
              background: "rgba(0,0,0,0.5)",
            }} />
          )}
          <div style={{ position: "relative" as const, zIndex: 1 }}>
            {page.logo_url && (
              <img src={page.logo_url} alt="Logo" style={{ maxHeight: 80, maxWidth: 260, objectFit: "contain", margin: "0 auto 24px", display: "block" }} />
            )}
            {page.hero_headline && (
              <h1 style={{
                ...headingStyle,
                fontSize: "clamp(24px, 5.5vw, 40px)",
                lineHeight: 1.15,
                margin: "0 0 16px",
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                color: heroTextColor,
              }}>
                {page.hero_headline}
              </h1>
            )}
            {page.hero_subheadline && (
              <p style={{ fontSize: 15, color: heroMutedColor, lineHeight: 1.65, margin: 0, maxWidth: 560, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
                {page.hero_subheadline}
              </p>
            )}
            {/* Trust Strip */}
            {(page.trust_stat_1_number || page.trust_stat_2_number || page.trust_stat_3_number) && (
              <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "stretch",
                flexWrap: "wrap",
                marginTop: 20,
                marginBottom: 4,
              }}>
                {[
                  { num: page.trust_stat_1_number, lbl: page.trust_stat_1_label },
                  { num: page.trust_stat_2_number, lbl: page.trust_stat_2_label },
                  { num: page.trust_stat_3_number, lbl: page.trust_stat_3_label },
                ].filter(s => s.num).map((stat, i, arr) => (
                  <div key={i} style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "8px 20px",
                    borderRight: i < arr.length - 1 ? `1px solid ${page.hero_image_url ? "rgba(255,255,255,0.3)" : cardBorder}` : undefined,
                  }}>
                    <span style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: page.hero_image_url ? "#ffffff" : safeAccent,
                      fontFamily: page.font_family || "Arial, sans-serif",
                      lineHeight: 1.1,
                    }}>
                      {stat.num}
                    </span>
                    {stat.lbl && (
                      <span style={{
                        fontSize: 11,
                        color: page.hero_image_url ? "rgba(255,255,255,0.75)" : textMuted,
                        marginTop: 2,
                        textAlign: "center",
                      }}>
                        {stat.lbl}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── BOOKING SECTION ─────────────────── */}
        {page.show_booking && (() => {
          const btype = page.booking_type || "calendar";

          // ── Calendar embed ─────────────────────
          if (btype === "calendar") return (
            <div id="booking-section" style={{ background: cardBg, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.08)", marginBottom: 32 }}>
              <iframe
                src={`https://connectacreators.com/book/${page.client_id}`}
                width="100%"
                style={{ border: "none", minHeight: iframeH, display: "block" }}
                title="Booking Calendar"
              />
              <div style={{ textAlign: "center", padding: "10px 16px", borderTop: `1px solid ${cardBorder}` }}>
                <a href={`https://connectacreators.com/book/${page.client_id}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: safeAccent, fontFamily: "Arial, sans-serif", fontSize: 13, textDecoration: "none" }}>
                  {tr.calendarFallback}
                </a>
              </div>
            </div>
          );

          // ── Vimeo video ────────────────────────
          if (btype === "vimeo" && page.vimeo_embed_url) return (
            <div id="booking-section" style={{ background: cardBg, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.08)", marginBottom: 32 }}>
              <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
                <iframe
                  src={page.vimeo_embed_url}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                  allowFullScreen
                  title="Video"
                />
              </div>
            </div>
          );

          // ── CTA button ─────────────────────────
          if (btype === "cta" && page.booking_cta_url) return (
            <div id="booking-section" style={{ background: cardBg, borderRadius: 12, padding: "36px 24px", textAlign: "center", boxShadow: "0 2px 16px rgba(0,0,0,0.08)", marginBottom: 32 }}>
              <a
                href={page.booking_cta_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  background: safeAccent,
                  color: hexLuminance(safeAccent) > 0.35 ? "#1a1a1a" : "#ffffff",
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "16px 40px",
                  borderRadius: 8,
                  textDecoration: "none",
                  boxShadow: `0 4px 16px ${safeAccent}55`,
                }}
              >
                {page.booking_cta_text || tr.viewSchedule}
              </a>
            </div>
          );

          return null;
        })()}
      </div>

      {/* ── SERVICES ─────────────────────────── */}
      {hasServices && (
        <div style={{ background: bg2, padding: "40px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px", textAlign: "center" }}>
            {page.about_title && (
              <h2 style={{ ...headingStyle, fontSize: "clamp(18px, 4vw, 26px)", textTransform: "uppercase", letterSpacing: "-0.01em", margin: "0 0 14px" }}>
                {page.about_title}
              </h2>
            )}
            {page.about_description && (
              <p style={{ fontSize: 15, color: textMuted, lineHeight: 1.7, margin: "0 0 20px", textAlign: "center" }}>
                {page.about_description}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {services.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10,
                  padding: "16px 14px", textAlign: "left",
                }}>
                  {s.emoji && (
                    <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{s.emoji}</span>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 13, margin: "0 0 4px", color: textPrimary, fontFamily: "Arial, sans-serif" }}>
                      {s.title}
                    </p>
                    {s.description && (
                      <p style={{ fontSize: 13, color: textMuted, margin: 0, lineHeight: 1.55 }}>
                        {s.description}
                      </p>
                    )}
                  </div>
                  <span style={{ color: safeAccent, fontSize: 17, flexShrink: 0, marginTop: 2, fontWeight: 700 }}>✓</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ABOUT / TEAM ─────────────────────── */}
      {(page.about_us_text || page.about_photo_1_url || page.about_photo_2_url) && (
        <div style={{ background: bg1, padding: "40px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px", textAlign: "center" }}>
            {page.about_section_title && (
              <h2 style={{ ...headingStyle, fontSize: "clamp(18px, 4vw, 26px)", textTransform: "uppercase", letterSpacing: "-0.01em", margin: "0 0 20px" }}>
                {page.about_section_title}
              </h2>
            )}
            {(page.about_photo_1_url || page.about_photo_2_url) && (
              <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 20, flexWrap: "wrap" }}>
                {page.about_photo_1_url && (
                  <img
                    src={page.about_photo_1_url}
                    alt={tr.teamMember}
                    style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: `3px solid ${safeAccent}` }}
                  />
                )}
                {page.about_photo_2_url && (
                  <img
                    src={page.about_photo_2_url}
                    alt={tr.teamMember}
                    style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: `3px solid ${safeAccent}` }}
                  />
                )}
              </div>
            )}
            {page.about_us_text && (
              <p style={{ fontSize: 15, color: textMuted, lineHeight: 1.7, margin: 0 }}>
                {page.about_us_text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── TESTIMONIALS ─────────────────────── */}
      {hasTesti && (
        <div style={{ background: bg1, padding: "40px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
            <h2 style={{ ...headingStyle, fontSize: "clamp(16px, 3.5vw, 22px)", textTransform: "uppercase", letterSpacing: "-0.01em", margin: "0 0 18px" }}>
              {tr.testimonialsHeading}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {testimonials.map((t, i) => {
                const initial = t.author?.trim()?.[0]?.toUpperCase() ?? "?";
                const col = avatarColors[i % avatarColors.length];
                return (
                  <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10, padding: 16, textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%", background: col,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 700, fontSize: 18, flexShrink: 0,
                        fontFamily: "Arial, sans-serif",
                      }}>
                        {initial}
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: textPrimary }}>{t.author}</p>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                        {Array.from({ length: t.rating || 5 }).map((_, n) => (
                          <span key={n} style={{ color: safeAccent, fontSize: 22, lineHeight: 1 }}>{"★"}</span>
                        ))}
                        {Array.from({ length: 5 - (t.rating || 5) }).map((_, n) => (
                          <span key={"e" + n} style={{ color: bgIsLight ? "#ddd" : "#444", fontSize: 22, lineHeight: 1 }}>{"☆"}</span>
                        ))}
                      </div>
                    </div>
                    <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.6, margin: 0, textAlign: "center" }}>{t.quote}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── CONTACT ──────────────────────────── */}
      {(hasContact || page.clinic_photo_url || page.map_embed_url) && (
        <div style={{ background: bg2, padding: "40px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
            {page.clinic_photo_url && (
              <img src={page.clinic_photo_url} alt="Clinic"
                style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 260, marginBottom: 16, display: "block" }} />
            )}
            {hasContact && (
              <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10, padding: "20px 18px", textAlign: "center" }}>
                <h3 style={{ ...headingStyle, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.03em", margin: "0 0 16px" }}>
                  {tr.contactHeading}
                </h3>
                {page.contact_address && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start", justifyContent: "center" }}>
                    <span style={{ color: safeAccent, fontSize: 17, flexShrink: 0 }}>📍</span>
                    <p style={{ fontSize: 14, color: textMuted, margin: 0, lineHeight: 1.5 }}>{page.contact_address}</p>
                  </div>
                )}
                {page.contact_phone && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: safeAccent, fontSize: 17, flexShrink: 0 }}>📞</span>
                    <a href={`tel:${page.contact_phone}`} style={{ fontSize: 14, color: textMuted, textDecoration: "none" }}>{page.contact_phone}</a>
                  </div>
                )}
                {page.contact_email && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: safeAccent, fontSize: 17, flexShrink: 0 }}>✉️</span>
                    <a href={`mailto:${page.contact_email}`} style={{ fontSize: 14, color: textMuted, textDecoration: "none" }}>{page.contact_email}</a>
                  </div>
                )}
                {page.contact_hours && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: safeAccent, fontSize: 17, flexShrink: 0 }}>🕐</span>
                    <p style={{ fontSize: 14, color: textMuted, margin: 0 }}>{page.contact_hours}</p>
                  </div>
                )}
              </div>
            )}
            {page.map_embed_url && (
              <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${cardBorder}` }}>
                <iframe src={page.map_embed_url} width="100%" height="300"
                  style={{ border: "none", display: "block" }}
                  allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Location Map" />
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ height: 48, background: bg2 }} />

      {/* Sticky Mobile CTA */}
      {(page.show_sticky_cta ?? true) && (
        <>
          <style>{`@media (min-width: 640px) { #sticky-cta-bar { display: none !important; } }`}</style>
          <div id="sticky-cta-bar" style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            padding: "12px 16px",
            background: bgBase,
            borderTop: `1px solid ${cardBorder}`,
          }}>
            <button
              onClick={() => document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                width: "100%",
                background: safeAccent,
                color: hexLuminance(safeAccent) > 0.35 ? "#1a1a1a" : "#ffffff",
                fontFamily: page.font_family || "Arial, sans-serif",
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: "0.04em",
                textTransform: "uppercase" as const,
                border: "none",
                borderRadius: 10,
                padding: "15px 24px",
                cursor: "pointer",
                boxShadow: `0 4px 16px ${safeAccent}44`,
              }}
            >
              {page.cta_button_text || "Book Now"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
