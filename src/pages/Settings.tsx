import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
          <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 btn-primary-glass">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#0891B2]" />}
            {tr(t.settings.saveChanges, language)}
          </Button>
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
          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || !confirmPassword}
            className="gap-2 btn-primary-glass"
          >
            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {tr(t.settings.changePassword, language)}
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
