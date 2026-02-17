import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { Input } from "@/components/ui/input";
import { LogIn, Mail, Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import connectaLoginLogo from "@/assets/connecta-login-logo.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-dark.png";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  onSignIn: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<{ error: any }>;
};

export default function ScriptsLogin({ onSignIn, signInWithEmail, signUpWithEmail }: Props) {
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
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
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
    if (isSignUp && !fullName.trim()) { toast.error(tr(t.login.nameRequired, language)); return; }
    setLoading(true);
    if (isSignUp) {
      const { error } = await signUpWithEmail(identifier, password, fullName.trim());
      setLoading(false);
      if (error) toast.error(error.message);
      else toast.success(tr(t.login.checkEmailConfirm, language));
    } else {
      const email = await resolveEmail(identifier);
      if (!email) { setLoading(false); return; }
      const { error } = await signInWithEmail(email, password);
      setLoading(false);
      if (error) toast.error(error.message);
      else onSignIn();
    }
  };

  const handleGoogle = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/dashboard`,
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background flex flex-col px-4" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center pt-16">
      <div className="w-full max-w-xs sm:max-w-sm space-y-4 sm:space-y-6">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
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
            {isForgot ? tr(t.login.forgotPrompt, language) : isSignUp ? tr(t.login.createAccount, language) : tr(t.login.signInToContinue, language)}
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
              <Button onClick={handleForgotPassword} className="w-full gap-2 bg-gradient-to-b from-primary to-primary-dark hover:from-primary/90 hover:to-primary-dark/90" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {tr(t.login.sendResetLink, language)}
              </Button>
              <button onClick={() => setIsForgot(false)} className="text-sm text-primary hover:underline w-full text-center">
                {tr(t.login.backToLogin, language)}
              </button>
            </>
          ) : (
            <>
              {isSignUp && (
                <Input
                  placeholder={tr(t.login.fullName, language)}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              )}
              <Input
                placeholder={isSignUp ? tr(t.login.emailOnly, language) : tr(t.login.emailPlaceholder, language)}
                type={isSignUp ? "email" : "text"}
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
              <Button onClick={handleEmailAuth} className="w-full gap-2 bg-gradient-to-b from-primary to-primary-dark hover:from-primary/90 hover:to-primary-dark/90" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {isSignUp ? tr(t.login.signUp, language) : tr(t.login.signIn, language)}
              </Button>
              {!isSignUp && (
                <button onClick={() => setIsForgot(true)} className="text-sm text-muted-foreground hover:text-primary hover:underline w-full text-center">
                  {tr(t.login.forgotPassword, language)}
                </button>
              )}
            </>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{tr(t.login.or, language)}</span>
          </div>
        </div>

        <Button onClick={handleGoogle} variant="outline" className="w-full gap-2 bg-gradient-to-b from-card to-muted/40 hover:from-card hover:to-muted/60">
          <LogIn className="w-4 h-4" />
          {tr(t.login.continueGoogle, language)}
        </Button>

        {!isForgot && (
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? tr(t.login.hasAccount, language) : tr(t.login.noAccount, language)}{" "}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary hover:underline font-semibold"
            >
              {isSignUp ? tr(t.login.signIn, language) : tr(t.login.signUp, language)}
            </button>
          </p>
        )}
      </div>
      </div>

      <div className="py-6 flex justify-center">
        <img src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo} alt="Connecta" className="h-10 object-contain" />
      </div>
    </div>
  );
}
