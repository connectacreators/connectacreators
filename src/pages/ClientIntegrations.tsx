import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Eye, EyeOff, Save, Loader2, CheckCircle2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface MetaAdsCreds {
  ad_account_id: string;
  access_token: string;
  label: string;
  updated_at: string;
}

export default function ClientIntegrations() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [creds, setCreds] = useState<MetaAdsCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [label, setLabel] = useState("");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    supabase
      .from("meta_ads_accounts")
      .select("ad_account_id, access_token, label, updated_at")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCreds(data as MetaAdsCreds);
          setAdAccountId(data.ad_account_id);
          setAccessToken(data.access_token);
          setLabel(data.label ?? "");
        }
        setLoading(false);
      });
  }, [clientId]);

  const handleSave = async () => {
    if (!clientId || !adAccountId.trim() || !accessToken.trim()) {
      toast.error("Account ID and access token are required.");
      return;
    }
    setSaving(true);
    const normalizedId = adAccountId.trim().startsWith("act_")
      ? adAccountId.trim()
      : `act_${adAccountId.trim()}`;

    const { error } = await supabase.from("meta_ads_accounts").upsert(
      {
        client_id: clientId,
        ad_account_id: normalizedId,
        access_token: accessToken.trim(),
        label: label.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,ad_account_id" },
    );

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Meta Ads connected.");
    setCreds({
      ad_account_id: normalizedId,
      access_token: accessToken.trim(),
      label: label.trim(),
      updated_at: new Date().toISOString(),
    });
  };

  const handleDisconnect = async () => {
    if (!clientId || !creds) return;
    const { error } = await supabase
      .from("meta_ads_accounts")
      .delete()
      .eq("client_id", clientId)
      .eq("ad_account_id", creds.ad_account_id);
    if (error) { toast.error(error.message); return; }
    setCreds(null);
    setAdAccountId("");
    setAccessToken("");
    setLabel("");
    toast.success("Meta Ads disconnected.");
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Only admins can manage integrations.
      </div>
    );
  }

  if (!clientId) {
    return <div className="p-8 text-sm text-muted-foreground">Missing client id.</div>;
  }

  return (
    <div className="flex-1 px-4 sm:px-8 py-8 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate(`/clients/${clientId}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to client
        </button>

        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 tracking-tight font-serif">
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Connect third-party accounts so the AI can pull live data for this client.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="border border-border rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#1877F2]" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span className="font-medium text-foreground">Meta Ads</span>
                  {creds && (
                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ask the AI "how are [client]'s ads doing?" and it pulls live campaign data.
                </p>
              </div>
              {creds && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={handleDisconnect}
                >
                  <Unplug className="w-4 h-4 mr-1" /> Disconnect
                </Button>
              )}
            </div>

            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="label" className="text-sm">Account label (optional)</Label>
                <Input
                  id="label"
                  placeholder="e.g. Dr Calvin – Utah Ads"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ad_account_id" className="text-sm">Ad account ID</Label>
                <Input
                  id="ad_account_id"
                  placeholder="act_1571936029698345"
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Found in Meta Ads Manager → Account overview. With or without the act_ prefix.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="access_token" className="text-sm">Access token</Label>
                <div className="relative">
                  <Input
                    id="access_token"
                    type={showToken ? "text" : "password"}
                    placeholder="EAAX5NmOv…"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  System user token from Meta Business Settings → System Users. Tokens expire — update here when it does.
                </p>
              </div>

              {creds?.updated_at && (
                <p className="text-xs text-muted-foreground">
                  Last updated {new Date(creds.updated_at).toLocaleDateString()}
                </p>
              )}

              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {creds ? "Update connection" : "Connect"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
