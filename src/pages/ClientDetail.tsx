import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

/**
 * Legacy URL: /clients/:clientId
 * The canonical client hub now lives at /dashboard?client=<id>.
 * This component preserves existing links/bookmarks by:
 *   1. Setting `dashboard_viewMode` localStorage so the sidebar (and pages
 *      like CommandCenter, ViralToday) pick up the active client.
 *   2. Redirecting to /dashboard with ?client=<id> so the Dashboard drilldown
 *      (breadcrumb + Robby's read + tool folders) renders instead of the
 *      empty agency-triage fallback.
 */
export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (clientId) {
      localStorage.setItem("dashboard_viewMode", clientId);
      window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: clientId }));
      navigate(`/dashboard?client=${clientId}`, { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  }, [clientId, navigate]);

  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
