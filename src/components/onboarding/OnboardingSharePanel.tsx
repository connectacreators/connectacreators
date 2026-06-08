import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Check, Loader2, UserPlus, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OnboardingSharePanelProps {
  clientId: string;
  defaultEmail?: string;
  defaultName?: string;
  accessOpen: boolean;
  onAccessChange: (open: boolean) => void;
}

/**
 * Admin-only controls (shown on /onboarding/:clientId) for sharing the form
 * with a client: open/close the gate, grant a login, and copy the link. The
 * client must log in with the granted email before reaching the form.
 */
export default function OnboardingSharePanel({
  clientId,
  defaultEmail,
  defaultName,
  accessOpen,
  onAccessChange,
}: OnboardingSharePanelProps) {
  const link = `${window.location.origin}/onboarding/${clientId}`;
  const [copied, setCopied] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState(false);

  const [email, setEmail] = useState(defaultEmail || "");
  const [name, setName] = useState(defaultName || "");
  const [granting, setGranting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleAccess = async (open: boolean) => {
    setTogglingAccess(true);
    const { error } = await supabase
      .from("clients")
      .update({ onboarding_access_open: open })
      .eq("id", clientId);
    setTogglingAccess(false);
    if (error) {
      toast.error("Couldn't update access");
      return;
    }
    onAccessChange(open);
    toast.success(open ? "Form is now open" : "Form is now closed");
  };

  const grantAccess = async () => {
    if (!email.trim()) {
      toast.error("Enter the client's email");
      return;
    }
    setGranting(true);
    setTempPassword(null);
    try {
      const { data, error } = await supabase.functions.invoke("grant-onboarding-access", {
        body: { clientId, email: email.trim(), fullName: name.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Failed");
      onAccessChange(true);
      if (data.created && data.tempPassword) {
        setTempPassword(data.tempPassword);
        toast.success("Account created & access granted");
      } else {
        toast.success("Access granted to existing account");
      }
    } catch (e) {
      console.error("grant access error:", e);
      toast.error((e as Error).message || "Couldn't grant access");
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-4 md:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Share with client</h3>
      </div>

      {/* Open / close gate */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">
            {accessOpen ? "Open for editing" : "Closed"}
          </p>
          <p className="text-xs text-muted-foreground">
            {accessOpen
              ? "The granted client can open and edit this form."
              : "The client can't edit — the form is locked."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {togglingAccess && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch checked={accessOpen} onCheckedChange={toggleAccess} disabled={togglingAccess} />
        </div>
      </div>

      {/* Link */}
      <div className="mb-4 space-y-1.5">
        <Label className="text-xs">Form link</Label>
        <div className="flex items-center gap-2">
          <Input readOnly value={link} className="flex-1 text-xs" onFocus={(e) => e.target.select()} />
          <Button type="button" variant="outline" size="icon" onClick={copyLink} aria-label="Copy link">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Opening this link asks the client to log in first, then sends them straight to the form.
        </p>
      </div>

      {/* Grant a login */}
      <div className="space-y-2 border-t border-border/50 pt-4">
        <Label className="flex items-center gap-1.5 text-xs">
          <UserPlus className="h-3.5 w-3.5" />
          Grant access to a client login
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            type="email"
            placeholder="client@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="button" onClick={grantAccess} disabled={granting} className="w-full sm:w-auto">
          {granting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Granting…
            </>
          ) : (
            "Create login & grant access"
          )}
        </Button>

        {tempPassword && (
          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <KeyRound className="h-3.5 w-3.5" />
              Temporary password — send this to your client
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-background px-2 py-1 text-sm font-mono text-foreground">
                {tempPassword}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy password"
                onClick={() => {
                  navigator.clipboard.writeText(tempPassword);
                  toast.success("Password copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              They log in at the link above with <strong>{email}</strong> and this password.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
