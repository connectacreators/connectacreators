import { useState, useEffect, useCallback } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Save,
  Copy,
  Check,
  ExternalLink,
  CalendarDays,
  Code,
  Palette,
  Globe,
  Plus,
  Trash2,
  Coffee,
  History,
  User,
  Mail,
  Phone,
  MessageSquare,
  ImageUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const formatHour12 = (h: number) => {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
};

const formatTime12 = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};

const TIMEZONES = [
  { value: "America/New_York", label: "EST – Nueva York" },
  { value: "America/Chicago", label: "CST – Chicago" },
  { value: "America/Denver", label: "MST – Denver" },
  { value: "America/Los_Angeles", label: "PST – Los Ángeles" },
  { value: "America/Mexico_City", label: "CDMX – Ciudad de México" },
  { value: "America/Bogota", label: "COT – Bogotá" },
  { value: "America/Lima", label: "PET – Lima" },
  { value: "America/Santiago", label: "CLT – Santiago" },
  { value: "America/Argentina/Buenos_Aires", label: "ART – Buenos Aires" },
  { value: "America/Sao_Paulo", label: "BRT – São Paulo" },
  { value: "Europe/Madrid", label: "CET – Madrid" },
  { value: "Europe/London", label: "GMT – Londres" },
  { value: "UTC", label: "UTC" },
];

type BreakTime = { start: string; end: string };

type BookingSettingsData = {
  id?: string;
  client_id: string;
  is_active: boolean;
  available_days: number[];
  start_hour: number;
  end_hour: number;
  slot_duration_minutes: number;
  timezone: string;
  booking_title: string;
  booking_description: string | null;
  primary_color: string;
  secondary_color: string;
  break_times: BreakTime[];
  zapier_webhook_url: string | null;
  logo_url: string | null;
};

