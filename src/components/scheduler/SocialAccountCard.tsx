import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Link2Off } from "lucide-react";
import type { SocialConnectionRow } from "@/lib/hooks/useSocialConnections";

interface Props {
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  connection: SocialConnectionRow | null;
  onConnect: () => void;
  onReauth: () => void;
  onDisconnect: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

const LABELS: Record<Props["platform"], string> = {
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  youtube:   "YouTube",
};

export function SocialAccountCard({
  platform,
  connection,
  onConnect,
  onReauth,
  onDisconnect,
  disabled,
  disabledReason,
}: Props) {
  const isConnected = connection && connection.status === "active";
  const needsReauth = connection && connection.status === "needs_reauth";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{LABELS[platform]}</span>
        {isConnected && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        {needsReauth && <AlertCircle className="h-4 w-4 text-amber-600" />}
        {!connection && !disabled && <Link2Off className="h-4 w-4 text-muted-foreground" />}
      </div>

      {disabled && (
        <p className="text-xs text-muted-foreground">{disabledReason ?? "Coming soon"}</p>
      )}

      {!disabled && !connection && (
        <Button size="sm" onClick={onConnect} className="w-full">
          Connect {LABELS[platform]}
        </Button>
      )}

      {!disabled && isConnected && (
        <div className="space-y-2">
          <p className="text-sm">{connection.account_label}</p>
          <p className="text-xs text-muted-foreground">
            Connected {new Date(connection.connected_at).toLocaleDateString()}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReauth} className="flex-1">
              Reauth
            </Button>
            <Button size="sm" variant="ghost" onClick={onDisconnect} className="flex-1">
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {!disabled && needsReauth && (
        <div className="space-y-2">
          <p className="text-sm text-amber-700">Token expired — reconnect to keep scheduling.</p>
          {connection.last_error && (
            <p className="text-xs text-muted-foreground">{connection.last_error}</p>
          )}
          <Button size="sm" onClick={onReauth} className="w-full">Reconnect</Button>
        </div>
      )}
    </Card>
  );
}
