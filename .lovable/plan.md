

# "Use This Script as Template" Feature

## What It Does
When creating a script (either manually or with AI), you can toggle "Use This Script as Template." This takes the inspiration URL, sends it to a transcription service, gets the transcript back, then has AI create a templatized version -- keeping the same structure, length, and flow but replacing the specific content with your topic/values.

## How It Works

1. You paste an inspiration URL (Instagram, TikTok, YouTube, etc.)
2. Toggle "Use as Template"
3. The system transcribes the video from the URL
4. AI analyzes the transcript's structure and creates a template
5. The template is used as the base for your new script

## Changes

### 1. Store the API Key securely
- Save the GetTranscribe API key as a backend secret (`GETTRANSCRIBE_API_KEY`)

### 2. New Edge Function: `transcribe-video`
- Accepts `{ url }` in the request body
- Calls GetTranscribe API: `POST https://api.gettranscribe.ai/transcriptions` with the video URL
- Returns the transcription text back to the frontend

### 3. New step in `ai-build-script` Edge Function: `templatize-script`
- Receives the transcription text + the user's topic/context
- AI analyzes the original script's structure (hook style, body pattern, CTA approach, length, pacing)
- Outputs a "templatized" version: same structure and length, but with the user's topic swapped in
- Returns the same structured format (lines with line_type, section, virality_score, etc.)

### 4. Manual Script Mode (Scripts.tsx)
- Add a toggle/switch next to the inspiration URL field: "Use as Template" / "Usar como plantilla"
- When toggled ON and inspiration URL is present:
  - "Analyze & Save" button changes to "Transcribe & Template" / "Transcribir y Crear Plantilla"
  - On click: calls `transcribe-video` to get the transcript, then calls `ai-build-script` with step `templatize-script` passing the transcript + title/topic
  - The resulting structured script is saved normally

### 5. AI Script Wizard (AIScriptWizard.tsx)
- Add the same toggle in Step 1 (Topic), alongside the topic input
- Add an inspiration URL input that appears when toggled ON
- When active, the wizard flow changes:
  - Step 1: Enter topic + paste inspiration URL + toggle on "Use as Template"
  - Clicking "Research" still researches the topic normally
  - At Step 4 (Script generation), the system first transcribes the URL, then generates the script using the transcription as a structural template instead of the selected structure format

---

## Technical Details

### Edge Function: `transcribe-video`
```
POST /functions/v1/transcribe-video
Body: { url: string }
Response: { transcription: string }
```
- Uses `GETTRANSCRIBE_API_KEY` secret
- Requires auth (Bearer token)

### New `ai-build-script` step: `templatize-script`
```
POST /functions/v1/ai-build-script
Body: {
  step: "templatize-script",
  topic: string,
  transcription: string,  // from GetTranscribe
  language: "en" | "es"
}
```
- AI prompt instructs: "Analyze this transcription's structure (hook type, body flow, CTA, length, pacing). Create a NEW script about the given topic that follows the EXACT same structure and approximate length, but with completely new content."
- Returns same format: `{ lines, idea_ganadora, target, formato, virality_score }`

### UI Toggle
- Simple switch component with label "Use as Template" / "Usar como plantilla"
- In manual mode: appears next to the inspiration URL input
- In AI mode: appears in Step 1 with its own URL input
