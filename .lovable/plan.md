

# AI Script Builder - Multi-Step Wizard

## Overview
Add a "Let AI Build It" option to the new script form that launches a multi-step wizard. The wizard uses Claude AI to deep-research a topic, then guides the user through choosing a hook format, generating the hook, choosing a script structure, and finally producing a full script with adjustable length and selectable research facts.

## What You'll See

1. **New toggle in the "+ New Script" view** -- a "Let AI Build It" button alongside the existing manual paste flow
2. **Step 1 - Topic Input**: Enter a topic/idea and click "Research"
3. **Step 2 - Deep Research**: AI finds 8-10 shocking facts about the topic (ranked 8-10 impact), displayed in a card layout. User reviews and clicks "Next"
4. **Step 3 - Choose Hook Format**: Pick from 5 categories (Educational, Random Inspo, Authority Inspo, Comparison Inspo, Storytelling Inspo), each showing template examples. User selects one and clicks "Generate Hook"
5. **Step 4 - Generated Hook**: AI generates a hook based on topic + research + chosen format. User reviews and clicks "Next"
6. **Step 5 - Choose Script Structure**: Select from 6 formats (Storytelling, Educational, Comparison, Authoritarian, Simple Tips, Long Tutorial)
7. **Step 6 - Final Script**: Full script generated. Two filters appear:
   - **Script Length slider** (short / medium / long)
   - **Fact selector** (checkboxes for up to 8 research facts to include)
   - "Regenerate" button that rebuilds the script with updated preferences
8. **Save**: Saves the final script using the existing `categorizeAndSave` flow so it gets properly categorized into hook/body/cta with filming/actor/editor line types

## Technical Details

### 1. Store the Anthropic API Key
- Use the `add_secret` tool to request the user's Anthropic API key, stored as `ANTHROPIC_API_KEY`

### 2. New Edge Function: `ai-build-script`
- Location: `supabase/functions/ai-build-script/index.ts`
- Authenticated (validates JWT like other functions)
- Accepts a `step` parameter to handle all wizard stages in one function:
  - `step: "research"` -- Takes a topic, calls Claude (latest model) with a system prompt to find 8-10 shocking/impactful facts ranked 8-10. Returns structured JSON via tool calling.
  - `step: "generate-hook"` -- Takes topic, research facts, and chosen hook format category + template. Claude generates a hook. Returns the hook text.
  - `step: "generate-script"` -- Takes topic, research facts (user-selected subset), hook, script structure format, and desired length. Claude generates a full script with filming/actor/editor categorization and hook/body/cta sections. Returns structured JSON matching the existing `ScriptLine[]` format.
- Uses `https://api.anthropic.com/v1/messages` directly with the stored `ANTHROPIC_API_KEY`
- Handles rate limits (429) and payment errors (402) with proper error responses

### 3. New Component: `AIScriptWizard`
- Location: `src/components/AIScriptWizard.tsx`
- A multi-step wizard component with state machine tracking current step (1-6)
- Each step renders its own UI card with navigation buttons (Back / Next / Generate)
- On final save, passes the generated raw script text to the existing `categorizeAndSave` function
- Bilingual support via the translation system

### 4. Hook Format Data
- Store all hook templates as a constant object in the wizard component, organized by category (Educational, Random Inspo, Authority Inspo, Comparison Inspo, Storytelling Inspo)
- Each template is displayed as selectable cards

### 5. Script Structure Options
- 6 options: Storytelling, Educational, Comparison, Authoritarian, Simple Tips (with step count), Long Tutorial
- Displayed as selectable cards with brief descriptions

### 6. Frontend Integration
- In `Scripts.tsx`, the "new-script" view gets a toggle/tab: "Manual" vs "Let AI Build It"
- When "Let AI Build It" is active, render `<AIScriptWizard>` instead of the manual textarea form
- The wizard receives `selectedClient`, `onComplete` (saves and navigates to view-script), and `onCancel` (returns to manual mode)

### 7. Translations
- Add all new strings to `src/i18n/translations.ts` (EN/ES) for wizard steps, button labels, hook category names, structure names, etc.

### 8. Config
- Register the new edge function in `supabase/config.toml` with `verify_jwt = false`

## Steps (in order)
1. Request the Anthropic API key from the user via `add_secret`
2. Create the `ai-build-script` edge function with all 3 step handlers
3. Create the `AIScriptWizard.tsx` component with the 6-step wizard UI
4. Update `Scripts.tsx` to add the "Let AI Build It" toggle in the new-script view
5. Add translation strings for all new UI text
6. Update `supabase/config.toml` with the new function entry

