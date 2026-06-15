// src/lib/triage/types.ts
//
// Shared types for the admin dashboard triage view.
// A TriageRow describes one row inside a client's block on /dashboard.

export type PipelineMilestone =
  | 'onboarding_call'
  | 'script_due'
  | 'editing_due'
  | 'filming'
  | 'boosting'
  | 'posting';

export interface PipelineTriageRow {
  type: 'pipeline';
  milestone: PipelineMilestone;
  at: string;            // ISO timestamp
  label?: string;        // optional context (budget for boosting, time for onboarding, etc.)
}

export interface ScriptsReviewRow {
  type: 'scripts_review';
  count: number;
  sampleNames: string[];      // up to 3 most-recent script titles
  oldestPendingAt: string;    // ISO; drives the aging dot
}

export interface VideosRevisionRow {
  type: 'videos_revision';
  count: number;
  sampleNames: string[];
  oldestPendingAt: string;
  assignee?: string | null;   // assignee name, only when unambiguous (one distinct assignee)
  assigneeUserId?: string | null; // assignee's user_id, only when unambiguous. When it
                                  // equals the client's user_id the edit is sitting with
                                  // the client for review (a content-calendar revision),
                                  // not with an editor — see buildAgenda owner resolution.
  deadlineAt?: string | null;  // earliest video_edits.deadline among the group, if any set
}

export interface PostsScheduledRow {
  type: 'posts_scheduled';
  count: number;
  sampleNames: string[];   // captions, truncated
  nextAt: string;          // ISO; drives "today 3:00pm"
}

export type TriageRow =
  | PipelineTriageRow
  | ScriptsReviewRow
  | VideosRevisionRow
  | PostsScheduledRow;

export type TriageRowsByClient = Record<string /* clientId */, TriageRow[]>;

export interface TriageClient {
  id: string;
  name: string;
  user_id?: string | null;   // the client's login user_id, when they have one. Used to
                             // tell whether a video edit's assignee is the client itself.
}

import type { Language } from "@/hooks/useLanguage";

export const PIPELINE_MILESTONE_LABEL: Record<PipelineMilestone, string> = {
  onboarding_call: 'Onboarding call',
  script_due:      'Script due',
  editing_due:     'Editing due',
  filming:         'Filming',
  boosting:        'Boosting',
  posting:         'Posting',
};

const PIPELINE_MILESTONE_LABEL_ES: Record<PipelineMilestone, string> = {
  onboarding_call: 'Llamada de onboarding',
  script_due:      'Script pendiente',
  editing_due:     'Edición pendiente',
  filming:         'Grabación',
  boosting:        'Boosting',
  posting:         'Publicación',
};

export function pipelineMilestoneLabel(m: PipelineMilestone, lang: Language = 'en'): string {
  return (lang === 'es' ? PIPELINE_MILESTONE_LABEL_ES : PIPELINE_MILESTONE_LABEL)[m];
}
