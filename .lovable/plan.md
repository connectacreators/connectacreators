

## Changes to the AI Script Builder

### 1. Replace 9 Quality Metrics with a Single "Virality Check" Score

**Edge function** (`supabase/functions/ai-build-script/index.ts`):
- Keep the 9 internal criteria in the system prompt so the AI still evaluates against all of them, but change the tool schema to return a single `virality_score` (the average of all 9) instead of the full `quality_scores` object.
- Apply this change in the `generate-script` and `refine-script` steps.

**Frontend** (`src/components/AIScriptWizard.tsx`):
- Replace the 9-row quality checklist grid with a single "Virality Check" display showing the averaged score (e.g., a bold number out of 10 with color coding: green >= 8, amber >= 6, red < 6).

### 2. Generate Hooks in English by Default

**Edge function** (`supabase/functions/ai-build-script/index.ts`):
- In the `generate-hook` step, change the system prompt from "Write in SPANISH (Latin American) by default" to "Write in ENGLISH by default".
- In the `generate-script` step, change the system prompt from "Write in SPANISH (Latin American)" to "Write in ENGLISH".
- In the `refine-script` step, change the default language instruction from Spanish to English.
- The existing translate buttons on the final step still let the user convert to Spanish whenever needed.

### 3. Reducing Steps Without Losing Effectiveness

Currently the wizard has 6 steps with 4 separate AI calls:
1. Topic input
2. Research (AI call 1)
3. Pick hook format/template
4. Generate hook (AI call 2)
5. Pick structure + length + facts
6. Generate script (AI call 3) + optional refine (AI call 4)

**Recommended consolidation -- merge Steps 3+4 into one and Steps 5+6 into one, reducing to 4 steps total:**

| New Step | Old Steps | What Happens |
|----------|-----------|-------------|
| 1. Topic | 1 | User types topic |
| 2. Research | 2 | AI researches facts (same AI call) |
| 3. Hook | 3 + 4 | User picks format/template, generates hook, sees result -- all in one card |
| 4. Script | 5 + 6 | User picks structure/length/facts, generates script, sees result with Virality Check, refine, translate -- all in one card |

This cuts the visible steps from 6 to 4 while keeping the same number of AI calls (the quality stays identical). The hook step simply shows the generated hook inline after clicking "Generate" instead of scrolling to a new card. Same for the script step.

**UI changes:**
- Update `STEP_NAMES` arrays to 4 entries: `["Topic", "Research", "Hook", "Script"]`
- Update `STEP_ICONS` to 4 icons
- Merge Step 3 (pick format) and Step 4 (see hook) into a single StepCard that shows the generated hook below the format picker once generated, with a Regenerate button inline
- Merge Step 5 (pick structure) and Step 6 (see script) into a single StepCard that shows the script output below the structure/length/facts selectors once generated

### Technical Details

**Files to modify:**
- `supabase/functions/ai-build-script/index.ts` -- simplify quality_scores to virality_score, change language defaults to English
- `src/components/AIScriptWizard.tsx` -- merge steps 3+4 and 5+6, replace quality grid with single Virality Check badge