export default function BookingSettings() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [settings, setSettings] = useState<BookingSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const bookingUrl = `https://connectacreators.com/book/${clientId}`;
  const embedCode = `<iframe src="${bookingUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:16px;"></iframe>`;

  const fetchSettings = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);

    const [{ data: clientData }, { data: settingsData }] = await Promise.all([
      supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
      supabase.from("booking_settings").select("*").eq("client_id", clientId).maybeSingle(),
    ]);

    if (clientData) setClientName(clientData.name);

    if (settingsData) {
      setSettings(settingsData as any);
    } else {
      setSettings({
        client_id: clientId,
        is_active: false,
        available_days: [1, 2, 3, 4, 5],
        start_hour: 9,
        end_hour: 18,
        slot_duration_minutes: 60,
        timezone: "America/Denver",
        booking_title: "Agenda tu cita",
        booking_description: null,
        primary_color: "#C4922A",
        secondary_color: "#1A1A1A",
        break_times: [],
        zapier_webhook_url: null,
        logo_url: null,
      });
    }
    setLoading(false);
  }, [clientId]);

  const fetchBookings = useCallback(async () => {
    if (!clientId) return;
    setBookingsLoading(true);
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50);
    setBookings(data || []);
    setBookingsLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchSettings();
      fetchBookings();
    }
  }, [authLoading, user, fetchSettings, fetchBookings]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/dashboard");
  }, [authLoading, user, navigate]);

  const handleSave = async () => {
    if (!settings || !clientId) return;
    setSaving(true);

    const payload = {
      client_id: clientId,
      is_active: settings.is_active,
      available_days: settings.available_days,
      start_hour: settings.start_hour,
      end_hour: settings.end_hour,
      slot_duration_minutes: settings.slot_duration_minutes,
      timezone: settings.timezone,
      booking_title: settings.booking_title,
      booking_description: settings.booking_description,
      primary_color: settings.primary_color,
      secondary_color: settings.secondary_color,
      break_times: settings.break_times,
      zapier_webhook_url: settings.zapier_webhook_url,
      logo_url: settings.logo_url,
    };

    let error;
    if (settings.id) {
      ({ error } = await supabase.from("booking_settings").update(payload).eq("id", settings.id));
    } else {
      const { data, error: insertError } = await supabase.from("booking_settings").insert(payload).select().single();
      error = insertError;
      if (data) setSettings({ ...settings, id: data.id });
    }

    if (error) {
      toast.error("Error saving settings");
      console.error(error);
    } else {
      toast.success("Settings saved");
    }
    setSaving(false);
  };

  const toggleDay = (day: number) => {
    if (!settings) return;
    const days = settings.available_days.includes(day)
      ? settings.available_days.filter((d) => d !== day)
      : [...settings.available_days, day].sort();
    setSettings({ ...settings, available_days: days });
  };

  const copyToClipboard = (text: string, type: "link" | "embed") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${clientId}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("booking-logos")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("booking-logos").getPublicUrl(path);
      setSettings((s) => s ? { ...s, logo_url: publicUrl } : s);
      toast.success("Logo uploaded successfully");
    } catch (err) {
      toast.error("Error uploading logo");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleLogoRemove = async () => {
    if (!settings || !clientId) return;
    setSettings({ ...settings, logo_url: null });
    toast.success("Logo removed");
  };

  if (authLoading || loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  if (!settings) return null;

  return (

      <PageTransition className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full">
          <button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {clientName}
          </button>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full border border-primary/20 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground font-caslon">Public Calendar</h1>
              <p className="text-xs text-muted-foreground">Booking settings for {clientName}</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Active toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/50">
              <div>
                <Label className="text-sm font-semibold">Enable Public Calendar</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Allow people to book appointments online</p>
              </div>
              <Switch checked={settings.is_active} onCheckedChange={(v) => setSettings({ ...settings, is_active: v })} />
            </div>

            {/* Title & Description */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Booking Title</Label>
                <Input
                  value={settings.booking_title}
                  onChange={(e) => setSettings({ ...settings, booking_title: e.target.value })}
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Description (optional)</Label>
                <Textarea
                  value={settings.booking_description || ""}
                  onChange={(e) => setSettings({ ...settings, booking_description: e.target.value || null })}
                  className="min-h-[60px]"
                  placeholder="Schedule a strategy call with us..."
                />
              </div>
            </div>

            {/* Available days */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Available Days</Label>
              <div className="flex gap-2">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-xl text-xs font-medium transition-all border
                      ${settings.available_days.includes(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours, Duration & Timezone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Start Time</Label>
                <Select value={String(settings.start_hour)} onValueChange={(v) => setSettings({ ...settings, start_hour: Number(v) })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                      <SelectItem key={h} value={String(h)}>{formatHour12(h)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">End Time</Label>
                <Select value={String(settings.end_hour)} onValueChange={(v) => setSettings({ ...settings, end_hour: Number(v) })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                      <SelectItem key={h} value={String(h)}>{formatHour12(h)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Duration</Label>
                <Select value={String(settings.slot_duration_minutes)} onValueChange={(v) => setSettings({ ...settings, slot_duration_minutes: Number(v) })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hrs</SelectItem>
                    <SelectItem value="120">2 hrs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Timezone
                </Label>
                <Select value={settings.timezone} onValueChange={(v) => setSettings({ ...settings, timezone: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Logo */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1">
                <ImageUp className="w-3 h-3" /> Public Calendar Logo
              </Label>
              <p className="text-[10px] text-muted-foreground mb-3">Displayed in the header of your booking page. Max. 2MB.</p>
              <div className="flex items-center gap-3">
                {settings.logo_url ? (
                  <div className="relative w-20 h-20 rounded-xl border border-border bg-card/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                    <button
                      onClick={handleLogoRemove}
                      className="absolute top-1 right-1 w-4 h-4 rounded-full bg-destructive/80 flex items-center justify-center hover:bg-destructive transition-colors"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl border border-dashed border-border bg-card/30 flex items-center justify-center flex-shrink-0">
                    <ImageUp className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={logoUploading}
                    />
                    <span className={`inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-border text-xs font-medium transition-colors hover:bg-accent/10 ${logoUploading ? "opacity-50 pointer-events-none" : ""}`}>
                      {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageUp className="w-3.5 h-3.5" />}
                      {settings.logo_url ? "Change logo" : "Upload logo"}
                    </span>
                  </label>
                  <p className="text-[10px] text-muted-foreground mt-1.5">PNG, JPG, WebP o SVG</p>
                </div>
              </div>
            </div>

            {/* Colors */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1">
                <Palette className="w-3 h-3" /> Public Calendar Colors
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">Primary Color (buttons, accents)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.primary_color}
                      onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={settings.primary_color}
                      onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                      className="h-10 font-mono text-xs uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">Background Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.secondary_color}
                      onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={settings.secondary_color}
                      onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                      className="h-10 font-mono text-xs uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Break Times */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1">
                <Coffee className="w-3 h-3" /> Break Times
              </Label>
              <p className="text-[10px] text-muted-foreground mb-3">Break times block slots during those periods.</p>
              <div className="space-y-2">
                {settings.break_times.map((bt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={bt.start} onValueChange={(v) => {
                      const updated = [...settings.break_times];
                      updated[idx] = { ...updated[idx], start: v };
                      setSettings({ ...settings, break_times: updated });
                    }}>
                      <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: (settings.end_hour - settings.start_hour) * 2 }, (_, i) => {
                          const h = settings.start_hour + Math.floor(i / 2);
                          const m = (i % 2) * 30;
                          const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                          return <SelectItem key={val} value={val}>{formatTime12(val)}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">to</span>
                    <Select value={bt.end} onValueChange={(v) => {
                      const updated = [...settings.break_times];
                      updated[idx] = { ...updated[idx], end: v };
                      setSettings({ ...settings, break_times: updated });
                    }}>
                      <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: (settings.end_hour - settings.start_hour) * 2 }, (_, i) => {
                          const h = settings.start_hour + Math.floor(i / 2);
                          const m = (i % 2) * 30;
                          const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                          return <SelectItem key={val} value={val}>{formatTime12(val)}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => {
                        const updated = settings.break_times.filter((_, i) => i !== idx);
                        setSettings({ ...settings, break_times: updated });
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-8 text-xs"
                onClick={() => {
                  const defaultStart = `${String(settings.start_hour + 4).padStart(2, "0")}:00`;
                  const defaultEnd = `${String(settings.start_hour + 5).padStart(2, "0")}:00`;
                  setSettings({ ...settings, break_times: [...settings.break_times, { start: defaultStart, end: defaultEnd }] });
                }}
              >
                <Plus className="w-3 h-3 mr-1" /> Add break
              </Button>
            </div>

            {/* Zapier Webhook */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Zapier Webhook URL (optional)</Label>
              <p className="text-[10px] text-muted-foreground mb-2">Automatically sends booking data to Zapier for follow-ups.</p>
              <Input
                value={settings.zapier_webhook_url || ""}
                onChange={(e) => setSettings({ ...settings, zapier_webhook_url: e.target.value || null })}
                className="h-10 font-mono text-xs"
                placeholder="https://hooks.zapier.com/hooks/catch/..."
              />
            </div>

            {/* Save button */}
            <Button onClick={handleSave} disabled={saving} className="w-full h-11 rounded-xl">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Settings
            </Button>

            {/* Share links — only show if saved and active */}
            {settings.id && settings.is_active && (
              <div className="space-y-3 pt-4 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">Share</h3>

                {/* Public link */}
                <div className="p-3 rounded-xl border border-border bg-card/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ExternalLink className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{bookingUrl}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] px-2"
                        onClick={() => copyToClipboard(bookingUrl, "link")}
                      >
                        {copied === "link" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] px-2"
                        onClick={() => window.open(bookingUrl, "_blank")}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Embed code */}
                <div className="p-3 rounded-xl border border-border bg-card/50">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-xs font-medium text-foreground">Embed Code</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => copyToClipboard(embedCode, "embed")}
                    >
                      {copied === "embed" ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      Copy
                    </Button>
                  </div>
                  <pre className="text-[9px] text-muted-foreground bg-background rounded-lg p-2 overflow-x-auto">
                    {embedCode}
                  </pre>
                </div>
              </div>
            )}

            {/* Booking History */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Appointment History</h3>
                <span className="text-[10px] text-muted-foreground">({bookings.length})</span>
              </div>

              {bookingsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No appointments yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookings.map((b) => (
                    <div key={b.id} className="p-3 rounded-xl border border-border bg-card/50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">{b.name}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          b.status === "confirmed"
                            ? "bg-green-500/10 text-green-500 border border-green-500/20"
                            : b.status === "canceled"
                            ? "bg-red-500/10 text-red-500 border border-red-500/20"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}>
                          {b.status === "confirmed" ? "Confirmada" : b.status === "canceled" ? "Cancelada" : b.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{b.email}</span>
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {new Date(b.booking_date + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="font-medium text-primary">
                            {(() => {
                              const [h, m] = b.booking_time.split(":").map(Number);
                              const ampm = h >= 12 ? "PM" : "AM";
                              const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                              return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
                            })()}
                          </span>
                        </span>
                      </div>
                      {b.message && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground pt-1">
                          <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span className="italic">{b.message}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageTransition>
  );
}