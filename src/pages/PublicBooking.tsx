import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  User,
  Mail,
  Phone,
  MessageSquare,
  ChevronDown,
  Globe,
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const COUNTRY_CODES = [
  { code: "+1", flag: "🇺🇸", label: "US" },
  { code: "+52", flag: "🇲🇽", label: "MX" },
  { code: "+44", flag: "🇬🇧", label: "UK" },
  { code: "+34", flag: "🇪🇸", label: "ES" },
  { code: "+57", flag: "🇨🇴", label: "CO" },
  { code: "+51", flag: "🇵🇪", label: "PE" },
  { code: "+54", flag: "🇦🇷", label: "AR" },
  { code: "+56", flag: "🇨🇱", label: "CL" },
  { code: "+55", flag: "🇧🇷", label: "BR" },
  { code: "+593", flag: "🇪🇨", label: "EC" },
  { code: "+58", flag: "🇻🇪", label: "VE" },
  { code: "+502", flag: "🇬🇹", label: "GT" },
  { code: "+503", flag: "🇸🇻", label: "SV" },
  { code: "+504", flag: "🇭🇳", label: "HN" },
  { code: "+506", flag: "🇨🇷", label: "CR" },
  { code: "+507", flag: "🇵🇦", label: "PA" },
  { code: "+1", flag: "🇨🇦", label: "CA" },
  { code: "+49", flag: "🇩🇪", label: "DE" },
  { code: "+33", flag: "🇫🇷", label: "FR" },
  { code: "+39", flag: "🇮🇹", label: "IT" },
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function formatDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type BookingSettings = {
  available_days: number[];
  start_hour: number;
  end_hour: number;
  slot_duration_minutes: number;
  timezone: string;
  booking_title: string;
  booking_description: string | null;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
};

type Step = "date" | "time" | "form" | "confirmed";

export default function PublicBooking() {
  const { clientId } = useParams<{ clientId: string }>();
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [formData, setFormData] = useState({ name: "", email: "", phone: "", message: "" });
  const [countryCode, setCountryCode] = useState("+1");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  // Colors from settings
  const primaryColor = settings?.primary_color || "#C4922A";
  const bgColor = settings?.secondary_color || "#1A1A1A";

  // Derived lighter/darker shades
  const cssVars = useMemo(() => {
    // Parse hex to determine a lighter text-friendly version
    const hexToRgb = (hex: string) => {
      const c = hex.replace("#", "");
      return {
        r: parseInt(c.substring(0, 2), 16),
        g: parseInt(c.substring(2, 4), 16),
        b: parseInt(c.substring(4, 6), 16),
      };
    };
    const bgRgb = hexToRgb(bgColor);
    const isDarkBg = (bgRgb.r * 0.299 + bgRgb.g * 0.587 + bgRgb.b * 0.114) < 128;

    return {
      "--bk-primary": primaryColor,
      "--bk-bg": bgColor,
      "--bk-card": isDarkBg
        ? `rgb(${Math.min(255, bgRgb.r + 20)}, ${Math.min(255, bgRgb.g + 20)}, ${Math.min(255, bgRgb.b + 20)})`
        : `rgb(${Math.max(0, bgRgb.r - 15)}, ${Math.max(0, bgRgb.g - 15)}, ${Math.max(0, bgRgb.b - 15)})`,
      "--bk-card-border": isDarkBg
        ? `rgb(${Math.min(255, bgRgb.r + 40)}, ${Math.min(255, bgRgb.g + 40)}, ${Math.min(255, bgRgb.b + 40)})`
        : `rgb(${Math.max(0, bgRgb.r - 30)}, ${Math.max(0, bgRgb.g - 30)}, ${Math.max(0, bgRgb.b - 30)})`,
      "--bk-text": isDarkBg ? "rgb(230,230,230)" : "rgb(30,30,30)",
      "--bk-text-muted": isDarkBg ? "rgb(130,130,130)" : "rgb(120,120,120)",
      "--bk-text-dim": isDarkBg ? "rgb(65,65,65)" : "rgb(180,180,180)",
      "--bk-input-bg": isDarkBg
        ? `rgb(${Math.max(0, bgRgb.r - 5)}, ${Math.max(0, bgRgb.g - 5)}, ${Math.max(0, bgRgb.b - 5)})`
        : `rgb(${Math.min(255, bgRgb.r + 10)}, ${Math.min(255, bgRgb.g + 10)}, ${Math.min(255, bgRgb.b + 10)})`,
    } as Record<string, string>;
  }, [primaryColor, bgColor]);

  // Fetch settings
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`${SUPABASE_URL}/functions/v1/public-booking?client_id=${clientId}`, {
      headers: { apikey: SUPABASE_KEY },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setSettings(data.settings);
          setClientName(data.client_name || "");
        }
      })
      .catch(() => setError("Error loading booking page"))
      .finally(() => setLoading(false));
  }, [clientId]);

  // Fetch slots when date selected
  const fetchSlots = useCallback(
    async (date: Date) => {
      if (!clientId) return;
      setSlotsLoading(true);
      setAvailableSlots([]);
      try {
        const dateStr = formatDateStr(date);
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/public-booking?client_id=${clientId}&date=${dateStr}`,
          { headers: { apikey: SUPABASE_KEY } }
        );
        const data = await res.json();
        setAvailableSlots(data.available_slots || []);
      } catch {
        setAvailableSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    [clientId]
  );

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setStep("time");
    fetchSlots(date);
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime || !clientId) return;
    setSubmitting(true);
    try {
      const fullPhone = `${countryCode} ${formData.phone}`;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/public-booking?client_id=${clientId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: fullPhone,
          message: formData.message,
          date: formatDateStr(selectedDate),
          time: selectedTime,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("confirmed");
      } else {
        setError(data.error || "Error creating booking");
      }
    } catch {
      setError("Error creating booking");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimeDisplay = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  const todayStr = formatDateStr(new Date());

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bgColor }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: bgColor }}>
        <div className="text-center space-y-3">
          <CalendarDays className="w-12 h-12 mx-auto" style={{ color: cssVars["--bk-text-dim"] }} />
          <p className="text-sm" style={{ color: cssVars["--bk-text-muted"] }}>Este calendario no está disponible.</p>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDow = getFirstDayOfWeek(calYear, calMonth);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: cssVars["--bk-bg"], fontFamily: "Arial, sans-serif" }}
      onClick={() => showCountryDropdown && setShowCountryDropdown(false)}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          {settings.logo_url ? (
            <div className="flex items-center justify-center mb-4">
              <img
                src={settings.logo_url}
                alt={clientName || "Logo"}
                className="h-16 max-w-[200px] object-contain"
              />
            </div>
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: `${primaryColor}15`, border: `1px solid ${primaryColor}30` }}
            >
              <CalendarDays className="w-6 h-6" style={{ color: primaryColor }} />
            </div>
          )}
          <h1 className="text-xl font-bold mb-1" style={{ color: cssVars["--bk-text"] }}>{settings.booking_title}</h1>
          {clientName && <p className="text-xs uppercase tracking-widest" style={{ color: cssVars["--bk-text-muted"] }}>{clientName}</p>}
          {settings.booking_description && (
            <p className="text-sm mt-2" style={{ color: cssVars["--bk-text-muted"] }}>{settings.booking_description}</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-3 text-xs" style={{ color: cssVars["--bk-text-muted"] }}>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{settings.slot_duration_minutes} min</span>
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{settings.timezone.split("/").pop()?.replace(/_/g, " ")}</span>
          </div>
        </div>

        {/* Step indicator */}
        {step !== "confirmed" && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {(["date", "time", "form"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: step === s ? primaryColor : i < ["date", "time", "form"].indexOf(step) ? `${primaryColor}80` : cssVars["--bk-card-border"],
                  }}
                />
                {i < 2 && (
                  <div
                    className="w-8 h-px"
                    style={{
                      background: i < ["date", "time", "form"].indexOf(step) ? `${primaryColor}80` : cssVars["--bk-card-border"],
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ===== DATE STEP ===== */}
        {step === "date" && (
          <div className="rounded-2xl p-5" style={{ background: cssVars["--bk-card"], border: `1px solid ${cssVars["--bk-card-border"]}` }}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }} className="p-1.5 rounded-lg transition-opacity hover:opacity-70">
                <ChevronLeft className="w-4 h-4" style={{ color: cssVars["--bk-text-muted"] }} />
              </button>
              <span className="text-sm font-semibold" style={{ color: cssVars["--bk-text"] }}>{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }} className="p-1.5 rounded-lg transition-opacity hover:opacity-70">
                <ChevronRight className="w-4 h-4" style={{ color: cssVars["--bk-text-muted"] }} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAY_NAMES.map((d) => (
                <span key={d} className="text-[10px] text-center font-medium" style={{ color: cssVars["--bk-text-muted"] }}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => <span key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const date = new Date(calYear, calMonth, day);
                const dateStr = formatDateStr(date);
                const dow = date.getDay();
                const isAvailableDay = settings.available_days.includes(dow);
                const isPast = dateStr < todayStr;
                const isToday = dateStr === todayStr;
                const isDisabled = !isAvailableDay || isPast;

                return (
                  <button
                    key={day}
                    disabled={isDisabled}
                    onClick={() => handleSelectDate(date)}
                    className="text-xs text-center w-9 h-9 rounded-lg transition-colors flex items-center justify-center mx-auto"
                    style={{
                      color: isDisabled ? cssVars["--bk-text-dim"] : cssVars["--bk-text"],
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      border: isToday && !isDisabled ? `1px solid ${primaryColor}60` : "1px solid transparent",
                      fontWeight: isToday ? 700 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!isDisabled) {
                        e.currentTarget.style.background = `${primaryColor}20`;
                        e.currentTarget.style.color = primaryColor;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isDisabled) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = cssVars["--bk-text"];
                      }
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== TIME STEP ===== */}
        {step === "time" && selectedDate && (
          <div className="rounded-2xl p-5" style={{ background: cssVars["--bk-card"], border: `1px solid ${cssVars["--bk-card-border"]}` }}>
            <button onClick={() => setStep("date")} className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 mb-4" style={{ color: cssVars["--bk-text-muted"] }}>
              <ChevronLeft className="w-3 h-3" />Cambiar fecha
            </button>

            <p className="text-sm font-semibold mb-1" style={{ color: cssVars["--bk-text"] }}>
              {selectedDate.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <p className="text-xs mb-4" style={{ color: cssVars["--bk-text-muted"] }}>Selecciona un horario disponible</p>

            {slotsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: primaryColor }} />
              </div>
            ) : availableSlots.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: cssVars["--bk-text-dim"] }}>No hay horarios disponibles para esta fecha.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {availableSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => handleSelectTime(slot)}
                    className="py-2.5 rounded-xl text-xs font-medium transition-all"
                    style={{
                      background: selectedTime === slot ? primaryColor : "transparent",
                      color: selectedTime === slot ? cssVars["--bk-bg"] : cssVars["--bk-text"],
                      border: selectedTime === slot ? `1px solid ${primaryColor}` : `1px solid ${cssVars["--bk-card-border"]}`,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTime !== slot) {
                        e.currentTarget.style.borderColor = `${primaryColor}60`;
                        e.currentTarget.style.color = primaryColor;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTime !== slot) {
                        e.currentTarget.style.borderColor = cssVars["--bk-card-border"];
                        e.currentTarget.style.color = cssVars["--bk-text"];
                      }
                    }}
                  >
                    {formatTimeDisplay(slot)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== FORM STEP ===== */}
        {step === "form" && selectedDate && selectedTime && (
          <div className="rounded-2xl p-5" style={{ background: cssVars["--bk-card"], border: `1px solid ${cssVars["--bk-card-border"]}` }}>
            <button onClick={() => setStep("time")} className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 mb-4" style={{ color: cssVars["--bk-text-muted"] }}>
              <ChevronLeft className="w-3 h-3" />Cambiar horario
            </button>

            <div
              className="flex items-center gap-2 mb-5 p-3 rounded-xl"
              style={{ background: `${primaryColor}15`, border: `1px solid ${primaryColor}30` }}
            >
              <CalendarDays className="w-4 h-4 flex-shrink-0" style={{ color: primaryColor }} />
              <span className="text-xs capitalize" style={{ color: cssVars["--bk-text"] }}>
                {selectedDate.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <Clock className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: primaryColor }} />
              <span className="text-xs font-semibold" style={{ color: primaryColor }}>{formatTimeDisplay(selectedTime)}</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Name */}
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: cssVars["--bk-text-dim"] }} />
                <input
                  placeholder="Tu nombre completo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full pl-10 h-11 rounded-xl text-sm outline-none transition-colors"
                  style={{
                    background: cssVars["--bk-input-bg"],
                    border: `1px solid ${cssVars["--bk-card-border"]}`,
                    color: cssVars["--bk-text"],
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = `${primaryColor}60`)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = cssVars["--bk-card-border"])}
                />
              </div>

              {/* Email */}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: cssVars["--bk-text-dim"] }} />
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full pl-10 h-11 rounded-xl text-sm outline-none transition-colors"
                  style={{
                    background: cssVars["--bk-input-bg"],
                    border: `1px solid ${cssVars["--bk-card-border"]}`,
                    color: cssVars["--bk-text"],
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = `${primaryColor}60`)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = cssVars["--bk-card-border"])}
                />
              </div>

              {/* Phone with country code dropdown */}
              <div className="relative flex gap-0">
                {/* Country code button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowCountryDropdown(!showCountryDropdown); }}
                    className="flex items-center gap-1 h-11 px-2.5 rounded-l-xl text-xs font-medium transition-colors"
                    style={{
                      background: cssVars["--bk-input-bg"],
                      border: `1px solid ${cssVars["--bk-card-border"]}`,
                      borderRight: "none",
                      color: cssVars["--bk-text"],
                    }}
                  >
                    <span className="text-sm">{selectedCountry.flag}</span>
                    <span>{countryCode}</span>
                    <ChevronDown className="w-3 h-3" style={{ color: cssVars["--bk-text-muted"] }} />
                  </button>

                  {/* Dropdown */}
                  {showCountryDropdown && (
                    <div
                      className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden shadow-xl z-50 w-48 max-h-48 overflow-y-auto"
                      style={{
                        background: cssVars["--bk-card"],
                        border: `1px solid ${cssVars["--bk-card-border"]}`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {COUNTRY_CODES.map((cc, idx) => (
                        <button
                          key={`${cc.code}-${cc.label}-${idx}`}
                          type="button"
                          onClick={() => { setCountryCode(cc.code); setShowCountryDropdown(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:opacity-80"
                          style={{
                            color: cssVars["--bk-text"],
                            background: countryCode === cc.code && selectedCountry.label === cc.label ? `${primaryColor}15` : "transparent",
                          }}
                        >
                          <span className="text-sm">{cc.flag}</span>
                          <span className="font-medium">{cc.label}</span>
                          <span style={{ color: cssVars["--bk-text-muted"] }}>{cc.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Phone input */}
                <input
                  type="tel"
                  placeholder="123 456 7890"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="flex-1 h-11 rounded-r-xl text-sm outline-none transition-colors px-3"
                  style={{
                    background: cssVars["--bk-input-bg"],
                    border: `1px solid ${cssVars["--bk-card-border"]}`,
                    borderLeft: "none",
                    color: cssVars["--bk-text"],
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = `${primaryColor}60`)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = cssVars["--bk-card-border"])}
                />
              </div>

              {/* Message */}
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4" style={{ color: cssVars["--bk-text-dim"] }} />
                <textarea
                  placeholder="Mensaje o notas (opcional)"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full pl-10 py-3 rounded-xl text-sm outline-none transition-colors min-h-[80px] resize-none"
                  style={{
                    background: cssVars["--bk-input-bg"],
                    border: `1px solid ${cssVars["--bk-card-border"]}`,
                    color: cssVars["--bk-text"],
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = `${primaryColor}60`)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = cssVars["--bk-card-border"])}
                />
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center"
                style={{ background: primaryColor, color: cssVars["--bk-bg"] }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Cita"}
              </button>
            </form>
          </div>
        )}

        {/* ===== CONFIRMED ===== */}
        {step === "confirmed" && selectedDate && selectedTime && (
          <div className="rounded-2xl p-8 text-center" style={{ background: cssVars["--bk-card"], border: `1px solid ${cssVars["--bk-card-border"]}` }}>
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: cssVars["--bk-text"] }}>¡Cita Confirmada!</h2>
            <p className="text-sm mb-4" style={{ color: cssVars["--bk-text-muted"] }}>Tu cita ha sido agendada exitosamente.</p>

            <div
              className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl"
              style={{ background: cssVars["--bk-input-bg"], border: `1px solid ${cssVars["--bk-card-border"]}` }}
            >
              <CalendarDays className="w-4 h-4" style={{ color: primaryColor }} />
              <span className="text-xs capitalize" style={{ color: cssVars["--bk-text"] }}>
                {selectedDate.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <Clock className="w-4 h-4" style={{ color: primaryColor }} />
              <span className="text-xs font-semibold" style={{ color: primaryColor }}>{formatTimeDisplay(selectedTime)}</span>
            </div>

            <p className="text-xs mt-6" style={{ color: cssVars["--bk-text-dim"] }}>Nos pondremos en contacto contigo pronto.</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[8px] mt-6" style={{ color: cssVars["--bk-text-dim"] }}>
          Powered by Connecta Creators
        </p>
      </div>
    </div>
  );
}