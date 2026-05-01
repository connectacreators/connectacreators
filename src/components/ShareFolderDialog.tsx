import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Check, Loader2, ShieldAlert, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ShareRow = {
  id: string;
  token: string;
  permission: "viewer" | "editor";
  created_at: string;
  revoked_at: string | null;
};

type Props = {
  folder: { id: string; name: string } | null;
  onClose: () => void;
};

const TOKEN_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789"; // no 0/O/1/I/l ambiguity

function generateToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export function ShareFolderDialog({ folder, onClose }: Props) {
  const open = !!folder;
  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState<ShareRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const shareUrl = useMemo(() => {
    if (!existing) return "";
    return `${window.location.origin}/f/${existing.token}`;
  }, [existing]);

  // Load existing active share when dialog opens.
  useEffect(() => {
    if (!folder) { setExisting(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("script_folder_shares")
        .select("id, token, permission, created_at, revoked_at")
        .eq("folder_id", folder.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("load share failed", error);
        setExisting(null);
      } else {
        setExisting((data as ShareRow | null) ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [folder]);

  async function handleCreate() {
    if (!folder) return;
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast.error("You must be signed in");
      setCreating(false);
      return;
    }
    const token = generateToken(32);
    const { data, error } = await supabase
      .from("script_folder_shares")
      .insert({
        folder_id: folder.id,
        token,
        permission: "viewer",
        created_by: userData.user.id,
      })
      .select("id, token, permission, created_at, revoked_at")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Failed to create share link");
      return;
    }
    setExisting(data as ShareRow);
  }

  async function handleRevoke() {
    if (!existing) return;
    setRevoking(true);
    const { error } = await supabase
      .from("script_folder_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existing.id);
    setRevoking(false);
    if (error) {
      toast.error("Failed to revoke link");
      return;
    }
    setExisting(null);
    toast.success("Share link revoked");
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Share folder
          </DialogTitle>
          <DialogDescription>
            {folder ? <>Anyone with the link can view <span className="font-semibold text-foreground">{folder.name}</span> and its subfolders.</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : existing ? (
            <>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border/60">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Viewer</span> — read-only access. Editor mode coming soon.
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <ShieldAlert className="w-10 h-10 text-muted-foreground/60" />
              <div className="text-sm text-muted-foreground">
                No public link yet. Creating one gives anyone with the URL read-only access to this folder.
              </div>
              <Button onClick={handleCreate} disabled={creating} variant="cta">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
                Create share link
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row justify-between gap-2 sm:justify-between">
          {existing ? (
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking}
              size="sm"
            >
              {revoking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Revoke access
            </Button>
          ) : <div />}
          <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
