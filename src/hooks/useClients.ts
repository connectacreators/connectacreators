import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Client = {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  created_at: string;
};

export function useClients(enabled: boolean) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
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
    toast.success("Cliente creado");
    return data;
  };

  useEffect(() => {
    if (enabled) {
      fetchClients();
    } else {
      setLoading(false);
    }
  }, [enabled, fetchClients]);

  return { clients, loading, addClient, refetch: fetchClients };
}
