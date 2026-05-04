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
  const [agreedToTerms, setAgreedToTerms] = useState(false);

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
      }, { onConflict: "user_id", ignoreDuplicates: true });
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

            {/* Terms & Privacy checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none mt-1">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="sr-only"
                />
                <div
                  onClick={() => setAgreedToTerms(v => !v)}
                  className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                  style={{
                    background: agreedToTerms ? 'rgba(8,145,178,0.9)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${agreedToTerms ? 'rgba(8,145,178,0.9)' : 'rgba(8,145,178,0.3)'}`,
                  }}
                >
                  {agreedToTerms && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground leading-relaxed">
                {language === 'es'
                  ? <>Al marcar esta casilla, acepto la{' '}<a href="/privacy-policy" target="_blank" className="text-primary hover:underline">Política de Privacidad</a>{' '}y los{' '}<a href="/terms-and-conditions" target="_blank" className="text-primary hover:underline">Términos y Condiciones</a>{' '}de Connecta Creators.</>
                  : <>By checking this box, I agree to the{' '}<a href="/privacy-policy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>{' '}and{' '}<a href="/terms-and-conditions" target="_blank" className="text-primary hover:underline">Terms & Conditions</a>{' '}of Connecta Creators.</>
                }
              </span>
            </label>

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-muted-foreground text-xs">{tr(t.signup.orDivider, language)}</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={!agreedToTerms}
              className="w-full py-2.5 rounded-lg text-foreground text-sm transition-colors flex items-center justify-center gap-2 hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              <span className="text-orange-400 font-bold">G</span>
              {tr(t.signup.signUpGoogle, language)}
            </button>

            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              style={{ background: 'linear-gradient(135deg, #0891B2, #84CC16)', boxShadow: '0 4px 20px rgba(8,145,178,0.35)' }}
              className="w-full py-3 rounded-lg text-white font-bold text-sm transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
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
