import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogIn, Mail, Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import connectaLogo from "@/assets/connecta-logo.png";

type Props = {
  onSignIn: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<{ error: any }>;
};

export default function ScriptsLogin({ onSignIn, signInWithEmail, signUpWithEmail }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) { toast.error("Ingresa tu correo electrónico"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/scripts`,
    
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Revisa tu correo para restablecer tu contraseña");
  }, [email]);

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) return;
    if (isSignUp && !fullName.trim()) { toast.error("El nombre es obligatorio"); return; }
    setLoading(true);
    const { error } = isSignUp
      ? await signUpWithEmail(email, password, fullName.trim())
      : await signInWithEmail(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else if (isSignUp) {
      toast.success("Revisa tu correo para confirmar tu cuenta");
    } else {
      onSignIn();
    }
  };

  const handleGoogle = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background flex items-center justify-center px-4" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={connectaLogo} alt="Connecta" className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Script Breakdown</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isForgot ? "Ingresa tu correo para restablecer tu contraseña" : isSignUp ? "Crea tu cuenta" : "Inicia sesión para continuar"}
          </p>
        </div>

        <div className="space-y-3">
          {isForgot ? (
            <>
              <Input
                placeholder="Correo electrónico"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
              />
              <Button onClick={handleForgotPassword} className="w-full gap-2 bg-gradient-to-b from-primary to-primary-dark hover:from-primary/90 hover:to-primary-dark/90" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Enviar enlace de recuperación
              </Button>
              <button onClick={() => setIsForgot(false)} className="text-sm text-primary hover:underline w-full text-center">
                Volver al inicio de sesión
              </button>
            </>
          ) : (
            <>
              {isSignUp && (
                <Input
                  placeholder="Nombre completo *"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              )}
              <Input
                placeholder="Correo electrónico"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                placeholder="Contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
              />
              <Button onClick={handleEmailAuth} className="w-full gap-2 bg-gradient-to-b from-primary to-primary-dark hover:from-primary/90 hover:to-primary-dark/90" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {isSignUp ? "Registrarse" : "Iniciar Sesión"}
              </Button>
              {!isSignUp && (
                <button onClick={() => setIsForgot(true)} className="text-sm text-muted-foreground hover:text-primary hover:underline w-full text-center">
                  ¿Olvidaste tu contraseña?
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
            <span className="bg-background px-2 text-muted-foreground">o</span>
          </div>
        </div>

        <Button onClick={handleGoogle} variant="outline" className="w-full gap-2 bg-gradient-to-b from-card to-muted/40 hover:from-card hover:to-muted/60">
          <LogIn className="w-4 h-4" />
          Continuar con Google
        </Button>

        {!isForgot && (
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary hover:underline font-semibold"
            >
              {isSignUp ? "Inicia sesión" : "Regístrate"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
