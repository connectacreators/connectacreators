import { useMemo } from "react";
import {
  useDisconnectSocialConnection,
  useSocialConnections,
  useStartFacebookOAuth,
  type SocialConnectionRow,
} from "@/lib/hooks/useSocialConnections";
import { SocialAccountCard } from "./SocialAccountCard";
import { toast } from "sonner";

interface Props { clientId: string; returnPath: string }

const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;
type Plat = typeof PLATFORMS[number];

export function SocialAccountsTab({ clientId, returnPath }: Props) {
  const { data: conns = [], isLoading } = useSocialConnections(clientId);
  const disconnect = useDisconnectSocialConnection();
  const startFb = useStartFacebookOAuth();

  const byPlatform = useMemo(() => {
    const map: Partial<Record<Plat, SocialConnectionRow>> = {};
    for (const c of conns) map[c.platform] = c;
    return map;
  }, [conns]);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading connections…</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
      {PLATFORMS.map((platform) => {
        const conn = byPlatform[platform] ?? null;
        const isFbOrIg = platform === "facebook" || platform === "instagram";
        const disabled = !isFbOrIg;

        return (
          <SocialAccountCard
            key={platform}
            platform={platform}
            connection={conn}
            disabled={disabled}
            disabledReason={
              platform === "tiktok"  ? "TikTok — pending TikTok app review"
            : platform === "youtube" ? "YouTube — pending Google project setup"
            : undefined
            }
            onConnect={() => {
              if (isFbOrIg) startFb.mutate({ clientId, returnPath });
            }}
            onReauth={() => {
              if (isFbOrIg) startFb.mutate({ clientId, returnPath });
            }}
            onDisconnect={async () => {
              if (!conn) return;
              if (!confirm(`Disconnect ${conn.account_label}? Scheduled posts using this account will fail.`)) return;
              try {
                await disconnect.mutateAsync(conn.id);
                // Platform-side token revocation (Meta DELETE /me/permissions,
                // Google /oauth2/revoke) is deferred — local DB delete is enough
                // for the user-visible "disconnect" semantic. Add platform revoke
                // as a Phase A.1 follow-up if compliance requires it.
                toast.success(`Disconnected ${conn.account_label}`);
              } catch (e) {
                toast.error("Disconnect failed: " + String(e));
              }
            }}
          />
        );
      })}
    </div>
  );
}
