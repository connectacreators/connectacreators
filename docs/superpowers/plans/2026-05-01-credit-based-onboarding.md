# Credit-Based Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove credit card from signup, give users 1,000 free trial credits on account creation, let them navigate the full app freely, and show an "Out of Credits" modal instead of an error when they run out.

**Architecture:** Simplify Signup.tsx to 1 step (account creation only) that auto-seeds 1,000 credits. Add a global OutOfCreditsContext + modal that renders at the app root and is triggered by any insufficient-credits error anywhere in the app. Remove useSubscriptionGuard calls from user-facing pages so navigation is unrestricted.

**Tech Stack:** React, TypeScript, Supabase (supabase-js), Stripe (EmbeddedCheckout), React Router, Sonner (toasts)

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/pages/Signup.tsx` |
| Modify | `src/pages/Scripts.tsx` |
| Modify | `src/pages/Dashboard.tsx` |
| Modify | `src/pages/LeadCalendar.tsx` |
| Modify | `src/pages/LeadTracker.tsx` |
| Modify | `src/App.tsx` |
| Modify | `src/pages/Subscription.tsx` |
| Modify | `src/components/canvas/CanvasAIPanel.tsx` |
| Modify | `supabase/functions/check-subscription/index.ts` |
| Create | `src/contexts/OutOfCreditsContext.tsx` |
| Create | `src/components/OutOfCreditsModal.tsx` |

---

### Task 1: Simplify Signup.tsx to 1 step

**Files:**
- Modify: `src/pages/Signup.tsx`

The goal is: account creation → client record with 1,000 credits → redirect to `/dashboard`. Steps 2 (plan) and 3 (Stripe) are deleted. The Google OAuth path also needs to create the client record with credits on its callback.

- [ ] **Step 1: Replace the full file content**

Replace `src/pages/Signup.tsx` with this:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { t, tr } from "@/i18n/translations";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

export default function Signup() {
  const { user, signUpWithEmail, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // On mount / auth change: if already authenticated, ensure client record exists then go to dashboard
  useEffect(() => {
    const checkUserState = async () => {
      if (authLoading) return;
      if (!user) {
        setCheckingAuth(false);
        return;
      }

      if (isAdmin) {
        navigate("/dashboard", { replace: true });
        return;
      }

      // Ensure client record exists (handles Google OAuth callback)
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("clients").insert({
          user_id: user.id,
          name: user.user_metadata?.full_name || user.email,
          email: user.email,
          plan_type: null,
          subscription_status: null,
          credits_balance: 1000,
          credits_monthly_cap: 1000,
        });
      }

      navigate("/dashboard", { replace: true });
    };
    checkUserState();
  }, [user, authLoading, isAdmin, navigate]);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signupErr } = await signUpWithEmail(email, password, fullName.trim());
    if (signupErr) {
      setError(signupErr.message);
      setLoading(false);
      return;
    }

    const { data: { user: newUser } } = await supabase.auth.getUser();
    if (newUser) {
      await supabase.from("clients").upsert({
        user_id: newUser.id,
        name: fullName.trim(),
        email: email,
        phone: phone,
        plan_type: null,
        subscription_status: null,
        credits_balance: 1000,
        credits_monthly_cap: 1000,
      }, { onConflict: "user_id" });
    }

    setLoading(false);
    navigate("/dashboard", { replace: true });
  };

  const handleGoogleSignup = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/signup`,
      },
    });
    if (error) toast.error(error.message);
  };

  if (checkingAuth || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(218 33% 4%) 0%, hsl(210 8% 10%) 50%, hsl(218 33% 4%) 100%)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#060a0f' }}>
      <div className="absolute top-[-30%] left-[-10%] w-[800px] h-[800px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(8,145,178,0.18) 0%, transparent 60%)', filter: 'blur(80px)' }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(132,204,22,0.12) 0%, transparent 60%)', filter: 'blur(80px)' }} />
      <div className="w-full max-w-md relative z-10">
        <div className="rounded-2xl p-8 relative overflow-hidden" style={{ background: 'rgba(15,20,30,0.85)', border: '1px solid rgba(8,145,178,0.25)', boxShadow: '0 0 60px rgba(8,145,178,0.08), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(8,145,178,0.6), rgba(132,204,22,0.4), transparent)' }} />
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold tracking-wide text-gradient-brand">CONNECTA CREATORS</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {language === 'es' ? 'Crea tu cuenta gratis' : 'Create your free account'}
            </p>
          </div>

          <form onSubmit={handleEmailSignup} className="space-y-3">
            <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
              {tr(t.signup.yourInfo, language)}
            </div>

            <input
              type="text"
              placeholder={tr(t.signup.fullName, language)}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-[rgba(8,145,178,0.6)] focus:shadow-[0_0_0_3px_rgba(8,145,178,0.15)]"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(8,145,178,0.3)', transition: 'border-color 0.2s, box-shadow 0.2s' }}
            />
            <input
              type="email"
              placeholder={tr(t.signup.email, language)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-[rgba(8,145,178,0.6)] focus:shadow-[0_0_0_3px_rgba(8,145,178,0.15)]"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(8,145,178,0.3)', transition: 'border-color 0.2s, box-shadow 0.2s' }}
            />
            <input
              type="password"
              placeholder={tr(t.signup.password, language)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-[rgba(8,145,178,0.6)] focus:shadow-[0_0_0_3px_rgba(8,145,178,0.15)]"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(8,145,178,0.3)', transition: 'border-color 0.2s, box-shadow 0.2s' }}
            />
            <input
              type="tel"
              placeholder={tr(t.signup.phone, language)}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-[rgba(8,145,178,0.6)] focus:shadow-[0_0_0_3px_rgba(8,145,178,0.15)]"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(8,145,178,0.3)', transition: 'border-color 0.2s, box-shadow 0.2s' }}
            />

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-muted-foreground text-xs">{tr(t.signup.orDivider, language)}</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignup}
              className="w-full py-2.5 rounded-lg text-foreground text-sm transition-colors flex items-center justify-center gap-2 hover:brightness-125"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              <span className="text-orange-400 font-bold">G</span>
              {tr(t.signup.signUpGoogle, language)}
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{ background: 'linear-gradient(135deg, #0891B2, #84CC16)', boxShadow: '0 4px 20px rgba(8,145,178,0.35)' }}
              className="w-full py-3 rounded-lg text-white font-bold text-sm transition-all hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "..." : (language === 'es' ? 'Crear cuenta gratis →' : 'Create free account →')}
            </button>

            <p className="text-center text-xs text-muted-foreground mt-3">
              {tr(t.signup.alreadyAccount, language)}{" "}
              <a href="/scripts" className="text-primary hover:underline">
                {tr(t.signup.signInLink, language)}
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app builds**

```bash
cd /Users/admin/Documents/connectacreators && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. If there are errors about removed variables (`step`, `selectedPlan`, etc.), they are cleaned up by the full replacement above.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Signup.tsx
git commit -m "feat(signup): remove plan/payment steps, seed 1000 trial credits on signup"
```

---

### Task 2: Remove useSubscriptionGuard from user pages

**Files:**
- Modify: `src/pages/Scripts.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/LeadCalendar.tsx`
- Modify: `src/pages/LeadTracker.tsx`

- [ ] **Step 1: Find exact import and usage lines in each file**

```bash
grep -n "useSubscriptionGuard" \
  src/pages/Scripts.tsx \
  src/pages/Dashboard.tsx \
  src/pages/LeadCalendar.tsx \
  src/pages/LeadTracker.tsx
```

Note the line numbers for each file. You will remove the import line and the hook call line.

- [ ] **Step 2: Remove from Scripts.tsx**

Find the line that imports `useSubscriptionGuard` (e.g. `import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";`) and delete it.

Find the line that calls `useSubscriptionGuard()` inside the component (e.g. `useSubscriptionGuard();`) and delete it.

- [ ] **Step 3: Remove from Dashboard.tsx**

Same as above. The call in Dashboard.tsx has options: `useSubscriptionGuard({ skipRedirect: true, skipReconcile: justPaid })` — delete the entire line including the options object. Also check if `justPaid` variable is used elsewhere in the file; if it was only used by the guard call, remove its declaration too.

```bash
grep -n "justPaid\|useSubscriptionGuard" src/pages/Dashboard.tsx
```

- [ ] **Step 4: Remove from LeadCalendar.tsx and LeadTracker.tsx**

Same pattern — delete the import line and the hook call line in each file.

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Scripts.tsx src/pages/Dashboard.tsx src/pages/LeadCalendar.tsx src/pages/LeadTracker.tsx
git commit -m "feat(auth): remove subscription guard from user-facing pages"
```

---

### Task 3: Create OutOfCreditsContext

**Files:**
- Create: `src/contexts/OutOfCreditsContext.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/contexts/OutOfCreditsContext.tsx
import { createContext, useContext, useState, ReactNode } from "react";

interface OutOfCreditsContextType {
  isOpen: boolean;
  showOutOfCreditsModal: () => void;
  hideOutOfCreditsModal: () => void;
}

const OutOfCreditsContext = createContext<OutOfCreditsContextType | null>(null);

export function OutOfCreditsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <OutOfCreditsContext.Provider
      value={{
        isOpen,
        showOutOfCreditsModal: () => setIsOpen(true),
        hideOutOfCreditsModal: () => setIsOpen(false),
      }}
    >
      {children}
    </OutOfCreditsContext.Provider>
  );
}

