import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import LanguageToggle from "@/components/LanguageToggle";
import { Input } from "@/components/ui/input";
import { LogIn, Mail, Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import connectaLoginLogo from "@/assets/connecta-logo-text-light.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-text-dark.png";
import { AnimatePresence, motion } from "framer-motion";
import BorderGlow from "@/components/ui/BorderGlow";

type Props = {
  onSignIn: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
};

export default function ScriptsLogin({ onSignIn, signInWithEmail }: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
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
      .from("profiles")
      .select("email")
      .eq("username", input.trim().toLowerCase())
      .maybeSingle();
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
      else {
        onSignIn();
        navigate("/dashboard");
      }
    } catch (err) {
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background ambient-glow flex flex-col px-4" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <LanguageToggle />
      </div>
      <div className="flex-1 flex items-center justify-center pt-16">
      <div className="w-full max-w-xs sm:max-w-sm glass-card rounded-2xl p-6 sm:p-8 space-y-4 sm:space-y-6">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground whitespace-nowrap">
            {(words[wordIndex] as any).pre}{" "}
            <span className="inline-block relative" style={{ minWidth: "7ch" }}>
              <AnimatePresence mode="wait">
                <motion.span
                  key={(words[wordIndex] as any).word}
                  initial={{ y: 20, opacity: 0, filter: "blur(4px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: -20, opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="text-primary inline-block"
                >
                  {(words[wordIndex] as any).word}
                </motion.span>
              </AnimatePresence>
            </span>{" "}
            {tr(t.login.headlinePost, language)}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isForgot ? tr(t.login.forgotPrompt, language) : tr(t.login.signInToContinue, language)}
          </p>
        </div>

        <div className="space-y-3">
          {isForgot ? (
            <>
              <Input
                placeholder={tr(t.login.emailOnly, language)}
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
              />
              <BorderGlow borderRadius={10} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={25} glowRadius={50} coneSpread={10} fillOpacity={0}>
                <Button onClick={handleForgotPassword} className="w-full gap-2" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#94a3b8]" />}
                  {tr(t.login.sendResetLink, language)}
                </Button>
              </BorderGlow>
              <button onClick={() => setIsForgot(false)} className="text-sm text-primary hover:underline w-full text-center">
                {tr(t.login.backToLogin, language)}
              </button>
            </>
          ) : (
            <>
              <Input
                placeholder={tr(t.login.emailPlaceholder, language)}
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              <Input
                placeholder={tr(t.login.password, language)}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
              />
              <BorderGlow borderRadius={10} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={25} glowRadius={50} coneSpread={10} fillOpacity={0}>
                <Button onClick={handleEmailAuth} className="w-full gap-2" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 text-[#94a3b8]" />}
                  {tr(t.login.signIn, language)}
                </Button>
              </BorderGlow>
              <button onClick={() => setIsForgot(true)} className="text-sm text-muted-foreground hover:text-primary hover:underline w-full text-center">
                {tr(t.login.forgotPassword, language)}
              </button>
            </>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">{tr(t.login.or, language)}</span>
          </div>
        </div>

        <Button onClick={handleGoogle} variant="outline" className="w-full gap-2 bg-gradient-to-b from-card to-muted/40 hover:from-card hover:to-muted/60">
          <LogIn className="w-4 h-4" />
          {tr(t.login.continueGoogle, language)}
        </Button>

        {!isForgot && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            {tr(t.login.noAccount, language)}{" "}
            <a href="/signup" className="text-primary hover:underline font-medium">
              {tr(t.login.signUp, language)}
            </a>
          </p>
        )}
      </div>
      </div>

      <div className="py-6 flex justify-center">
        <a href="/" className="cursor-pointer">
          <img src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo} alt="Connecta" className="h-10 object-contain" />
        </a>
      </div>
    </div>
  );
}
