import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Loader2, Lock, FileDown } from "lucide-react";
import { useNavigate, useParams, Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import OnboardingFormBody from "@/components/onboarding/OnboardingFormBody";
import OnboardingSharePanel from "@/components/onboarding/OnboardingSharePanel";
import ArrivalChooser from "@/components/onboarding/fast/ArrivalChooser";
import FastOnboardingFlow from "@/components/onboarding/fast/FastOnboardingFlow";
import { exportOnboardingPdf } from "@/lib/onboarding/exportPdf";
import { EMPTY_ONBOARDING, normalizeOnboarding, prepareForSave, preservePasswords, PASSWORD_FIELDS, type OnboardingData } from "@/lib/onboarding/types";

type Gate = "loading" | "ok" | "closed" | "denied" | "needLogin" | "noClient";
type UiMode = "choose" | "fast" | "standard";

// Local draft persistence — survives reloads/remounts so unsaved edits are
// never lost. Cleared on an explicit Save/Submit.
const draftKey = (id: string) => `cac:onboarding-draft:${id}`;
function readDraft(id: string): OnboardingData | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ? normalizeOnboarding(parsed.data) : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string, data: OnboardingData) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
function clearDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

const Onboarding = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { clientId: paramClientId } = useParams<{ clientId?: string }>();

  const [gate, setGate] = useState<Gate>("loading");
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(null);
  const [perspective, setPerspective] = useState<"self" | "thirdParty">("self");
  const [accessOpen, setAccessOpen] = useState(false);
  const [aiCoach, setAiCoach] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uiMode, setUiMode] = useState<UiMode>("standard");
  const [formData, setFormData] = useState<OnboardingData>(EMPTY_ONBOARDING);

  const handleChange = (field: keyof OnboardingData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Resolve access + load data once auth has settled. Guarded so it only runs
  // ONCE per (client, user, role) target — switching tabs fires auth events
  // that must NOT re-fetch and clobber the in-progress form.
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    const key = `${paramClientId || ""}|${user?.id || ""}|${isAdmin}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;

    const run = async () => {
      // ── Admin or client filling a SPECIFIC client's form ──
      if (paramClientId) {
        if (!user) {
          setGate("needLogin");
          return;
        }
        const { data } = await supabase
          .from("clients")
          .select("id, name, email, user_id, onboarding_access_open, onboarding_ai_coach, onboarding_data")
          .eq("id", paramClientId)
          .maybeSingle();

        // RLS hides clients the caller may not see → treated as no access.
        if (!data) {
          setGate("denied");
          return;
        }

        const isGrantedClient = data.user_id === user.id;
        if (!isAdmin && !isGrantedClient) {
          setGate("denied");
          return;
        }
        if (!isAdmin && isGrantedClient && !data.onboarding_access_open) {
          setGate("closed");
          return;
        }

        setResolvedClientId(data.id);
        setPerspective(isAdmin ? "thirdParty" : "self");
        setAccessOpen(!!data.onboarding_access_open);
        setAiCoach(!!data.onboarding_ai_coach);
        setClientEmail(data.email || "");
        setClientName(data.name || "");
        const merged = normalizeOnboarding(data.onboarding_data as Record<string, unknown>);
        if (!merged.clientName && data.name) merged.clientName = data.name;
        if (!merged.email && data.email) merged.email = data.email;
        // Prefer a local unsaved draft over the stored copy.
        setFormData(readDraft(data.id) ?? merged);
        // Admins get the full form; clients pick voice/typed on arrival.
        setUiMode(isAdmin ? "standard" : "choose");
        setGate("ok");
        return;
      }

      // ── Logged-in user filling their OWN form (no clientId param) ──
      if (!user) {
        setGate("needLogin");
        return;
      }
      const { data } = await supabase
        .from("clients")
        .select("id, name, email, onboarding_ai_coach, onboarding_data")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        setGate("noClient");
        return;
      }
      setResolvedClientId(data.id);
      setPerspective("self");
      setAiCoach(!!data.onboarding_ai_coach);
      setClientName(data.name || "");
      setClientEmail(data.email || "");
      const merged = normalizeOnboarding(data.onboarding_data as Record<string, unknown>);
      if (!merged.clientName && data.name) merged.clientName = data.name;
      if (!merged.email && data.email) merged.email = data.email;
      setFormData(readDraft(data.id) ?? merged);
      setUiMode(isAdmin ? "standard" : "choose");
      setGate("ok");
    };

    setGate("loading");
    run();
  }, [authLoading, user, isAdmin, paramClientId]);

  // Admin AI companion can fill fields in real time.
  useEffect(() => {
    const handler = (e: Event) => {
      const fields = (e as CustomEvent).detail;
      if (fields && typeof fields === "object") {
        setFormData((prev) => normalizeOnboarding({ ...prev, ...fields }));
        toast.success("Your AI filled in some fields. Review and save when ready.");
      }
    };
    window.addEventListener("companion:fill-onboarding", handler);
    return () => window.removeEventListener("companion:fill-onboarding", handler);
  }, []);

  // Single persist path. silent=true → autosave (no validation, no toast/spinner).
  const persist = async (silent = false): Promise<boolean> => {
    if (!resolvedClientId) {
      if (!silent) toast.error("No client found");
      return false;
    }
    if (!silent && (!formData.clientName.trim() || !formData.email.trim())) {
      toast.error(`${perspective === "self" ? "Your" : "Client"} name and email are required`);
      return false;
    }
    const write = async () => {
      let payload = prepareForSave(formData);
      // Never let a blank password field overwrite a stored credential. The form
      // can carry blank passwords (a stale local draft, an AI fill that omits
      // them) and this save replaces the whole onboarding_data blob — so re-read
      // the stored copy and backfill any blanks before writing.
      if (PASSWORD_FIELDS.some((k) => !payload[k] || !payload[k].trim())) {
        const { data: cur } = await supabase
          .from("clients")
          .select("onboarding_data")
          .eq("id", resolvedClientId)
          .maybeSingle();
        payload = preservePasswords(payload, (cur?.onboarding_data as Record<string, unknown>) ?? null);
      }
      return supabase
        .from("clients")
        .update({ onboarding_data: payload as unknown as Record<string, unknown> })
        .eq("id", resolvedClientId);
    };

    if (silent) {
      const { error } = await write();
      return !error;
    }

    setSaving(true);
    try {
      const { error } = await write();
      if (error) {
        toast.error("Error saving form");
        return false;
      }
      clearDraft(resolvedClientId); // explicit save is now the source of truth
      toast.success(perspective === "self" ? "Thank you! Your information has been saved." : "Onboarding saved successfully!");
      return true;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persist(false);

  const handleExportPdf = () => {
    try {
      exportOnboardingPdf(formData, { name: clientName });
    } catch {
      toast.error("Allow pop-ups to export the PDF.");
    }
  };

  // Standard-mode autosave: debounce-persist edits so nothing is lost on tab
  // switch / refocus. (FAST mode handles its own autosave.)
  const didMountAutosave = useRef(false);
  useEffect(() => {
    if (gate !== "ok" || uiMode !== "standard" || !resolvedClientId) return;
    // Skip the first run right after data loads (no edits yet).
    if (!didMountAutosave.current) {
      didMountAutosave.current = true;
      return;
    }
    const t = setTimeout(() => { persist(true); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, gate, uiMode, resolvedClientId]);

  // Persist a local draft synchronously on every edit (both modes) so a tab
  // switch / reload before the debounced save never loses progress.
  useEffect(() => {
    if (gate !== "ok" || !resolvedClientId) return;
    writeDraft(resolvedClientId, formData);
  }, [formData, gate, resolvedClientId]);

  // ── Gate states ──
  if (authLoading || gate === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (gate === "needLogin") {
    const target = location.pathname + location.search;
    return <Navigate to={`/login?redirect=${encodeURIComponent(target)}`} replace />;
  }

  if (gate === "closed" || gate === "denied" || gate === "noClient") {
    const copy =
      gate === "closed"
        ? { title: "This form is closed", body: "The onboarding form isn't open for editing right now. Please check back with your team." }
        : gate === "noClient"
        ? { title: "No onboarding form yet", body: "There's no client profile linked to your account. Please contact your team." }
        : { title: "Form not available", body: "You don't have access to this onboarding form." };
    return (
      <div className="flex min-h-screen items-center justify-center gradient-dark p-6">
        <Card className="glass-card w-full max-w-lg border-0 shadow-card">
          <CardContent className="p-10 text-center">
            <Lock className="mx-auto mb-5 h-12 w-12 text-muted-foreground" />
            <h1 className="mb-2 text-2xl font-bold text-foreground">{copy.title}</h1>
            <p className="text-muted-foreground">{copy.body}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const self = perspective === "self";
  const showShare = isAdmin && !!paramClientId && !!resolvedClientId;

  // ── Client-facing FAST mode ──
  if (uiMode === "choose") {
    return (
      <div className="min-h-screen gradient-dark">
        <ArrivalChooser clientName={clientName} onChoose={(m) => setUiMode(m)} />
      </div>
    );
  }
  if (uiMode === "fast") {
    return (
      <div className="min-h-screen gradient-dark">
        <FastOnboardingFlow
          formData={formData}
          onChange={handleChange}
          onAutosave={() => persist(true)}
          onSubmit={() => persist(false)}
          saving={saving}
          onSwitchToStandard={() => setUiMode("standard")}
          aiCoach={aiCoach}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-dark p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 md:mb-8">
          {isAdmin && (
            <button
              onClick={() => navigate(-1)}
              className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <div className="mb-2 flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="bg-clip-text text-2xl font-bold text-transparent gradient-hero md:text-3xl">
              {self
                ? clientName
                  ? `Welcome, ${clientName}!`
                  : "Complete Your Onboarding"
                : "Brand Setup & Client Onboarding"}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {self ? "Fill out your brand information below" : "Complete this form with your client's information"}
          </p>
          <button
            onClick={() => setUiMode("fast")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
          >
            🎙️ {isAdmin ? "Preview voice mode" : "Prefer talking? Switch to voice mode"}
          </button>
        </div>

        {showShare && resolvedClientId && (
          <div className="mb-6">
            <OnboardingSharePanel
              clientId={resolvedClientId}
              defaultEmail={clientEmail}
              defaultName={clientName}
              accessOpen={accessOpen}
              onAccessChange={setAccessOpen}
              aiCoach={aiCoach}
              onAiCoachChange={setAiCoach}
            />
          </div>
        )}

        <Card className="glass-card border-0 shadow-card">
          <CardContent className="p-4 md:p-8">
            <OnboardingFormBody formData={formData} onChange={handleChange} perspective={perspective} />

            <div className="mt-8 flex flex-col gap-3 border-t border-border/50 pt-8 sm:flex-row">
              {isAdmin && (
                <Button variant="outline" onClick={() => navigate(-1)} className="sm:flex-1">
                  Cancel
                </Button>
              )}
              <Button
                variant="default"
                onClick={handleSave}
                disabled={saving || !formData.clientName || !formData.email}
                className="sm:flex-1"
                size="lg"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : self ? (
                  "Save & Submit"
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Privacy reassurance */}
        <p className="mx-auto mt-5 flex max-w-md items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" />
          <span>
            Your information stays private and secure — we never sell or share it. See our{" "}
            <Link to="/privacy-policy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/terms-and-conditions" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Terms &amp; Conditions
            </Link>
            .
          </span>
        </p>

        {/* Export + back to dashboard */}
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="outline" onClick={handleExportPdf} className="gap-2">
            <FileDown className="h-4 w-4" />
            Export answers (PDF)
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go back to main
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
