import { supabase } from '@/integrations/supabase/client';

export interface RevisionComment {
  id: string;
  video_edit_id: string;
  timestamp_seconds: number | null;
  comment: string;
  author_name: string;
  author_role: 'admin' | 'editor' | 'client';
  author_id: string | null;
  resolved: boolean;
  created_at: string;
  source_ref: string | null;
}

export interface CreateCommentInput {
  video_edit_id: string;
  timestamp_seconds: number | null;
  comment: string;
  author_name: string;
  author_role: 'admin' | 'editor' | 'client';
  author_id?: string | null;
  source_ref?: string | null;
}

export const revisionCommentService = {
  async getCommentsByVideoEdit(videoEditId: string): Promise<RevisionComment[]> {
    const { data, error } = await supabase
      .from('revision_comments')
      .select('*')
      .eq('video_edit_id', videoEditId)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false });

    if (error) throw error;
    return (data || []) as RevisionComment[];
  },

  async createComment(input: CreateCommentInput): Promise<RevisionComment> {
    const { data, error } = await supabase
      .from('revision_comments')
      .insert([input])
      .select()
      .single();

    if (error) throw error;
    return data as RevisionComment;
  },

  async resolveComment(commentId: string, resolved: boolean): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .update({ resolved })
      .eq('id', commentId);

    if (error) throw error;
  },

  async updateComment(commentId: string, comment: string): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .update({ comment })
      .eq('id', commentId);

    if (error) throw error;
  },

  async deleteComment(commentId: string): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;
  },

  async getUnresolvedCount(videoEditId: string): Promise<number> {
    const { count, error } = await supabase
      .from('revision_comments')
      .select('*', { count: 'exact', head: true })
      .eq('video_edit_id', videoEditId)
      .eq('resolved', false);

    if (error) throw error;
    return count || 0;
  },
};
