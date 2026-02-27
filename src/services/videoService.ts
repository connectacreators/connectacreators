import { supabase } from '@/integrations/supabase/client';

export interface VideoEdit {
  id: string;
  client_id: string;
  script_id: string | null;
  file_url: string;
  status: string;
  created_at: string;
}

export interface CreateVideoInput {
  client_id: string;
  script_id?: string | null;
  file_url: string;
  status?: string;
}

export interface UpdateVideoInput {
  script_id?: string | null;
  file_url?: string;
  status?: string;
}

export const videoService = {
  async createVideoEdit(data: CreateVideoInput): Promise<VideoEdit> {
    try {
      const { data: result, error } = await supabase
        .from('video_edits')
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result as VideoEdit;
    } catch (error) {
      console.error('Error creating video edit:', error);
      throw error;
    }
  },

  async getVideosByClient(clientId: string): Promise<VideoEdit[]> {
    try {
      const { data, error } = await supabase
        .from('video_edits')
        .select()
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as VideoEdit[];
    } catch (error) {
      console.error('Error fetching videos for client:', error);
      throw error;
    }
  },

  async updateVideoStatus(videoId: string, status: string): Promise<VideoEdit> {
    try {
      const { data, error } = await supabase
        .from('video_edits')
        .update({ status })
        .eq('id', videoId)
        .select()
        .single();

      if (error) throw error;
      return data as VideoEdit;
    } catch (error) {
      console.error('Error updating video status:', error);
      throw error;
    }
  },

  async updateVideo(videoId: string, updates: UpdateVideoInput): Promise<VideoEdit> {
    try {
      const { data, error } = await supabase
        .from('video_edits')
        .update(updates)
        .eq('id', videoId)
        .select()
        .single();

      if (error) throw error;
      return data as VideoEdit;
    } catch (error) {
      console.error('Error updating video:', error);
      throw error;
    }
  },

  async deleteVideo(videoId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('video_edits')
        .delete()
        .eq('id', videoId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting video:', error);
      throw error;
    }
  },
};
