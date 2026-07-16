import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";

// The self-serve software subscription ($39/$79/$139 tiers) is retired.
// Platform access is part of the Connecta+ service and provisioned by the
// team. This page survives because in-app nudges and old links point here.
export default function SelectPlan() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0A0A0A" }}>
      <div className="w-full max-w-md text-center">
        <img src={connectaFavicon} alt="Connecta" className="w-12 h-12 mx-auto mb-6 rounded-xl" />
        <h1 className="text-2xl font-semibold text-white mb-3">Platform access comes with Connecta+</h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
          We no longer sell standalone software subscriptions. Full platform access is
          included with the Connecta+ service and set up by our team. Questions about
          your account or interested in working with us? Get in touch.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/dashboard"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors"
          >
            Back to dashboard
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
