import { AlertCircle } from "lucide-react";
import { useSocialConnections } from "@/lib/hooks/useSocialConnections";

export function ReauthBanner({ clientId }: { clientId: string }) {
  const { data: conns = [] } = useSocialConnections(clientId);
  const stale = conns.filter((c) => c.status === "needs_reauth");
  if (stale.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 mt-0.5" />
      <div className="text-sm">
        <strong>Reconnect required: </strong>
        {stale.map((c) => c.account_label).join(", ")}
        {" — "}
        <a href={`/clients/${clientId}/social-accounts`} className="underline">Reauth</a>
      </div>
    </div>
  );
}
