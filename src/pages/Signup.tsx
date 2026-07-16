import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";

// Self-serve signup is retired: accounts are provisioned by the Connecta team
// for Connecta+ clients only (create-subscriber-user / create-videographer
// edge fns). Public signups are also disabled at the Supabase Auth level, so
// this page is purely informational — the route survives old links.
export default function Signup() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) navigate("/dashboard", { replace: true });
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0A0A0A" }}>
      <div className="w-full max-w-md text-center">
        <img src={connectaFavicon} alt="Connecta" className="w-12 h-12 mx-auto mb-6 rounded-xl" />
        <h1 className="text-2xl font-semibold text-white mb-3">Accounts are invite-only</h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
          Connecta accounts are created by our team for Connecta+ clients. If you're
          working with us, your account details arrive by email during onboarding.
          Interested in becoming a client? Reach out and we'll take it from there.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/login"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors"
          >
            Log in
          </a>
          <a
            href="/#book"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white border border-white/20 hover:bg-white/10 transition-colors"
          >
            Talk to our team
          </a>
        </div>
      </div>
    </div>
  );
}
