import { supabase } from '@/integrations/supabase/client';
import { noteAttachmentService, type NoteAttachment } from '@/services/noteAttachmentService';

export type { NoteAttachment };

export interface RevisionComment {
  id: string;
  video_edit_id: string;
  timestamp_seconds: number | null;
  end_timestamp_seconds: number | null;
  comment: string;
  author_name: string;
  author_role: 'admin' | 'editor' | 'client';
  author_id: string | null;
  resolved: boolean;
  created_at: string;
  source_ref: string | null;
  internal_only: boolean;
  attachments: NoteAttachment[];
}

export interface CreateCommentInput {
  video_edit_id: string;
  timestamp_seconds: number | null;
  end_timestamp_seconds?: number | null;
  comment: string;
  author_name: string;
  author_role: 'admin' | 'editor' | 'client';
  author_id?: string | null;
  source_ref?: string | null;
  internal_only?: boolean;
  attachments?: NoteAttachment[];
}

// Rows may predate the attachments column (or arrive as null); always hand the
// UI a real array so it never has to null-check.
function normalize(row: any): RevisionComment {
  return { ...row, attachments: Array.isArray(row?.attachments) ? row.attachments : [] } as RevisionComment;
}

export const revisionCommentService = {
  async getCommentsByVideoEdit(videoEditId: string): Promise<RevisionComment[]> {
    const { data, error } = await supabase
      .from('revision_comments')
      .select('*')
      .eq('video_edit_id', videoEditId)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false });

    if (error) throw error;
    return (data || []).map(normalize);
  },

  async createComment(input: CreateCommentInput): Promise<RevisionComment> {
    const { data, error } = await supabase
      .from('revision_comments')
      // attachments is a typed interface[]; the generated column type is Json,
      // which an interface isn't structurally assignable to — cast at the boundary.
      .insert([{ ...input, attachments: (input.attachments ?? []) as any }])
      .select()
      .single();

    if (error) throw error;
    return normalize(data);
  },

  // Replace the attachment array on a note (used when an admin removes one photo).
  async updateAttachments(commentId: string, attachments: NoteAttachment[]): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .update({ attachments: attachments as any })
      .eq('id', commentId);

    if (error) throw error;
  },

  async resolveComment(commentId: string, resolved: boolean): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .update({ resolved })
      .eq('id', commentId);

    if (error) throw error;
  },

  async updateEndTimestamp(commentId: string, endSeconds: number | null): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .update({ end_timestamp_seconds: endSeconds })
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
    // Delete the actual image files first (the DB trigger only clears the
    // storage.objects rows on cascade — this also frees the underlying blobs).
    const { data: existing } = await supabase
      .from('revision_comments')
      .select('attachments')
      .eq('id', commentId)
      .single();
    const raw = existing?.attachments;
    const paths = (Array.isArray(raw) ? (raw as unknown as NoteAttachment[]) : [])
      .map(a => a?.path)
      .filter(Boolean) as string[];
    await noteAttachmentService.remove(paths);

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

  async getCommentSummary(videoEditId: string): Promise<{ total: number; unresolved: number }> {
    const { data, error } = await supabase
      .from('revision_comments')
      .select('resolved')
      .eq('video_edit_id', videoEditId);

    if (error) throw error;
    const total = data?.length ?? 0;
    const unresolved = data?.filter(c => !c.resolved).length ?? 0;
    return { total, unresolved };
  },
};
