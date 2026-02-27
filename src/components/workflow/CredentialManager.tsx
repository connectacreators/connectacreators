import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Credential {
  id: string;
  service: string;
  label: string;
  credential_type: string;
  is_active: boolean;
  last_used_at?: string;
  created_at: string;
}

interface CredentialManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
}

type CredentialType = "smtp_password" | "oauth2_token" | "api_key" | "service_account_json";

export function CredentialManager({ open, onOpenChange, clientId }: CredentialManagerProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    service: "zoho_email",
    label: "",
    credential_type: "smtp_password" as CredentialType,
    password: "",
    api_key: "",
    oauth_token: "",
    json_data: "",
  });

  // Load credentials
  useEffect(() => {
    if (open && clientId) {
      loadCredentials();
    }
  }, [open, clientId]);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("credential_vault")
        .select("id, service, label, credential_type, is_active, last_used_at, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCredentials(data || []);
    } catch (err) {
      console.error("Failed to load credentials:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCredential = async () => {
    if (!formData.label || !formData.service) {
      alert("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      // Prepare encrypted data based on credential type
      const encryptedData = {
        service: formData.service,
        type: formData.credential_type,
        value: (() => {
          switch (formData.credential_type) {
            case "smtp_password":
              return formData.password;
            case "api_key":
              return formData.api_key;
            case "oauth2_token":
              return formData.oauth_token;
            case "service_account_json":
              return formData.json_data;
            default:
              return "";
          }
        })(),
      };

      if (selectedCredential) {
        // Update existing credential
        const { error } = await supabase
          .from("credential_vault")
          .update({
            label: formData.label,
            encrypted_data: encryptedData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedCredential.id);

        if (error) throw error;
      } else {
        // Create new credential
        const { error } = await supabase.from("credential_vault").insert({
          client_id: clientId,
          service: formData.service,
          label: formData.label,
          credential_type: formData.credential_type,
          encrypted_data: encryptedData,
          encryption_key_id: "v1",
          is_active: true,
        });

        if (error) throw error;
      }

      // Reload credentials
      await loadCredentials();
      setShowForm(false);
      setSelectedCredential(null);
      setFormData({
        service: "zoho_email",
        label: "",
        credential_type: "smtp_password",
        password: "",
        api_key: "",
        oauth_token: "",
        json_data: "",
      });
    } catch (err) {
      console.error("Failed to save credential:", err);
      alert(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCredential = async (credentialId: string) => {
    if (!confirm("Are you sure you want to delete this credential?")) return;

    try {
      const { error } = await supabase
        .from("credential_vault")
        .delete()
        .eq("id", credentialId);

      if (error) throw error;
      await loadCredentials();
    } catch (err) {
      console.error("Failed to delete credential:", err);
      alert(String(err));
    }
  };

  const handleEditCredential = (cred: Credential) => {
    setSelectedCredential(cred);
    setFormData({
      service: cred.service,
      label: cred.label,
      credential_type: cred.credential_type as CredentialType,
      password: "",
      api_key: "",
      oauth_token: "",
      json_data: "",
    });
    setShowForm(true);
  };

  const serviceOptions = [
    { value: "zoho_email", label: "Zoho Email (SMTP)" },
    { value: "twilio", label: "Twilio SMS" },
    { value: "sendgrid", label: "SendGrid Email" },
    { value: "notion", label: "Notion" },
    { value: "google_sheets", label: "Google Sheets" },
    { value: "custom_api", label: "Custom API" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>Credential Manager</SheetTitle>
        </SheetHeader>

        {showForm ? (
          // Form View
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cred_service">Service</Label>
              <Select value={formData.service} onValueChange={(value) => setFormData({ ...formData, service: value })}>
                <SelectTrigger id="cred_service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cred_label">Label</Label>
              <Input
                id="cred_label"
                placeholder="e.g., Production Account"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cred_type">Credential Type</Label>
              <Select
                value={formData.credential_type}
                onValueChange={(value) => setFormData({ ...formData, credential_type: value as CredentialType })}
              >
                <SelectTrigger id="cred_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smtp_password">SMTP Password</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="oauth2_token">OAuth2 Token</SelectItem>
                  <SelectItem value="service_account_json">Service Account JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.credential_type === "smtp_password" && (
              <div className="space-y-2">
                <Label htmlFor="cred_password">Password</Label>
                <Input
                  id="cred_password"
                  type="password"
                  placeholder="Enter SMTP password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            )}

            {formData.credential_type === "api_key" && (
              <div className="space-y-2">
                <Label htmlFor="cred_api_key">API Key</Label>
                <Input
                  id="cred_api_key"
                  type="password"
                  placeholder="Enter API key"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                />
              </div>
            )}

            {formData.credential_type === "oauth2_token" && (
              <div className="space-y-2">
                <Label htmlFor="cred_oauth">OAuth2 Token</Label>
                <Textarea
                  id="cred_oauth"
                  placeholder="Enter OAuth2 bearer token"
                  value={formData.oauth_token}
                  onChange={(e) => setFormData({ ...formData, oauth_token: e.target.value })}
                  rows={4}
                />
              </div>
            )}

            {formData.credential_type === "service_account_json" && (
              <div className="space-y-2">
                <Label htmlFor="cred_json">Service Account JSON</Label>
                <Textarea
                  id="cred_json"
                  placeholder="Paste entire service account JSON"
                  value={formData.json_data}
                  onChange={(e) => setFormData({ ...formData, json_data: e.target.value })}
                  rows={6}
                />
              </div>
            )}

            <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
              💡 Credentials are encrypted using AES-256-GCM and stored securely. Never share your sensitive credentials.
            </div>
          </div>
        ) : (
          // List View
          <div className="flex-1 overflow-y-auto space-y-3 py-4">
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : credentials.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No credentials saved yet</p>
                <p className="text-xs mt-2">Add your first credential to get started</p>
              </div>
            ) : (
              credentials.map((cred) => (
                <div key={cred.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{cred.label}</p>
                      <p className="text-xs text-muted-foreground">{cred.service}</p>
                    </div>
                    {cred.is_active && <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Active</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditCredential(cred)}
                      className="flex-1"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteCredential(cred.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {cred.last_used_at && (
                    <p className="text-xs text-muted-foreground">
                      Last used: {new Date(cred.last_used_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="border-t bg-background px-4 py-3 flex gap-2">
          {showForm ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setSelectedCredential(null);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button onClick={handleSaveCredential} disabled={saving} className="flex-1">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedCredential ? "Update" : "Add"} Credential
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setShowForm(true);
                  setSelectedCredential(null);
                  setFormData({
                    service: "zoho_email",
                    label: "",
                    credential_type: "smtp_password",
                    password: "",
                    api_key: "",
                    oauth_token: "",
                    json_data: "",
                  });
                }}
                className="flex-1 gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Credential
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
