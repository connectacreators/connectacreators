import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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
  const [submitting, setSubmitting] = useState(false);

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

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
      const res = await fetch(`${SUPABASE_URL}/functions/v1/public-booking?client_id=${clientId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(0,0%,6%)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(43,74%,49%)]" />
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="min-h-screen bg-[hsl(0,0%,6%)] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <CalendarDays className="w-12 h-12 text-[hsl(0,0%,30%)] mx-auto" />
          <p className="text-[hsl(0,0%,50%)] text-sm">Este calendario no está disponible.</p>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDow = getFirstDayOfWeek(calYear, calMonth);

  return (
    <div className="min-h-screen bg-[hsl(0,0%,6%)] flex items-center justify-center p-4" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-[hsl(43,74%,49%)]/10 border border-[hsl(43,74%,49%)]/20 flex items-center justify-center mx-auto mb-4">
            <CalendarDays className="w-6 h-6 text-[hsl(43,74%,49%)]" />
          </div>
          <h1 className="text-xl font-bold text-[hsl(0,0%,90%)] mb-1">{settings.booking_title}</h1>
          {clientName && <p className="text-xs text-[hsl(0,0%,50%)] uppercase tracking-widest">{clientName}</p>}
          {settings.booking_description && (
            <p className="text-sm text-[hsl(0,0%,60%)] mt-2">{settings.booking_description}</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-3 text-[hsl(0,0%,50%)] text-xs">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{settings.slot_duration_minutes} min</span>
          </div>
        </div>

        {/* Step indicator */}
        {step !== "confirmed" && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {(["date", "time", "form"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${step === s ? "bg-[hsl(43,74%,49%)]" : i < ["date", "time", "form"].indexOf(step) ? "bg-[hsl(43,74%,49%)]/50" : "bg-[hsl(0,0%,20%)]"}`} />
                {i < 2 && <div className={`w-8 h-px ${i < ["date", "time", "form"].indexOf(step) ? "bg-[hsl(43,74%,49%)]/50" : "bg-[hsl(0,0%,20%)]"}`} />}
              </div>
            ))}
          </div>
        )}

        {/* ===== DATE STEP ===== */}
        {step === "date" && (
          <div className="bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,16%)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }} className="p-1.5 hover:bg-[hsl(0,0%,15%)] rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4 text-[hsl(0,0%,60%)]" />
              </button>
              <span className="text-sm font-semibold text-[hsl(0,0%,90%)]">{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }} className="p-1.5 hover:bg-[hsl(0,0%,15%)] rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4 text-[hsl(0,0%,60%)]" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAY_NAMES.map((d) => (
                <span key={d} className="text-[10px] text-[hsl(0,0%,40%)] text-center font-medium">{d}</span>
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
                    className={`text-xs text-center w-9 h-9 rounded-lg transition-colors flex items-center justify-center mx-auto
                      ${isDisabled ? "text-[hsl(0,0%,25%)] cursor-not-allowed" : "text-[hsl(0,0%,80%)] hover:bg-[hsl(43,74%,49%)]/15 hover:text-[hsl(43,74%,49%)]"}
                      ${isToday && !isDisabled ? "border border-[hsl(43,74%,49%)]/40 font-bold" : ""}
                    `}
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
          <div className="bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,16%)] rounded-2xl p-5">
            <button onClick={() => setStep("date")} className="flex items-center gap-1.5 text-xs text-[hsl(0,0%,50%)] hover:text-[hsl(0,0%,80%)] transition-colors mb-4">
              <ChevronLeft className="w-3 h-3" />Cambiar fecha
            </button>

            <p className="text-sm font-semibold text-[hsl(0,0%,90%)] mb-1">
              {selectedDate.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <p className="text-xs text-[hsl(0,0%,50%)] mb-4">Selecciona un horario disponible</p>

            {slotsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[hsl(43,74%,49%)]" />
              </div>
            ) : availableSlots.length === 0 ? (
              <p className="text-xs text-[hsl(0,0%,40%)] text-center py-8">No hay horarios disponibles para esta fecha.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {availableSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => handleSelectTime(slot)}
                    className={`py-2.5 rounded-xl text-xs font-medium transition-all border
                      ${selectedTime === slot
                        ? "bg-[hsl(43,74%,49%)] text-[hsl(0,0%,5%)] border-[hsl(43,74%,49%)]"
                        : "border-[hsl(0,0%,18%)] text-[hsl(0,0%,70%)] hover:border-[hsl(43,74%,49%)]/40 hover:text-[hsl(43,74%,49%)]"
                      }`}
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
          <div className="bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,16%)] rounded-2xl p-5">
            <button onClick={() => setStep("time")} className="flex items-center gap-1.5 text-xs text-[hsl(0,0%,50%)] hover:text-[hsl(0,0%,80%)] transition-colors mb-4">
              <ChevronLeft className="w-3 h-3" />Cambiar horario
            </button>

            <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-[hsl(43,74%,49%)]/10 border border-[hsl(43,74%,49%)]/20">
              <CalendarDays className="w-4 h-4 text-[hsl(43,74%,49%)] flex-shrink-0" />
              <span className="text-xs text-[hsl(0,0%,80%)] capitalize">
                {selectedDate.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <Clock className="w-4 h-4 text-[hsl(43,74%,49%)] flex-shrink-0 ml-2" />
              <span className="text-xs font-semibold text-[hsl(43,74%,49%)]">{formatTimeDisplay(selectedTime)}</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(0,0%,35%)]" />
                <Input
                  placeholder="Tu nombre completo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="pl-10 bg-[hsl(0,0%,8%)] border-[hsl(0,0%,18%)] text-[hsl(0,0%,90%)] placeholder:text-[hsl(0,0%,35%)] h-11 rounded-xl text-sm"
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(0,0%,35%)]" />
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="pl-10 bg-[hsl(0,0%,8%)] border-[hsl(0,0%,18%)] text-[hsl(0,0%,90%)] placeholder:text-[hsl(0,0%,35%)] h-11 rounded-xl text-sm"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(0,0%,35%)]" />
                <Input
                  type="tel"
                  placeholder="+52 123 456 7890"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="pl-10 bg-[hsl(0,0%,8%)] border-[hsl(0,0%,18%)] text-[hsl(0,0%,90%)] placeholder:text-[hsl(0,0%,35%)] h-11 rounded-xl text-sm"
                />
              </div>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-[hsl(0,0%,35%)]" />
                <Textarea
                  placeholder="Mensaje o notas (opcional)"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="pl-10 bg-[hsl(0,0%,8%)] border-[hsl(0,0%,18%)] text-[hsl(0,0%,90%)] placeholder:text-[hsl(0,0%,35%)] rounded-xl text-sm min-h-[80px]"
                />
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-[hsl(43,74%,49%)] hover:bg-[hsl(43,74%,55%)] text-[hsl(0,0%,5%)] font-semibold text-sm"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Cita"}
              </Button>
            </form>
          </div>
        )}

        {/* ===== CONFIRMED ===== */}
        {step === "confirmed" && selectedDate && selectedTime && (
          <div className="bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,16%)] rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-[hsl(0,0%,90%)] mb-2">¡Cita Confirmada!</h2>
            <p className="text-sm text-[hsl(0,0%,60%)] mb-4">Tu cita ha sido agendada exitosamente.</p>

            <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,16%)]">
              <CalendarDays className="w-4 h-4 text-[hsl(43,74%,49%)]" />
              <span className="text-xs text-[hsl(0,0%,80%)] capitalize">
                {selectedDate.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <Clock className="w-4 h-4 text-[hsl(43,74%,49%)]" />
              <span className="text-xs font-semibold text-[hsl(43,74%,49%)]">{formatTimeDisplay(selectedTime)}</span>
            </div>

            <p className="text-xs text-[hsl(0,0%,40%)] mt-6">Nos pondremos en contacto contigo pronto.</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[8px] text-[hsl(0,0%,25%)] mt-6">
          Powered by Connecta Creators
        </p>
      </div>
    </div>
  );
}
