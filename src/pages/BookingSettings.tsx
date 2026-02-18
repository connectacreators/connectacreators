import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
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
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

type BookingSettings = {
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
};

export default function BookingSettings() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  const bookingUrl = `${window.location.origin}/book/${clientId}`;
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
        timezone: "America/Mexico_City",
        booking_title: "Agenda tu cita",
        booking_description: null,
      });
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (!authLoading && user) fetchSettings();
  }, [authLoading, user, fetchSettings]);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/dashboard");
  }, [authLoading, isAdmin, navigate]);

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
      toast.error("Error guardando configuración");
      console.error(error);
    } else {
      toast.success("Configuración guardada");
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
    toast.success("Copiado al portapapeles");
    setTimeout(() => setCopied(null), 2000);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/clients" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

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
              <h1 className="text-lg font-bold text-foreground">Calendario Público</h1>
              <p className="text-xs text-muted-foreground">Configuración del booking para {clientName}</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Active toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/50">
              <div>
                <Label className="text-sm font-semibold">Activar Calendario Público</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Permite que las personas agenden citas online</p>
              </div>
              <Switch checked={settings.is_active} onCheckedChange={(v) => setSettings({ ...settings, is_active: v })} />
            </div>

            {/* Title & Description */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Título del Booking</Label>
                <Input
                  value={settings.booking_title}
                  onChange={(e) => setSettings({ ...settings, booking_title: e.target.value })}
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Descripción (opcional)</Label>
                <Textarea
                  value={settings.booking_description || ""}
                  onChange={(e) => setSettings({ ...settings, booking_description: e.target.value || null })}
                  className="min-h-[60px]"
                  placeholder="Agenda una llamada estratégica con nosotros..."
                />
              </div>
            </div>

            {/* Available days */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Días Disponibles</Label>
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

            {/* Hours & Duration */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Hora Inicio</Label>
                <Select value={String(settings.start_hour)} onValueChange={(v) => setSettings({ ...settings, start_hour: Number(v) })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                      <SelectItem key={h} value={String(h)}>{`${h}:00`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Hora Fin</Label>
                <Select value={String(settings.end_hour)} onValueChange={(v) => setSettings({ ...settings, end_hour: Number(v) })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                      <SelectItem key={h} value={String(h)}>{`${h}:00`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Duración</Label>
                <Select value={String(settings.slot_duration_minutes)} onValueChange={(v) => setSettings({ ...settings, slot_duration_minutes: Number(v) })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1.5 hrs</SelectItem>
                    <SelectItem value="120">2 hrs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Save button */}
            <Button onClick={handleSave} disabled={saving} className="w-full h-11 rounded-xl">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar Configuración
            </Button>

            {/* Share links — only show if saved and active */}
            {settings.id && settings.is_active && (
              <div className="space-y-3 pt-4 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">Compartir</h3>

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
                      <span className="text-xs font-medium text-foreground">Código Embed</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => copyToClipboard(embedCode, "embed")}
                    >
                      {copied === "embed" ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      Copiar
                    </Button>
                  </div>
                  <pre className="text-[9px] text-muted-foreground bg-background rounded-lg p-2 overflow-x-auto">
                    {embedCode}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
