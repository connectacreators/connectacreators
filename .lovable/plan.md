
# Vault: Script Template Library

## Overview
A new "Vault" section in the dashboard where users can transcribe viral videos and save them as reusable script templates. These templates can then be selected when building new scripts (both Manual and AI modes), replacing the current inline "Use as Template" toggle with a library of pre-built templates.

## How It Works

### 1. Vault Page (New)
- Accessible from the client dashboard (ClientDetail) as a new tool card with a vault/library icon
- Also accessible from the sidebar for regular (non-staff) users
- Shows a list of saved templates per client, each displaying:
  - Template name (auto-generated from transcription or user-defined)
  - Source URL (the original video)
  - Date created
  - Structure summary (hook type, body pattern, CTA style)
- "New Template" button opens a simple form:
  - Paste a video URL (TikTok, Instagram, YouTube, etc.)
  - Click "Transcribe & Templatize"
  - The system transcribes the video via GetTranscribe, then sends the transcription to the AI to analyze its structure and save a templatized version
  - User can rename the template before saving
- Templates can be deleted

### 2. Integration with Script Building
- **Manual mode**: Replace the current "Use as Template" toggle + URL input with a "Choose from Vault" selector that shows saved templates. When a template is selected, the script content auto-fills based on the template structure applied to the user's title/topic.
- **AI mode (Step 3 - Structure)**: Replace the current "Use as Template" toggle + URL input with a "Choose from Vault" picker. When selected, it skips the structure picker (same behavior as before) and uses the chosen vault template's structure.

### 3. Routing
- Staff route: `/clients/:clientId/vault`
- Regular user route: `/vault` (auto-selects own client)
- Both use the same `Vault.tsx` page component

---

## Technical Details

### Database: New `vault_templates` table

```sql
CREATE TABLE public.vault_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Template',
  source_url TEXT,
  transcription TEXT,
  structure_analysis JSONB,  -- { hook_type, body_pattern, cta_style, pacing, word_count, etc. }
  template_lines JSONB,      -- Array of { line_type, section, text } with templatized placeholders
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies (same pattern as scripts table)
-- Admin: full access
-- Client: own templates (via is_own_client)
-- Videographer: assigned client templates (via is_assigned_client)
```

### New Page: `src/pages/Vault.tsx`
- Follows the same layout pattern as Scripts.tsx (header, sidebar for staff, AnimatedDots background)
- Two views: template list and create-new-template
- Uses existing `transcribe-video` edge function for transcription
- Uses `ai-build-script` edge function with a new step `"analyze-template"` that returns:
  - Structure analysis (hook type, body flow, CTA approach)
  - Templatized lines with placeholder markers (e.g., `[INSERT TOPIC]`, `[INSERT FACT]`)

### Edge Function Update: `ai-build-script/index.ts`
- New step: `"analyze-template"` -- receives a transcription and returns a structural analysis + templatized version with generic placeholders (not tied to any specific topic)
- Update `"templatize-script"` step to accept an optional `vault_template` parameter (pre-saved template data) so it can skip transcription and use the stored template directly

### Modified Files
1. **`src/App.tsx`** -- Add routes: `/vault` and `/clients/:clientId/vault`
2. **`src/pages/ClientDetail.tsx`** -- Add "Vault" card to the tool grid
3. **`src/components/DashboardSidebar.tsx`** -- Add "Vault" nav item for regular users
4. **`src/pages/Vault.tsx`** -- New page component
5. **`src/pages/Scripts.tsx`** -- Replace "Use as Template" toggle with Vault template picker (fetches from vault_templates table)
6. **`src/components/AIScriptWizard.tsx`** -- Replace "Use as Template" toggle in Step 3 with Vault template picker
7. **`supabase/functions/ai-build-script/index.ts`** -- Add `"analyze-template"` step; update `"templatize-script"` to accept stored template data

### Flow Diagram

When creating a template:
1. User pastes video URL in Vault
2. Frontend calls `transcribe-video` edge function
3. Frontend calls `ai-build-script` with step `"analyze-template"` + transcription
4. AI returns structure analysis + templatized lines
5. Save to `vault_templates` table

When using a template in script building:
1. User selects a template from their Vault in the Manual or AI script builder
2. The template's stored structure/lines are passed to `ai-build-script` step `"templatize-script"` along with the new topic
3. AI generates a new script following the template's exact structure but about the new topic
