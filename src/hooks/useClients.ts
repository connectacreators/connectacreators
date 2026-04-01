import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Client = {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  created_at: string;
  notion_lead_name: string | null;
};

export function useClients(enabled: boolean, ownerScoped?: boolean) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    let query = supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    
    // RLS handles the filtering, but we still select all accessible clients
    const { data, error } = await query;
    if (error) {
      toast.error("Error loading clients");
      console.error(error);
    } else {
      setClients(data || []);
    }
    setLoading(false);
  }, [enabled]);

  const addClient = async (name: string, email?: string) => {
    const { data, error } = await supabase
      .from("clients")
      .insert({ name, email: email || null })
      .select()
      .single();
    if (error) {
      toast.error("Error creating client");
      console.error(error);
      return null;
    }
    setClients((prev) => [data, ...prev]);
    toast.success("Client created");
    return data;
  };

  const updateClient = async (id: string, updates: { name?: string; email?: string | null }) => {
    const { error } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", id);
    if (error) {
      toast.error("Error updating client");
      console.error(error);
      return false;
    }
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    toast.success("Client updated");
    return true;
  };

  useEffect(() => {
    if (enabled) {
      fetchClients();
    } else {
      setLoading(false);
    }
  }, [enabled, fetchClients]);

  return { clients, loading, addClient, updateClient, refetch: fetchClients };
}
