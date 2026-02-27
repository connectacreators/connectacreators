import { supabase } from '@/integrations/supabase/client';

export interface Script {
  id: string;
  client_id: string;
  title: string;
  content: string;
  template: boolean;
  created_at: string;
}

export interface CreateScriptInput {
  client_id: string;
  title: string;
  content: string;
  template?: boolean;
}

export interface UpdateScriptInput {
  title?: string;
  content?: string;
  template?: boolean;
}

export const scriptService = {
  async createScript(data: CreateScriptInput): Promise<Script> {
    try {
      const { data: result, error } = await supabase
        .from('scripts')
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result as Script;
    } catch (error) {
      console.error('Error creating script:', error);
      throw error;
    }
  },

  async getScriptsByClient(clientId: string): Promise<Script[]> {
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select()
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Script[];
    } catch (error) {
      console.error('Error fetching scripts for client:', error);
      throw error;
    }
  },

  async updateScript(scriptId: string, updates: UpdateScriptInput): Promise<Script> {
    try {
      const { data, error } = await supabase
        .from('scripts')
        .update(updates)
        .eq('id', scriptId)
        .select()
        .single();

      if (error) throw error;
      return data as Script;
    } catch (error) {
      console.error('Error updating script:', error);
      throw error;
    }
  },

  async deleteScript(scriptId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('scripts')
        .delete()
        .eq('id', scriptId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting script:', error);
      throw error;
    }
  },
};
