import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CredentialSelectorProps {
  clientId: string;
  service: string;
  value: string;
  onChange: (credentialId: string) => void;
  onAddNew?: () => void;
  required?: boolean;
}

interface Credential {
  id: string;
  label: string;
  service: string;
  credential_type: string;
  is_active: boolean;
}

export function CredentialSelector({
  clientId,
  service,
  value,
  onChange,
  onAddNew,
  required = false,
}: CredentialSelectorProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clientId && service) {
      loadCredentials();
    }
  }, [clientId, service]);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("credential_vault")
        .select("id, label, service, credential_type, is_active")
        .eq("client_id", clientId)
        .eq("service", service)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCredentials(data || []);
    } catch (err) {
      console.error("Failed to load credentials:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Stored Credential</Label>
      <div className="flex gap-2">
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger disabled={loading || credentials.length === 0}>
            <SelectValue placeholder={loading ? "Loading..." : "Select credential"} />
          </SelectTrigger>
          <SelectContent>
            {credentials.map((cred) => (
              <SelectItem key={cred.id} value={cred.id}>
                {cred.label}
              </SelectItem>
            ))}
            {credentials.length === 0 && !loading && (
              <div className="p-2 text-sm text-muted-foreground">No credentials available</div>
            )}
          </SelectContent>
        </Select>
        {onAddNew && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddNew}
            title="Add new credential"
          >
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>
      {credentials.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">
          {required ? "❌ No credentials available for this service" : "ℹ️ Add credentials via Credential Manager"}
        </p>
      )}
    </div>
  );
}
