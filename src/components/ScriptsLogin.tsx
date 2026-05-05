import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LanguageToggle from "@/components/LanguageToggle";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  onSignIn: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
};

export default function ScriptsLogin({ onSignIn, signInWithEmail }: Props) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [wordIndex, setWordIndex] = useState(0);
  const words = t.login.headlineWords[language];

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((i) => (i + 1) % words.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [words.length]);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isForgot, setIsForgot] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = useCallback(async () => {
    if (!identifier.trim()) { toast.error(tr(t.login.enterEmail, language)); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(identifier, {
      redirectTo: `${window.location.origin}/scripts`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success(tr(t.login.checkEmail, language));
  }, [identifier, language]);

  const resolveEmail = async (input: string): Promise<string | null> => {
    if (input.includes("@")) return input;
    const { data, error } = await supabase
      .from("profiles").select("email").eq("username", input.trim().toLowerCase()).maybeSingle();
    if (error || !data?.email) {
      toast.error(tr(t.login.userNotFound, language));
      return null;
    }
    return data.email;
  };

  const handleEmailAuth = async () => {
    if (!identifier.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const email = await resolveEmail(identifier);
      if (!email) { setLoading(false); return; }
      const { error } = await signInWithEmail(email, password);
      if (error) toast.error(error.message);
      else { onSignIn(); navigate("/dashboard"); }
    } catch {
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) toast.error(error.message);
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    transition: 'border-color 0.2s',
  };

  return (
    <div className="min-h-screen flex flex-col px-4 relative overflow-hidden" style={{ background: '#131315' }}>
      <div className="absolute top-[-20%] left-[10%] w-[700px] h-[700px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 60%)', filter: 'blur(120px)' }} />
      <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(201,169,110,0.04) 0%, transparent 60%)', filter: 'blur(120px)' }} />

      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <LanguageToggle />
      </div>

      <div className="flex-1 flex items-center justify-center pt-12 relative z-10">
        <div className="w-full max-w-md rounded-2xl px-10 py-12 space-y-6" style={{ background: '#16171a', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-center">
            <img src={connectaFavicon} alt="Connecta" className="w-10 h-10 object-contain mx-auto mb-5 opacity-90" />
            <h1 className="font-caslon text-xl sm:text-2xl font-light text-foreground leading-snug" style={{ letterSpacing: "0.02em" }}>
              {(words[wordIndex] as any).pre}{" "}
              <span className="inline-block relative" style={{ minWidth: "4ch" }}>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={(words[wordIndex] as any).word}
                    initial={{ y: 12, opacity: 0, filter: "blur(4px)" }}
                    animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: -12, opacity: 0, filter: "blur(4px)" }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="text-foreground/60 italic inline-block"
                  >
                    {(words[wordIndex] as any).word}
                  </motion.span>
                </AnimatePresence>
              </span>{" "}
              {tr(t.login.headlinePost, language)}
            </h1>
            <p className="text-xs text-muted-foreground mt-2 tracking-wide">
              {isForgot ? tr(t.login.forgotPrompt, language) : tr(t.login.signInToContinue, language)}
            </p>
          </div>

          <div className="space-y-3">
            {isForgot ? (
              <>
                <input
                  type="email"
                  placeholder={tr(t.login.emailOnly, language)}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                  className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                />
                <button
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="relative w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white/85 hover:text-white transition-colors disabled:opacity-30 overflow-visible"
                >
                  <svg className="scribble-btn" viewBox="0 0 320 44" preserveAspectRatio="none" style={{ position: 'absolute', inset: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', overflow: 'visible', pointerEvents: 'none', opacity: 0 }}>
                    <path d="M10,3 C80,1.5 220,1 290,2 C306,2.5 316,5 317,10 C318,17 318,27 317,34 C316,40 306,42 285,43 C200,44 100,44 30,43 C12,42 2,40 2,34 C1,26 1,15 2,10 C2.5,6 5,3.5 10,3 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: 700 }} />
                  </svg>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {tr(t.login.sendResetLink, language)}
                </button>
                <button onClick={() => setIsForgot(false)} className="text-xs text-muted-foreground/70 hover:text-foreground underline w-full text-center">
                  {tr(t.login.backToLogin, language)}
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder={tr(t.login.emailPlaceholder, language)}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                />
                <input
                  type="password"
                  placeholder={tr(t.login.password, language)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
                  className="w-full px-3 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                />
                <button
                  onClick={handleEmailAuth}
                  disabled={loading}
                  className="relative w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white/85 hover:text-white transition-colors disabled:opacity-30 overflow-visible"
                >
                  <svg className="scribble-btn" viewBox="0 0 320 44" preserveAspectRatio="none" style={{ position: 'absolute', inset: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', overflow: 'visible', pointerEvents: 'none', opacity: 0 }}>
                    <path d="M10,3 C80,1.5 220,1 290,2 C306,2.5 316,5 317,10 C318,17 318,27 317,34 C316,40 306,42 285,43 C200,44 100,44 30,43 C12,42 2,40 2,34 C1,26 1,15 2,10 C2.5,6 5,3.5 10,3 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: 700 }} />
                  </svg>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {tr(t.login.signIn, language)}
                </button>
                <button onClick={() => setIsForgot(true)} className="text-xs text-muted-foreground/70 hover:text-foreground underline w-full text-center">
                  {tr(t.login.forgotPassword, language)}
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-muted-foreground/60 text-[10px] tracking-[0.2em] uppercase">{tr(t.login.or, language)}</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <button
            onClick={handleGoogle}
            className="relative w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white/75 hover:text-white transition-colors overflow-visible"
          >
            <svg className="scribble-btn" viewBox="0 0 320 44" preserveAspectRatio="none" style={{ position: 'absolute', inset: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', overflow: 'visible', pointerEvents: 'none', opacity: 0 }}>
              <path d="M10,3 C80,1.5 220,1 290,2 C306,2.5 316,5 317,10 C318,17 318,27 317,34 C316,40 306,42 285,43 C200,44 100,44 30,43 C12,42 2,40 2,34 C1,26 1,15 2,10 C2.5,6 5,3.5 10,3 Z" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: 700 }} />
            </svg>
            <span className="text-orange-300/80 font-bold text-base">G</span>
            {tr(t.login.continueGoogle, language)}
          </button>

          {!isForgot && (
            <p className="text-center text-xs text-muted-foreground">
              {tr(t.login.noAccount, language)}{" "}
              <a href="/signup" className="text-foreground/80 underline">
                {tr(t.login.signUp, language)}
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="py-6 flex justify-center relative z-10">
        <a href="/" className="font-caslon text-base text-foreground/60 hover:text-foreground transition-colors" style={{ letterSpacing: "0.02em" }}>
          Connecta
        </a>
      </div>
    </div>
  );
}
