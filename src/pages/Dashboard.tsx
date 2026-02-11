import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Button } from "@/components/ui/button";
import { FileText, LogOut, Loader2, Settings, Target, CalendarDays } from "lucide-react";
import chessKnightIcon from "@/assets/chess-knight-icon.png";
import connectaLoginLogo from "@/assets/connecta-login-logo.png";

export default function Dashboard() {
  const { user, loading, signOut, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();

  // If not logged in, show login
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
        signUpWithEmail={signUpWithEmail}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <img src={chessKnightIcon} alt="Connecta" className="h-8 sm:h-10" />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
              {user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="gap-1 flex-shrink-0">
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="text-center mb-10">
          <img src={connectaLoginLogo} alt="Connecta" className="h-10 object-contain mx-auto mb-3" />
          <p className="text-muted-foreground">¡Bienvenido! Selecciona una herramienta para comenzar.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Scripts tool card */}
          <button
            onClick={() => navigate("/scripts")}
            className="flex flex-col items-center gap-4 p-8 bg-card border border-border rounded-xl hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 text-center group"
          >
            <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Script Breakdown</h2>
              <p className="text-sm text-muted-foreground">Categoriza y gestiona tus guiones de video.</p>
            </div>
          </button>

          {/* Lead Tracker card */}
          <button
            onClick={() => navigate("/leads")}
            className="flex flex-col items-center gap-4 p-8 bg-card border border-border rounded-xl hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 text-center group"
          >
            <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Target className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Lead Tracker</h2>
              <p className="text-sm text-muted-foreground">Visualiza y gestiona tus leads del CRM.</p>
            </div>
          </button>

          {/* Lead Calendar card */}
          <button
            onClick={() => navigate("/lead-calendar")}
            className="flex flex-col items-center gap-4 p-8 bg-card border border-border rounded-xl hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 text-center group"
          >
            <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <CalendarDays className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Lead Calendar</h2>
              <p className="text-sm text-muted-foreground">Visualiza citas programadas de tus leads.</p>
            </div>
          </button>
        </div>
      </main>
    </div>
  );
}
