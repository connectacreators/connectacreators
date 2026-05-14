import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

/**
 * Legacy URL: /clients/:clientId
 * The canonical client hub now lives at /dashboard with viewMode set to the client UUID.
 * This component preserves existing links/bookmarks by setting viewMode and redirecting.
 */
export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (clientId) {
      localStorage.setItem("dashboard_viewMode", clientId);
      window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: clientId }));
    }
    navigate("/dashboard", { replace: true });
  }, [clientId, navigate]);

  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
