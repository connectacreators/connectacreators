import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Loader2, Save, ExternalLink, Globe, Palette,
  Image, Type, CalendarDays, MessageSquare, Phone, Trash2, Plus, Check, Copy, Play, Video, Users,
} from "lucide-react";
import { toast } from "sonner";

type Testimonial = { quote: string; author: string };
type Service = { emoji: string; title: string; description: string };

type LandingPageData = {
  id?: string;
  client_id: string;
  slug: string;
  custom_domain?: string | null;
  ssl_provisioned_at?: string | null;
  is_published: boolean;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  hero_headline?: string | null;
  hero_subheadline?: string | null;
  cta_button_text: string;
  about_title?: string | null;
  about_description?: string | null;
  show_booking: boolean;
  services: Service[];
  testimonials: Testimonial[];
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
  contact_hours?: string | null;
  clinic_photo_url?: string | null;
  about_us_text?: string | null;
  about_photo_1_url?: string | null;
  about_photo_2_url?: string | null;
  about_section_title?: string | null;
  language?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  favicon_url?: string | null;
  og_image_url?: string | null;
};

const TABS = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "hero", label: "CTA Text", icon: Type },
  { id: "about", label: "About", icon: Users },
  { id: "services", label: "Services", icon: Plus },
  { id: "booking", label: "Booking", icon: CalendarDays },
  { id: "testimonials", label: "Testimonials", icon: MessageSquare },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "seo", label: "SEO", icon: Globe },
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 40);
}

