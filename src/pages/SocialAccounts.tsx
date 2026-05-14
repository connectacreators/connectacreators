import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { SocialAccountsTab } from "@/components/scheduler/SocialAccountsTab";
import { useSchedulerEnabled } from "@/lib/featureFlags";

export default function SocialAccounts() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { enabled, loading } = useSchedulerEnabled();

  if (!clientId) {
    return <div className="p-8 text-sm text-muted-foreground">Missing client id.</div>;
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!enabled) {
    return (
      <div className="p-8 max-w-md mx-auto space-y-4">
        <p className="text-sm text-muted-foreground">
          The post scheduler is currently in private beta. Ask your administrator to enable it for your account.
        </p>
        <Button variant="outline" onClick={() => navigate(`/clients/${clientId}`)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-8 py-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate(`/clients/${clientId}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to client
        </button>

        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight font-serif">
          Social Accounts
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Connect this client's social media accounts to schedule posts directly from the app.
        </p>

        <SocialAccountsTab
          clientId={clientId}
          returnPath={`/clients/${clientId}/social-accounts`}
        />
      </div>
    </div>
  );
}
