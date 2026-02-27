import { supabase } from '@/integrations/supabase/client';

export interface Client {
  id: string;
  name: string;
  created_at: string;
}

export const clientService = {
  async createClient(name: string): Promise<Client> {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{ name }])
        .select()
        .single();

      if (error) throw error;
      return data as Client;
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  },

  async getClientById(clientId: string): Promise<Client | null> {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select()
        .eq('id', clientId)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data as Client;
    } catch (error) {
      console.error('Error fetching client:', error);
      throw error;
    }
  },

  async getAllClients(): Promise<Client[]> {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select()
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Client[];
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
  },
};