export default function LandingPageBuilder() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [clientName, setClientName] = useState("");
  const [page, setPage] = useState<LandingPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("branding");
  const [slugError, setSlugError] = useState("");
  const [copied, setCopied] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto1, setUploadingPhoto1] = useState(false);
  const [uploadingPhoto2, setUploadingPhoto2] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const publicUrl = page?.slug ? `https://connectacreators.com/p/${page.slug}` : "";

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const [clientRes, pageRes] = await Promise.all([
      supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
      supabase.from("landing_pages").select("*").eq("client_id", clientId).limit(1),
    ]);
    const name = clientRes.data?.name || "";
    setClientName(name);
    const existing = pageRes.data?.[0];
    if (existing) {
      setPage({ ...existing, services: existing.services || [], testimonials: existing.testimonials || [] });
    } else {
      setPage({
        client_id: clientId,
        slug: slugify(name || clientId.substring(0, 8)),
        is_published: false,
        primary_color: "#C4922A",
        secondary_color: "#1A1A1A",
        cta_button_text: "Book Now",
        show_booking: true,
        services: [],
        testimonials: [],
        language: "en",
      });
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (!authLoading && user) fetchData();
  }, [authLoading, user, fetchData]);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/dashboard");
  }, [authLoading, isAdmin, navigate]);

  const validateSlug = async (slug: string) => {
    if (!slug || slug.length < 2) { setSlugError("Slug must be at least 2 characters"); return false; }
    if (!/^[a-z0-9-]+$/.test(slug)) { setSlugError("Only lowercase letters, numbers, and hyphens"); return false; }
    const { data } = await supabase.from("landing_pages").select("id").eq("slug", slug).maybeSingle();
    if (data && data.id !== page?.id) { setSlugError("This slug is already taken"); return false; }
    setSlugError("");
    return true;
  };

  const handleSave = async () => {
    if (!page || !clientId) return;
    const slugOk = await validateSlug(page.slug);
    if (!slugOk) { toast.error("Fix the slug before saving"); return; }
    setSaving(true);
    const payload = {
      client_id: clientId,
      slug: page.slug,
      is_published: page.is_published,
      logo_url: page.logo_url,
      primary_color: page.primary_color,
      secondary_color: page.secondary_color,
      hero_headline: page.hero_headline,
      hero_subheadline: page.hero_subheadline,
      cta_button_text: page.cta_button_text,
      about_title: page.about_title,
      about_description: page.about_description,
      show_booking: page.show_booking,
      services: page.services,
      testimonials: page.testimonials,
      contact_phone: page.contact_phone,
      contact_email: page.contact_email,
      contact_address: page.contact_address,
      contact_hours: page.contact_hours,
      clinic_photo_url: page.clinic_photo_url,
      map_embed_url: page.map_embed_url,
      about_us_text: page.about_us_text,
      about_photo_1_url: page.about_photo_1_url,
      about_photo_2_url: page.about_photo_2_url,
      about_section_title: page.about_section_title,
      booking_type: page.booking_type || 'calendar',
      vimeo_embed_url: page.vimeo_embed_url,
      booking_cta_url: page.booking_cta_url,
      booking_cta_text: page.booking_cta_text,
      custom_domain: page.custom_domain || null,
      language: page.language || "en",
      seo_title: page.seo_title || null,
      seo_description: page.seo_description || null,
      favicon_url: page.favicon_url || null,
      og_image_url: page.og_image_url || null,
    };
    const upsertPayload = page.id ? { ...payload, id: page.id } : payload;
    const { data, error } = await supabase
      .from("landing_pages")
      .upsert(upsertPayload, { onConflict: "client_id" })
      .select()
      .single();
    if (error) { toast.error("Failed to save: " + error.message); }
    else {
      if (data?.id && !page.id) setPage((p) => p ? { ...p, id: data.id } : p);
      toast.success(page.is_published ? "Page saved & published!" : "Page saved (not published)");
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large — max 10MB.");
      e.target.value = "";
      return;
    }
    setUploadingLogo(true);
    // Remove all possible old logo files first
    await supabase.storage.from("booking-logos").remove([
      `${clientId}/landing-logo.webp`,
      `${clientId}/landing-logo.png`,
      `${clientId}/landing-logo.jpg`,
      `${clientId}/landing-logo.jpeg`,
      `${clientId}/landing-logo.gif`,
      `${clientId}/landing-logo.svg`,
    ]);
    const ext = (file.name.split(".").pop() || "webp").toLowerCase();
    const path = `${clientId}/landing-logo.${ext}`;
    const { error } = await supabase.storage.from("booking-logos").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload failed: " + error.message);
    } else {
      const { data: { publicUrl: url } } = supabase.storage.from("booking-logos").getPublicUrl(path);
      setPage((p) => p ? { ...p, logo_url: `${url}?t=${Date.now()}` } : p);
      toast.success("Logo uploaded — click Save to keep it.");
    }
    setUploadingLogo(false);
    e.target.value = "";
  };

  const handleLogoRemove = async () => {
    if (!page || !clientId) return;
    if (page.logo_url) {
      // Extract path from URL and delete from storage
      const path = `${clientId}/landing-logo.${page.logo_url.split(".").pop()?.split("?")[0]}`;
      await supabase.storage.from("booking-logos").remove([path]);
    }
    setPage((p) => p ? { ...p, logo_url: null } : p);
    toast.success("Logo removed");
  };

  const handleAboutPhotoUpload = async (slot: 1 | 2, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large — max 10MB.");
      e.target.value = "";
      return;
    }
    const setUploading = slot === 1 ? setUploadingPhoto1 : setUploadingPhoto2;
    setUploading(true);
    await supabase.storage.from("booking-logos").remove([
      `${clientId}/about-photo-${slot}.webp`,
      `${clientId}/about-photo-${slot}.png`,
      `${clientId}/about-photo-${slot}.jpg`,
      `${clientId}/about-photo-${slot}.jpeg`,
    ]);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${clientId}/about-photo-${slot}.${ext}`;
    const { error } = await supabase.storage.from("booking-logos").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload failed: " + error.message);
    } else {
      const { data: { publicUrl: url } } = supabase.storage.from("booking-logos").getPublicUrl(path);
      const field = slot === 1 ? "about_photo_1_url" : "about_photo_2_url";
      setPage((p) => p ? { ...p, [field]: `${url}?t=${Date.now()}` } : p);
      toast.success(`Photo ${slot} uploaded — click Save to keep it.`);
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleAboutPhotoRemove = async (slot: 1 | 2) => {
    if (!page || !clientId) return;
    const field = slot === 1 ? "about_photo_1_url" : "about_photo_2_url";
    const url = page[field];
    if (url) {
      const ext = url.split(".").pop()?.split("?")[0];
      await supabase.storage.from("booking-logos").remove([`${clientId}/about-photo-${slot}.${ext}`]);
    }
    setPage((p) => p ? { ...p, [field]: null } : p);
    toast.success(`Photo ${slot} removed`);
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Favicon too large — max 2MB."); e.target.value = ""; return; }
    setUploadingFavicon(true);
    await supabase.storage.from("booking-logos").remove([
      `${clientId}/favicon.ico`, `${clientId}/favicon.png`, `${clientId}/favicon.jpg`,
    ]);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${clientId}/favicon.${ext}`;
    const { error } = await supabase.storage.from("booking-logos").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed: " + error.message); }
    else {
      const { data: { publicUrl: url } } = supabase.storage.from("booking-logos").getPublicUrl(path);
      setPage((p) => p ? { ...p, favicon_url: `${url}?t=${Date.now()}` } : p);
      toast.success("Favicon uploaded — click Save to keep it.");
    }
    setUploadingFavicon(false);
    e.target.value = "";
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!page) return null;

  return (

      <main className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 overflow-auto">
          {/* Header */}
          <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
              <button onClick={() => navigate(`/clients/${clientId}`)} className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{clientName}</p>
                <h1 className="text-sm font-semibold text-foreground">Landing Page Builder</h1>
              </div>

              {/* Slug editor */}
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg px-2 py-1 border border-border/50 text-xs">
                <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground hidden sm:inline">/p/</span>
                <input
                  value={page.slug}
                  onChange={(e) => setPage({ ...page, slug: e.target.value })}
                  onBlur={() => validateSlug(page.slug)}
                  className="bg-transparent outline-none w-24 sm:w-32 font-mono text-foreground"
                  placeholder="your-slug"
                />
              </div>
              {slugError && <p className="text-xs text-destructive w-full">{slugError}</p>}

              {/* Publish toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Publish</span>
                <Switch
                  checked={page.is_published}
                  onCheckedChange={(v) => setPage({ ...page, is_published: v })}
                />
              </div>

              <div className="flex items-center gap-1">
                {page.is_published && (
                  <button onClick={copyUrl} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                )}
                {page.slug && (
                  <a
                    href={`/p/${page.slug}?preview=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={page.is_published ? "View public page" : "Preview (admin only)"}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-muted/30 rounded-xl p-1 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="bg-card/50 border border-border/50 rounded-xl p-5 space-y-4">

              {/* BRANDING */}
              {activeTab === "branding" && (
                <div className="space-y-5">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Logo</Label>
                    <div className="flex items-center gap-3">
                      {page.logo_url && (
                        <img src={page.logo_url} alt="Logo" className="h-12 max-w-[120px] object-contain rounded-lg border border-border" />
                      )}
                      <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                        {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                        {page.logo_url ? "Change logo" : "Upload logo"}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                      {page.logo_url && (
                        <button onClick={handleLogoRemove} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove logo">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Accent Color <span style={{color:"#888",fontWeight:400}}>(stars, icons, checkmarks)</span></Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={page.primary_color}
                          onChange={(e) => setPage({ ...page, primary_color: e.target.value })}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-border" />
                        <Input value={page.primary_color}
                          onChange={(e) => setPage({ ...page, primary_color: e.target.value })}
                          className="h-10 font-mono text-sm" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Background Color <span style={{color:"#888",fontWeight:400}}>(text auto-adjusts for contrast)</span></Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={page.secondary_color}
                          onChange={(e) => setPage({ ...page, secondary_color: e.target.value })}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-border" />
                        <Input value={page.secondary_color}
                          onChange={(e) => setPage({ ...page, secondary_color: e.target.value })}
                          className="h-10 font-mono text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* Page Language */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Page Language <span style={{color:"#888",fontWeight:400}}>(sets default language for section headings)</span></Label>
                    <div className="flex gap-2">
                      {(["en", "es"] as const).map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => setPage({ ...page, language: lang })}
                          className="px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                          style={{
                            background: (page.language || "en") === lang ? "hsl(var(--primary))" : "transparent",
                            color: (page.language || "en") === lang ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                            borderColor: (page.language || "en") === lang ? "hsl(var(--primary))" : "hsl(var(--border))",
                          }}
                        >
                          {lang === "en" ? "🇺🇸 English" : "🇪🇸 Spanish"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color preview */}
                  <div className="rounded-xl overflow-hidden border border-border">
                    <div style={{ background: page.secondary_color, padding: "16px 18px" }}>
                      <p style={{ fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: 15, margin: "0 0 6px",
                        color: (() => { try { const h = page.secondary_color.replace("#",""); const r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255; const L=0.2126*(r<=0.03928?r/12.92:((r+0.055)/1.055)**2.4)+0.7152*(g<=0.03928?g/12.92:((g+0.055)/1.055)**2.4)+0.0722*(b<=0.03928?b/12.92:((b+0.055)/1.055)**2.4); return L>0.35?"#1a1a1a":"#f0f0f0"; } catch{return "#1a1a1a";} })() }}>
                        Sample Heading
                      </p>
                      <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, margin: "0 0 10px",
                        color: (() => { try { const h = page.secondary_color.replace("#",""); const r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255; const L=0.2126*(r<=0.03928?r/12.92:((r+0.055)/1.055)**2.4)+0.7152*(g<=0.03928?g/12.92:((g+0.055)/1.055)**2.4)+0.0722*(b<=0.03928?b/12.92:((b+0.055)/1.055)**2.4); return L>0.35?"#555":"#aaa"; } catch{return "#555";} })() }}>
                        Body text preview with auto contrast
                      </p>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ color: page.primary_color, fontSize: 16 }}>★★★★★</span>
                        <span style={{ color: page.primary_color, fontSize: 14, fontWeight: 700 }}>✓ Accent color</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* HERO */}
              {activeTab === "hero" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Headline</Label>
                    <Input value={page.hero_headline || ""} onChange={(e) => setPage({ ...page, hero_headline: e.target.value || null })}
                      placeholder="Book Your Appointment Today" className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Subheadline</Label>
                    <Textarea value={page.hero_subheadline || ""} onChange={(e) => setPage({ ...page, hero_subheadline: e.target.value || null })}
                      placeholder="Expert care for your health and wellness. Schedule a consultation today." className="min-h-[80px]" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">CTA Button Text</Label>
                    <Input value={page.cta_button_text} onChange={(e) => setPage({ ...page, cta_button_text: e.target.value })}
                      placeholder="Book Now" className="h-10" />
                  </div>
                </div>
              )}

              {/* ABOUT */}
              {activeTab === "about" && (
                <div className="space-y-5">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">About Section Title</Label>
                    <Input
                      value={page.about_section_title || ""}
                      onChange={(e) => setPage({ ...page, about_section_title: e.target.value || null })}
                      placeholder="About Us"
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">About Text</Label>
                    <Textarea
                      value={page.about_us_text || ""}
                      onChange={(e) => setPage({ ...page, about_us_text: e.target.value || null })}
                      placeholder="Tell visitors about your team, mission, or practice..."
                      className="min-h-[120px]"
                    />
                  </div>

                  <div className="border-t border-border/40 pt-4 space-y-4">
                    <Label className="text-xs text-muted-foreground block">Team Photos (up to 2)</Label>
                    <p className="text-xs text-muted-foreground -mt-2">Upload photos of your doctors or team members. Max 10MB each.</p>

                    {/* Photo 1 */}
                    <div className="p-4 bg-muted/30 rounded-xl space-y-2">
                      <p className="text-xs font-medium text-foreground">Photo 1</p>
                      <div className="flex items-center gap-3">
                        {page.about_photo_1_url && (
                          <img src={page.about_photo_1_url} alt="Photo 1" className="w-16 h-16 object-cover rounded-full border border-border" />
                        )}
                        <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                          {uploadingPhoto1 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                          {page.about_photo_1_url ? "Change photo" : "Upload photo"}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAboutPhotoUpload(1, e)} />
                        </label>
                        {page.about_photo_1_url && (
                          <button onClick={() => handleAboutPhotoRemove(1)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove photo">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Photo 2 */}
                    <div className="p-4 bg-muted/30 rounded-xl space-y-2">
                      <p className="text-xs font-medium text-foreground">Photo 2</p>
                      <div className="flex items-center gap-3">
                        {page.about_photo_2_url && (
                          <img src={page.about_photo_2_url} alt="Photo 2" className="w-16 h-16 object-cover rounded-full border border-border" />
                        )}
                        <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                          {uploadingPhoto2 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                          {page.about_photo_2_url ? "Change photo" : "Upload photo"}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAboutPhotoUpload(2, e)} />
                        </label>
                        {page.about_photo_2_url && (
                          <button onClick={() => handleAboutPhotoRemove(2)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove photo">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SERVICES */}
              {activeTab === "services" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Section Title</Label>
                    <Input value={page.about_title || ""} onChange={(e) => setPage({ ...page, about_title: e.target.value || null })}
                      placeholder="¿QUÉ INCLUYE TU EVALUACIÓN GRATIS?" className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Section Description (optional)</Label>
                    <Textarea value={page.about_description || ""} onChange={(e) => setPage({ ...page, about_description: e.target.value || null })}
                      placeholder="Una evaluación completa ahora gratis por tiempo limitado." className="min-h-[70px]" />
                  </div>
                  <div className="border-t border-border/40 pt-3">
                    <Label className="text-xs text-muted-foreground mb-2 block">Service Cards</Label>
                    {(page.services || []).map((s, i) => (
                      <div key={i} className="p-4 bg-muted/30 rounded-xl space-y-3 relative mb-3">
                        <button onClick={() => setPage({ ...page, services: page.services.filter((_, j) => j !== i) })}
                          className="absolute top-3 right-3 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="grid grid-cols-[56px_1fr] gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Emoji</Label>
                            <Input value={s.emoji} onChange={(e) => setPage({ ...page, services: page.services.map((x, j) => j === i ? { ...x, emoji: e.target.value } : x) })}
                              placeholder="💉" className="h-9 text-center text-lg" maxLength={2} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Title</Label>
                            <Input value={s.title} onChange={(e) => setPage({ ...page, services: page.services.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })}
                              placeholder="CONSULTA COMPLETA" className="h-9" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                          <Textarea value={s.description} onChange={(e) => setPage({ ...page, services: page.services.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })}
                            className="min-h-[60px]" placeholder="Tiempo uno a uno con nuestro especialista..." />
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setPage({ ...page, services: [...(page.services || []), { emoji: "", title: "", description: "" }] })}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-xl p-3 w-full justify-center">
                      <Plus className="w-3.5 h-3.5" /> Add service card
                    </button>
                  </div>
                </div>
              )}

              {/* BOOKING */}
              {activeTab === "booking" && (
                <div className="space-y-4">
                  {/* Master toggle */}
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-foreground">Show Booking Section</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Display a booking section on this page</p>
                    </div>
                    <Switch checked={page.show_booking} onCheckedChange={(v) => setPage({ ...page, show_booking: v })} />
                  </div>

                  {page.show_booking && (
                    <>
                      {/* Type selector */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: "calendar", icon: CalendarDays, label: "Booking Calendar" },
                          { id: "vimeo",    icon: Play,         label: "Vimeo Video" },
                          { id: "cta",      icon: ExternalLink, label: "Calendar Link" },
                        ].map(opt => (
                          <button key={opt.id} type="button"
                            onClick={() => setPage({ ...page, booking_type: opt.id })}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${(page.booking_type || "calendar") === opt.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                            <opt.icon className="w-4 h-4" />
                            <span className="text-xs font-medium leading-tight">{opt.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Calendar config */}
                      {(page.booking_type || "calendar") === "calendar" && (
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                          <p className="text-xs text-muted-foreground">
                            Uses your <strong>Booking Settings</strong> (hours, availability, colors). Make sure booking is activated there first.
                          </p>
                          <button onClick={() => navigate(`/clients/${clientId}/booking-settings`)}
                            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" /> Open Booking Settings
                          </button>
                        </div>
                      )}

                      {/* Vimeo config */}
                      {page.booking_type === "vimeo" && (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Vimeo URL or Embed Code</Label>
                            <Textarea
                              value={page.vimeo_embed_url || ""}
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                if (!val) { setPage({ ...page, vimeo_embed_url: null }); return; }
                                // Extract src from iframe embed code
                                const srcMatch = val.match(/src=["']([^"']+)["']/);
                                if (srcMatch) { setPage({ ...page, vimeo_embed_url: srcMatch[1] }); return; }
                                // Convert vimeo.com/ID → player embed URL
                                const idMatch = val.match(/vimeo\.com\/(\d+)/);
                                if (idMatch) { setPage({ ...page, vimeo_embed_url: `https://player.vimeo.com/video/${idMatch[1]}` }); return; }
                                // Already an embed URL
                                if (val.includes("player.vimeo.com")) { setPage({ ...page, vimeo_embed_url: val }); return; }
                                setPage({ ...page, vimeo_embed_url: val });
                              }}
                              placeholder={`https://vimeo.com/123456789\nor paste the full <iframe> embed code`}
                              className="min-h-[80px] font-mono text-xs"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Paste a Vimeo URL (vimeo.com/ID) or the full embed code from Vimeo → Share → Embed
                            </p>
                          </div>
                          {page.vimeo_embed_url && (
                            <div className="p-2 bg-muted/30 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1 font-medium">Preview URL:</p>
                              <p className="text-xs font-mono text-foreground break-all">{page.vimeo_embed_url}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* CTA Link config */}
                      {page.booking_type === "cta" && (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Calendar URL</Label>
                            <Input
                              type="url"
                              value={page.booking_cta_url || ""}
                              onChange={(e) => setPage({ ...page, booking_cta_url: e.target.value || null })}
                              placeholder="https://connectacreators.com/public/calendar/..."
                              className="h-10"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              The URL visitors are sent to when they click the button
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Button Text</Label>
                            <Input
                              value={page.booking_cta_text || ""}
                              onChange={(e) => setPage({ ...page, booking_cta_text: e.target.value || null })}
                              placeholder="View Our Schedule"
                              className="h-10"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TESTIMONIALS */}
              {activeTab === "testimonials" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Add up to 3 testimonials</p>
                  {page.testimonials.map((t, i) => (
                    <div key={i} className="p-4 bg-muted/30 rounded-xl space-y-3 relative">
                      <button onClick={() => setPage({ ...page, testimonials: page.testimonials.filter((_, j) => j !== i) })}
                        className="absolute top-3 right-3 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Quote</Label>
                        <Textarea value={t.quote}
                          onChange={(e) => setPage({ ...page, testimonials: page.testimonials.map((x, j) => j === i ? { ...x, quote: e.target.value } : x) })}
                          className="min-h-[70px]" placeholder="The service was amazing..." />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Author</Label>
                        <Input value={t.author}
                          onChange={(e) => setPage({ ...page, testimonials: page.testimonials.map((x, j) => j === i ? { ...x, author: e.target.value } : x) })}
                          placeholder="John D." className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Star Rating</Label>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(star => (
                            <button key={star} type="button"
                              onClick={() => setPage({ ...page, testimonials: page.testimonials.map((x, j) => j === i ? { ...x, rating: star } : x) })}
                              style={{ fontSize: 24, lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: "2px",
                                color: star <= (t.rating || 5) ? "#C4922A" : "#ccc" }}>
                              ★
                            </button>
                          ))}
                          <span className="text-xs text-muted-foreground self-center ml-1">{t.rating || 5}/5</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {page.testimonials.length < 3 && (
                    <button onClick={() => setPage({ ...page, testimonials: [...page.testimonials, { quote: "", author: "" }] })}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-xl p-3 w-full justify-center">
                      <Plus className="w-3.5 h-3.5" /> Add testimonial
                    </button>
                  )}
                </div>
              )}

              {/* CONTACT */}
              {activeTab === "contact" && (
                <div className="space-y-4">
                  {/* Custom Domain */}
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">Custom Domain</Label>
                      {page.custom_domain && (
                        page.ssl_provisioned_at
                          ? <span className="text-xs font-medium text-green-400 flex items-center gap-1">✓ SSL Active</span>
                          : <span className="text-xs text-amber-400 flex items-center gap-1">⏳ SSL Pending</span>
                      )}
                    </div>
                    <Input
                      value={page.custom_domain || ""}
                      onChange={(e) => setPage({ ...page, custom_domain: e.target.value || null })}
                      placeholder="www.yourclinic.com"
                      className="h-10 font-mono"
                    />
                    {page.custom_domain && !page.ssl_provisioned_at && (
                      <div className="text-xs text-muted-foreground space-y-1.5 border-t border-border/40 pt-3">
                        <p className="font-medium text-foreground/80">Only 1 manual step required:</p>
                        <div className="bg-muted rounded-lg p-2 space-y-1">
                          <p>Go to your domain registrar → DNS settings</p>
                          <p>Add an <strong>A record</strong>:</p>
                          <code className="block bg-background px-2 py-1 rounded font-mono text-[11px]">
                            Name: @ (or www) → Value: 72.62.200.145
                          </code>
                        </div>
                        <p className="text-muted-foreground/70">After DNS propagates (~5–30 min), SSL is provisioned <strong>automatically</strong>. No other action needed.</p>
                      </div>
                    )}
                    {page.custom_domain && page.ssl_provisioned_at && (
                      <div className="text-xs text-green-400/80 border-t border-border/40 pt-2">
                        SSL active since {new Date(page.ssl_provisioned_at).toLocaleDateString()}.
                        Your page is live at <strong>https://{page.custom_domain}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Phone</Label>
                    <Input value={page.contact_phone || ""} onChange={(e) => setPage({ ...page, contact_phone: e.target.value || null })}
                      placeholder="(801) 973-1022" className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Email</Label>
                    <Input type="email" value={page.contact_email || ""} onChange={(e) => setPage({ ...page, contact_email: e.target.value || null })}
                      placeholder="info@clinic.com" className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Address</Label>
                    <Textarea value={page.contact_address || ""} onChange={(e) => setPage({ ...page, contact_address: e.target.value || null })}
                      placeholder={"3800 W 3500 S Suite B\nWest Valley City, UT 84120"} className="min-h-[70px]" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Business Hours</Label>
                    <Input value={page.contact_hours || ""} onChange={(e) => setPage({ ...page, contact_hours: e.target.value || null })}
                      placeholder="Lun - Vie: 10am - 7pm" className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Clinic / Building Photo URL</Label>
                    <Input value={page.clinic_photo_url || ""} onChange={(e) => setPage({ ...page, clinic_photo_url: e.target.value || null })}
                      placeholder="https://..." className="h-10" />
                    <p className="text-xs text-muted-foreground mt-1">Paste a direct image URL (e.g. from Google Photos, Imgur, etc.)</p>
                    {page.clinic_photo_url && (
                      <img src={page.clinic_photo_url} alt="Clinic preview" className="mt-2 w-full rounded-lg object-cover" style={{ maxHeight: 140 }} />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Google Maps Embed Code</Label>
                    <Textarea
                      value={page.map_embed_url ? `<iframe src="${page.map_embed_url}" width="400" height="300" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : ""}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (!val) { setPage({ ...page, map_embed_url: null }); return; }
                        const match = val.match(/src=["']([^"']+)["']/);
                        const raw = match ? match[1] : (val.startsWith("http") ? val : null);
                        const decoded = raw ? raw.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"') : null;
                        setPage({ ...page, map_embed_url: decoded });
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Google Maps → Share → Embed a map → paste the full &lt;iframe&gt; code here
                    </p>
                  </div>
                </div>
              )}

              {/* SEO */}
              {activeTab === "seo" && (
                <div className="space-y-5">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Page Title <span style={{color:"#888",fontWeight:400}}>(browser tab + Google results)</span></Label>
                    <Input
                      value={page.seo_title || ""}
                      onChange={(e) => setPage({ ...page, seo_title: e.target.value || null })}
                      placeholder="Saratoga Chiropractic — West Valley City, UT"
                      className="h-10"
                      maxLength={70}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Keep under 60 characters for best results</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Meta Description <span style={{color:"#888",fontWeight:400}}>(shown in Google search results)</span></Label>
                    <Textarea
                      value={page.seo_description || ""}
                      onChange={(e) => setPage({ ...page, seo_description: e.target.value || null })}
                      placeholder="Expert chiropractic care in West Valley City. Book your free evaluation today."
                      className="min-h-[80px]"
                      maxLength={160}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Keep under 155 characters</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Favicon <span style={{color:"#888",fontWeight:400}}>(icon shown in browser tab — .ico, .png, .jpg)</span></Label>
                    <div className="flex items-center gap-3">
                      {page.favicon_url && (
                        <img src={page.favicon_url} alt="Favicon" className="w-8 h-8 object-contain rounded border border-border" />
                      )}
                      <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                        {uploadingFavicon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                        {page.favicon_url ? "Change favicon" : "Upload favicon"}
                        <input type="file" accept="image/*,.ico" className="hidden" onChange={handleFaviconUpload} />
                      </label>
                      {page.favicon_url && (
                        <button onClick={() => setPage((p) => p ? { ...p, favicon_url: null } : p)}
                          className="text-muted-foreground hover:text-destructive transition-colors" title="Remove favicon">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">OG Image URL <span style={{color:"#888",fontWeight:400}}>(preview image when shared on social media)</span></Label>
                    <Input
                      value={page.og_image_url || ""}
                      onChange={(e) => setPage({ ...page, og_image_url: e.target.value || null })}
                      placeholder="https://..."
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Recommended: 1200×630px image. Paste a direct URL.</p>
                    {page.og_image_url && (
                      <img src={page.og_image_url} alt="OG preview" className="mt-2 w-full rounded-lg object-cover" style={{ maxHeight: 100 }} />
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Live preview hint */}
            {page.is_published && page.slug && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-400">Page is live</p>
                  <p className="text-xs text-muted-foreground font-mono">connectacreators.com/p/{page.slug}</p>
                </div>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors">
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </main>
  );
}
