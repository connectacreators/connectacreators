import { supabase } from '@/integrations/supabase/client';

export interface Script {
  id: string;
  client_id: string;
  title: string;
  idea_ganadora: string | null;
  raw_content: string;
  google_drive_link: string | null;
  caption: string | null;
  review_status: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface CreateScriptInput {
  client_id: string;
  title: string;
  raw_content: string;
}

export interface UpdateScriptInput {
  title?: string;
  raw_content?: string;
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
        .select('id, client_id, title, idea_ganadora, raw_content, google_drive_link, caption, review_status, deleted_at, created_at')
        .eq('client_id', clientId)
        .is('deleted_at', null)
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
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('scripts')
        .update({ deleted_at: now })
        .eq('id', scriptId);

      if (error) throw error;
      // Cascade: also trash linked video_edit
      await supabase.from('video_edits').update({ deleted_at: now }).eq('script_id', scriptId);
    } catch (error) {
      console.error('Error deleting script:', error);
      throw error;
    }
  },
};
