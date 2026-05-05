import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { t, tr } from "@/i18n/translations";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";

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

  useEffect(() => {
    const checkUserState = async () => {
      if (authLoading) return;
      if (!user) { setCheckingAuth(false); return; }
      if (isAdmin) { navigate("/dashboard", { replace: true }); return; }
      const { data: existing } = await supabase
        .from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (!existing) {
        // Fallback safety net for any edge case where the trigger didn't fire
        // (e.g. race during OAuth). Don't set credits — trust DB defaults.
        await supabase.from("clients").insert({
          user_id: user.id,
          name: user.user_metadata?.full_name || user.email,
          email: user.email,
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
    if (signupErr) { setError(signupErr.message); setLoading(false); return; }
    const { data: { user: newUser } } = await supabase.auth.getUser();
    if (newUser) {
      // The handle_new_user trigger already created the client row with the
      // correct default credits (1000/1000). Update only the fields we
      // collect from the form. Don't touch credit columns here — trust the
      // trigger so we can never accidentally regress the default.
      await supabase.from("clients")
        .update({
          name: fullName.trim(),
          email: email,
          phone: phone,
        })
        .eq("user_id", newUser.id);
    }
    setLoading(false);
    navigate("/dashboard", { replace: true });
  };

  const handleGoogleSignup = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/signup` },
    });
    if (error) toast.error(error.message);
  };

  if (checkingAuth || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#131315' }}>
        <div className="animate-spin rounded-full h-6 w-6 border-b border-white/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#131315' }}>
      <div className="absolute top-[-20%] left-[10%] w-[700px] h-[700px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 60%)', filter: 'blur(120px)' }} />
      <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(201,169,110,0.04) 0%, transparent 60%)', filter: 'blur(120px)' }} />

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-2xl px-10 py-12" style={{ background: '#16171a', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-center mb-8">
            <img src={connectaFavicon} alt="Connecta" className="w-10 h-10 object-contain mx-auto mb-5 opacity-90" />
            <h1 className="font-caslon text-xl sm:text-2xl font-light text-foreground leading-snug" style={{ letterSpacing: "0.02em" }}>
              {language === 'es' ? 'Crea tu cuenta' : 'Create your account'}
            </h1>
            <p className="text-muted-foreground text-xs mt-2 tracking-wide">
              {language === 'es' ? 'Empieza gratis. Sin tarjeta requerida.' : 'Start free. No card required.'}
            </p>
          </div>

          <form onSubmit={handleEmailSignup} className="space-y-3">
            <input
              type="text"
              placeholder={tr(t.signup.fullName, language)}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            <input
              type="email"
              placeholder={tr(t.signup.email, language)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            <input
              type="password"
              placeholder={tr(t.signup.password, language)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            <input
              type="tel"
              placeholder={tr(t.signup.phone, language)}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />

            {/* Terms checkbox — single click target via the input itself */}
            <div className="flex items-start gap-2.5 mt-2">
              <input
                id="agree-terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 cursor-pointer accent-white/80"
              />
              <label htmlFor="agree-terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none">
                {language === 'es'
                  ? <>Al marcar esta casilla, acepto la{' '}<a href="/privacy-policy" target="_blank" rel="noreferrer" className="text-foreground/80 underline">Política de Privacidad</a>{' '}y los{' '}<a href="/terms-and-conditions" target="_blank" rel="noreferrer" className="text-foreground/80 underline">Términos</a>{' '}de Connecta Creators.</>
                  : <>By checking this box, I agree to the{' '}<a href="/privacy-policy" target="_blank" rel="noreferrer" className="text-foreground/80 underline">Privacy Policy</a>{' '}and{' '}<a href="/terms-and-conditions" target="_blank" rel="noreferrer" className="text-foreground/80 underline">Terms</a>{' '}of Connecta Creators.</>}
              </label>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-muted-foreground/60 text-[10px] tracking-[0.2em] uppercase">{tr(t.signup.orDivider, language)}</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* Google ghost button with scribble */}
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={!agreedToTerms}
              className="relative w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white/75 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed overflow-visible"
            >
              <svg className="scribble-btn" viewBox="0 0 320 44" preserveAspectRatio="none" style={{ position: 'absolute', inset: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', overflow: 'visible', pointerEvents: 'none', opacity: 0 }}>
                <path d="M10,3 C80,1.5 220,1 290,2 C306,2.5 316,5 317,10 C318,17 318,27 317,34 C316,40 306,42 285,43 C200,44 100,44 30,43 C12,42 2,40 2,34 C1,26 1,15 2,10 C2.5,6 5,3.5 10,3 Z" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: 700 }} />
              </svg>
              <span className="text-orange-300/80 font-bold text-base">G</span>
              {tr(t.signup.signUpGoogle, language)}
            </button>

            {/* Primary CTA — ghost with scribble */}
            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="relative w-full inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white/85 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed overflow-visible mt-1"
            >
              <svg className="scribble-btn" viewBox="0 0 320 48" preserveAspectRatio="none" style={{ position: 'absolute', inset: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', overflow: 'visible', pointerEvents: 'none', opacity: 0 }}>
                <path d="M10,3 C80,1.5 220,1 290,2 C306,2.5 316,5 317,10 C318,18 318,30 317,38 C316,44 306,46 285,47 C200,48 100,48 30,47 C12,46 2,43 2,38 C1,29 1,17 2,10 C2.5,6 5,3.5 10,3 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: 700 }} />
              </svg>
              {loading ? "..." : (language === 'es' ? 'Crear cuenta gratis →' : 'Create free account →')}
            </button>

            <p className="text-center text-xs text-muted-foreground mt-4">
              {tr(t.signup.alreadyAccount, language)}{" "}
              <a href="/scripts" className="text-foreground/80 underline">
                {tr(t.signup.signInLink, language)}
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