export function useOutOfCredits() {
  const ctx = useContext(OutOfCreditsContext);
  if (!ctx) throw new Error("useOutOfCredits must be used within OutOfCreditsProvider");
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/OutOfCreditsContext.tsx
git commit -m "feat(credits): add OutOfCreditsContext with show/hide modal state"
```

---

### Task 4: Create OutOfCreditsModal component

**Files:**
- Create: `src/components/OutOfCreditsModal.tsx`

The modal has two phases: plan cards → EmbeddedCheckout. Clicking a plan calls `create-checkout` (same edge function as Signup used), gets a `clientSecret`, then renders Stripe's EmbeddedCheckout inline. After payment Stripe redirects to `/payment-success` and the modal closes naturally.

- [ ] **Step 1: Create the file**

```tsx
// src/components/OutOfCreditsModal.tsx
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { X } from "lucide-react";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const stripePromise = loadStripe(
  "pk_live_51T1wYhCp1qPE081LgFT3WQBCIjLkFTbpqRjKtVIgRk9rXZpQQJcVpWqJuafMFnKlhHFolIlYx7rIy1dSuH8hIjMz00rlJINFjF"
);

const PLANS = [
  { key: "starter" as const, name: "Starter", price: 39, credits: "10,000", scrapes: 8, scripts: 75 },
  { key: "growth" as const, name: "Growth", price: 79, credits: "30,000", scrapes: 15, scripts: 200, popular: true },
  { key: "enterprise" as const, name: "Enterprise", price: 139, credits: "75,000", scrapes: 25, scripts: 500 },
];

type PlanKey = "starter" | "growth" | "enterprise";

export default function OutOfCreditsModal() {
  const { isOpen, hideOutOfCreditsModal } = useOutOfCredits();
  const { user } = useAuth();
  const [phase, setPhase] = useState<"plans" | "checkout">("plans");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePlanSelect = async (planKey: PlanKey) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const session = refreshed?.session;
      if (!session) {
        setError("Session expired. Please sign in again.");
        setLoading(false);
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: { plan_type: planKey, phone: "" },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (fnErr || !data?.client_secret) {
        setError(fnErr?.message || "Failed to initialize payment");
        setLoading(false);
        return;
      }
      setClientSecret(data.client_secret);
      setPhase("checkout");
    } catch (err: any) {
      setError(err.message || "Payment initialization failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    hideOutOfCreditsModal();
    setPhase("plans");
    setClientSecret(null);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg">
        {/* Header */}
        <div
          className="px-7 pt-7 pb-5 relative"
          style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }}
        >
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full transition-colors hover:bg-white/20"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <p className="text-white text-xl font-bold mb-1.5">
            You're out of credits!
          </p>
          <p className="text-slate-400 text-sm">
            Choose a plan to keep going. Upgrade anytime, cancel anytime.
          </p>
        </div>

        {/* Plans phase */}
        {phase === "plans" && (
          <div className="p-5 bg-slate-50 flex flex-col gap-3">
            {PLANS.map((plan) => (
              <button
                key={plan.key}
                onClick={() => handlePlanSelect(plan.key)}
                disabled={loading}
                className="w-full text-left rounded-xl p-4 flex items-center justify-between transition-all disabled:opacity-50 relative"
                style={
                  plan.popular
                    ? { background: "#0f172a", border: "2px solid #3b82f6" }
                    : { background: "#fff", border: "1.5px solid #e2e8f0" }
                }
              >
                {plan.popular && (
                  <span
                    className="absolute -top-2.5 left-4 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{ background: "#3b82f6", color: "#fff" }}
                  >
                    MOST POPULAR
                  </span>
                )}
                <div>
                  <p
                    className={`font-bold text-[15px] ${
                      plan.popular ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {plan.name}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      plan.popular ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {plan.credits} credits · {plan.scripts} scripts ·{" "}
                    {plan.scrapes} scrapes
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p
                    className={`font-extrabold text-lg ${
                      plan.popular ? "text-white" : "text-slate-900"
                    }`}
                  >
                    ${plan.price}
                    <span className="text-xs font-normal text-slate-400">
                      /mo
                    </span>
                  </p>
                  <span
                    className="mt-1.5 inline-block text-xs font-semibold px-3 py-1 rounded-full"
                    style={{
                      background: plan.popular ? "#3b82f6" : "#0f172a",
                      color: "#fff",
                    }}
                  >
                    {loading ? "..." : `Choose ${plan.name}`}
                  </span>
                </div>
              </button>
            ))}
            {error && (
              <p className="text-red-500 text-xs text-center">{error}</p>
            )}
            <button
              onClick={handleClose}
              className="text-slate-400 text-xs text-center mt-1 hover:text-slate-600 transition-colors"
            >
              Maybe later — dismiss
            </button>
          </div>
        )}

        {/* Checkout phase */}
        {phase === "checkout" && clientSecret && (
          <div className="p-5">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
            <button
              onClick={() => {
                setPhase("plans");
                setClientSecret(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-3 transition-colors"
            >
              ← Back to plans
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/OutOfCreditsModal.tsx
git commit -m "feat(credits): add OutOfCreditsModal with plan selection and embedded Stripe checkout"
```

---

### Task 5: Wire OutOfCreditsProvider and modal into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports to App.tsx**

After the existing `import { LeadNotificationProvider }` line, add:

```tsx
import { OutOfCreditsProvider } from "@/contexts/OutOfCreditsContext";
import OutOfCreditsModal from "@/components/OutOfCreditsModal";
```

- [ ] **Step 2: Wrap app with provider and add modal**

Find this block in App.tsx:

```tsx
      <LeadNotificationProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <FloatingUploadProgress />
```

Replace it with:

```tsx
      <LeadNotificationProvider>
      <OutOfCreditsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <FloatingUploadProgress />
          <OutOfCreditsModal />
```

Then close the provider — find the closing tags at the bottom of the App component:

```tsx
      </TooltipProvider>
      </LeadNotificationProvider>
```

Replace with:

```tsx
      </TooltipProvider>
      </OutOfCreditsProvider>
      </LeadNotificationProvider>
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(credits): wire OutOfCreditsProvider and modal into app root"
```

---

### Task 6: Wire credit failure in CanvasAIPanel to modal

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx`

- [ ] **Step 1: Add hook import**

Near the top of CanvasAIPanel.tsx, find the existing imports (look for `import { useAuth }` or similar hooks). Add:

```tsx
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
```

- [ ] **Step 2: Destructure the hook inside the component**

Find where other hooks are called inside the component function (near `useAuth`, `useCredits`, etc.). Add:

```tsx
const { showOutOfCreditsModal } = useOutOfCredits();
```

- [ ] **Step 3: Replace the insufficient_credits toast with modal**

Find these lines (around line 1307):

```tsx
        if (errData.insufficient_credits) {
          toast.error(`Not enough credits. Need 100 credits for deep research.`);
        } else {
```

Replace with:

```tsx
        if (errData.insufficient_credits) {
          showOutOfCreditsModal();
        } else {
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.tsx
git commit -m "feat(credits): show OutOfCreditsModal instead of toast on deep-research credit failure"
```

---

### Task 7: Find and wire remaining edge function credit errors

**Files:**
- Modify: any files that invoke `transcribe-video`, `ai-build-script`, `batch-generate-scripts`, `transcribe-canvas-media`, `ai-assistant` and handle their error responses

- [ ] **Step 1: Find all frontend invocations of the credit-costing edge functions**

```bash
grep -rn "transcribe-video\|ai-build-script\|batch-generate-scripts\|transcribe-canvas-media\|ai-assistant" \
  src/ --include="*.tsx" --include="*.ts" -l
```

Note all files returned.

- [ ] **Step 2: For each file, find the error response handler**

```bash
grep -n "insufficient_credits\|errData\|error.*credits\|res\.ok\|fnErr" \
  <each-file-from-step-1>
```

For each file that invokes one of these functions, look for the block that handles a failed response. It will look like one of:

```tsx
// Pattern A — fetch API
if (!res.ok) {
  const errData = await res.json().catch(() => ({}));
  // ... error handling
}

// Pattern B — supabase.functions.invoke
if (fnErr || data?.error) {
  toast.error(...)
}
```

- [ ] **Step 3: Add showOutOfCreditsModal to each file that needs it**

For each file, add the import and hook call (same as Task 6 Steps 1-2), then update the error handler to check `insufficient_credits`:

```tsx
// Pattern A — fetch API response
if (!res.ok) {
  const errData = await res.json().catch(() => ({}));
  if (errData.insufficient_credits) {
    showOutOfCreditsModal();
    return;
  }
  toast.error(errData.error || "Operation failed");
  return;
}

// Pattern B — supabase.functions.invoke
if (fnErr || data?.error) {
  if (data?.insufficient_credits) {
    showOutOfCreditsModal();
    return;
  }
  toast.error(fnErr?.message || data?.error || "Operation failed");
  return;
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(credits): wire OutOfCreditsModal to all edge function credit failures"
```

---

### Task 8: Add Free Trial state to Subscription page

**Files:**
- Modify: `src/pages/Subscription.tsx`

When `credits.plan_type` is null and there's no active Stripe subscription (`stripeStatus` is null), show a "Free Trial" badge so users understand their status.

- [ ] **Step 1: Add isFreeTrial derived value**

In Subscription.tsx, find the derived values block (around line 307, after `const planKey = credits.plan_type ?? "free"`). Add this line immediately after that block:

```tsx
const isFreeTrial = !credits.plan_type && !stripeStatus && !statusLoading;
```

- [ ] **Step 2: Add Free Trial badge to the status badge section**

Find the `showStatusBadge` block (around line 357):

```tsx
  const showStatusBadge = stripeStatus && (
    stripeStatus.status === "trialing" ||
    isCanceling ||
    stripeStatus.status === "past_due" ||
    isCanceled ||
    isPendingDowngrade
  );
```

Replace with:

```tsx
  const showStatusBadge = isFreeTrial || (stripeStatus && (
    stripeStatus.status === "trialing" ||
    isCanceling ||
    stripeStatus.status === "past_due" ||
    isCanceled ||
    isPendingDowngrade
  ));
```

- [ ] **Step 3: Add Free Trial badge text and style**

Find the `statusBadgeText` block. Add `isFreeTrial` as the first condition:

```tsx
  const statusBadgeText = isFreeTrial
    ? (en ? "Free Trial" : "Prueba Gratis")
    : isPendingDowngrade
    ? (en ? `Downgrades to ${pendingPlanLabel} on ${pendingEffectiveDate}` : `Cambia a ${pendingPlanLabel} el ${pendingEffectiveDate}`)
    : isCanceled
    ? (en ? "Canceled" : "Cancelada")
    : isCanceling
    ? (en ? "Cancels at period end" : "Se cancela al final del período")
    : stripeStatus?.status === "trialing"
    ? (en ? "Trialing" : "Prueba")
    : stripeStatus?.status === "past_due"
    ? (en ? "Past due" : "Pago pendiente")
    : "";
```

Find the `statusBadgeClass` block. Add `isFreeTrial` as the first condition:

```tsx
  const statusBadgeClass = isFreeTrial
    ? "bg-blue-500/15 text-blue-400"
    : isCanceled || stripeStatus?.status === "past_due"
    ? "bg-red-500/15 text-red-400"
    : isPendingDowngrade
    ? "bg-amber-500/15 text-amber-400"
    : "bg-amber-500/15 text-amber-400";
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Subscription.tsx
git commit -m "feat(subscription): show Free Trial badge for users with no active plan"
```

---

### Task 9: Guard check-subscription edge function for null stripe_customer_id

**Files:**
- Modify: `supabase/functions/check-subscription/index.ts`

Free-trial users have no Stripe customer. If `check-subscription` is called for them (e.g., via `useSubscriptionGuard` in SelectPlan), it must exit immediately without touching DB fields so it doesn't wipe their trial credits.

- [ ] **Step 1: Read the getPrimaryClientId and main handler flow**

```bash
sed -n '40,120p' supabase/functions/check-subscription/index.ts
```

Find the point where the function fetches the client record from the DB and then attempts to look up a Stripe customer. It will look something like:

```ts
const { data: clientData } = await adminClient
  .from("clients")
  .select("stripe_customer_id, email, ...")
  .eq("id", clientId)
  .single();
```

- [ ] **Step 2: Add early-return guard after client record fetch**

Immediately after the client record is fetched, add:

```ts
// Free-trial users have no Stripe customer — skip without modifying DB
if (!clientData?.stripe_customer_id) {
  logStep("No stripe_customer_id — free trial user, skipping sync");
  return new Response(
    JSON.stringify({ status: "free_trial", message: "No Stripe customer" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}
```

- [ ] **Step 3: Verify the function deploys without syntax errors**

```bash
cd /Users/admin/Documents/connectacreators && npx supabase functions deploy check-subscription --no-verify-jwt 2>&1 | tail -20
```

Expected: `Deployed Functions check-subscription` with no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/check-subscription/index.ts
git commit -m "fix(check-subscription): early-return for free-trial users with no Stripe customer"
```

---

### Task 10: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test new user signup**

1. Open `http://localhost:8080/signup` (or whatever port dev runs on)
2. Fill in name, email, password — submit
3. Verify: redirected to `/dashboard` immediately (no plan step, no Stripe)
4. Open Supabase table `clients` — confirm the new row has `credits_balance: 1000`, `credits_monthly_cap: 1000`, `subscription_status: null`

- [ ] **Step 3: Test free navigation**

1. As the new user, click through: Dashboard, Scripts, Lead Tracker, Lead Calendar
2. Verify: no redirects to `/signup`, full app accessible

- [ ] **Step 4: Test Subscription page free trial state**

1. Navigate to `/subscription`
2. Verify: plan shows "Free" label with blue "Free Trial" badge
3. Verify: upgrade plan cards are visible and functional (clicking one opens the Out of Credits modal plan selection flow, or you can test from the subscription page directly)

- [ ] **Step 5: Test Out of Credits modal**

1. Go to `src/contexts/OutOfCreditsContext.tsx`
2. Temporarily add `const [isOpen, setIsOpen] = useState(true)` (starts open) to test the modal UI
3. Verify: modal renders with plan cards, Growth is highlighted in blue, no emojis, dismiss works
4. Revert the temporary change back to `useState(false)`

- [ ] **Step 6: Push to main and deploy**

```bash
git push origin main
```

CI/CD pipeline auto-builds and deploys via GitHub Actions.
