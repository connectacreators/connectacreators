import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Eye, EyeOff, Trash2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BorderGlow from "@/components/ui/BorderGlow";

export default function Settings() {
  const { language } = useLanguage();
  const { user, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [viralThreshold, setViralThreshold] = useState<number>(
    parseFloat(localStorage.getItem('viral_outlier_threshold') ?? '5')
  );

  const handleViralThresholdChange = (val: number) => {
    setViralThreshold(val);
    localStorage.setItem('viral_outlier_threshold', String(val));
  };

  useEffect(() => {
    if (user) {
      setEmail(user.email || "");
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.display_name) setDisplayName(data.display_name);
        });
    }
  }, [user]);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  const roleLabel = role === "admin" ? tr(t.settings.admin, language) : role === "videographer" ? tr(t.settings.videographer, language) : tr(t.settings.client, language);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("user_id", user.id);
      if (profileErr) throw profileErr;

      if (email.trim() !== user.email) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: email.trim() });
        if (emailErr) throw emailErr;
        toast.success(tr(t.settings.emailConfirmation, language));
      } else {
        toast.success(tr(t.settings.profileUpdated, language));
      }
    } catch (e: any) {
      toast.error(e.message || tr(t.settings.saveError, language));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error(tr(t.settings.passwordMinLength, language));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(tr(t.settings.passwordMismatch, language));
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(tr(t.settings.passwordUpdated, language));
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast.error(e.message || tr(t.settings.passwordError, language));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/stripe-billing-portal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "delete-account" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");

      toast.success("Account deleted successfully");
      await signOut();
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete account");
      setDeleting(false);
    }
  };

  return (
    <PageTransition className="flex-1 overflow-y-auto">
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <h1 className="text-2xl font-bold text-foreground mb-8">{tr(t.settings.title, language)}</h1>

        {/* Profile info */}
        <div className="glass-card rounded-xl p-6 space-y-5 mb-8">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">{tr(t.settings.name, language)}</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={tr(t.settings.namePlaceholder, language)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">{tr(t.settings.email, language)}</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">{tr(t.settings.accountType, language)}</label>
            <div className="px-3 py-2 bg-muted/30 border border-border rounded-md text-foreground text-sm">
              {roleLabel}
            </div>
          </div>
          <BorderGlow borderRadius={10} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={40} glowRadius={18} coneSpread={10} fillOpacity={0}>
            <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#0891B2]" />}
              {tr(t.settings.saveChanges, language)}
            </Button>
          </BorderGlow>
        </div>

        {/* Change password */}
        <div className="glass-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{tr(t.settings.changePassword, language)}</h2>
          <div className="relative">
            <Input
              type={showPasswords ? "text" : "password"}
              placeholder={tr(t.settings.newPassword, language)}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="relative">
            <Input
              type={showPasswords ? "text" : "password"}
              placeholder={tr(t.settings.confirmPassword, language)}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPasswords(!showPasswords)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showPasswords ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showPasswords ? tr(t.settings.hidePasswords, language) : tr(t.settings.showPasswords, language)} {tr(t.settings.passwords, language)}
          </button>
          <BorderGlow borderRadius={10} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={40} glowRadius={18} coneSpread={10} fillOpacity={0}>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword || !confirmPassword}
              className="gap-2"
            >
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {tr(t.settings.changePassword, language)}
            </Button>
          </BorderGlow>
        </div>

        {/* Viral Feed settings */}
        <div className="glass-card rounded-xl p-6 space-y-4 mt-8">
          <h2 className="text-lg font-semibold text-foreground">Viral Feed</h2>
          <p className="text-sm text-muted-foreground">
            Set the minimum outlier score for videos shown in the Viral Reels feed. Higher = only the most viral content.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Minimum outlier score</span>
              <span className="text-sm font-bold text-primary">&ge; {viralThreshold}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={viralThreshold}
              onChange={(e) => handleViralThresholdChange(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex gap-2 flex-wrap">
              {[
                { label: 'Any', value: 1 },
                { label: '3x', value: 3 },
                { label: '5x', value: 5 },
                { label: '10x', value: 10 },
                { label: '20x', value: 20 },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => handleViralThresholdChange(value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    viralThreshold === value
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Takes effect next time you open the Viral Reels page.</p>
          </div>
        </div>

        {/* Delete Account — only for non-admin users */}
        {role !== "admin" && (
          <div className="glass-card rounded-xl p-6 space-y-4 mt-8 border border-red-500/20">
            <h2 className="text-lg font-semibold text-red-400">Delete Account</h2>
            <p className="text-sm text-muted-foreground">
              This will permanently delete your account, cancel your subscription, and remove all your data. This action cannot be undone.
            </p>

            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(true)}
                className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
                Delete my account
              </Button>
            ) : (
              <div className="space-y-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-300">
                    <p className="font-semibold mb-1">Are you sure?</p>
                    <p className="text-red-400/80">Your subscription will be canceled immediately and all account data will be permanently deleted.</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Type <span className="font-bold text-red-400">DELETE</span> to confirm
                  </label>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="border-red-500/30 max-w-[200px]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleDeleteAccount}
                    disabled={deleting || deleteConfirmText !== "DELETE"}
                    className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {deleting ? "Deleting..." : "Permanently delete account"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
