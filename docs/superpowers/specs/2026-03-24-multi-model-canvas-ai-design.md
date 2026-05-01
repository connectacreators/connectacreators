# Multi-Model Canvas AI Assistant with Image Generation

## Summary

Add multi-model support (Claude Haiku/Sonnet/Opus + OpenAI GPT-4o/GPT-4o mini) and DALL-E 3 image generation to the canvas AI assistant. Model selection via dropdown in the input bar. Image generation via toggle button next to the model selector. Credit costs scaled per model using multipliers on the existing token-based formula.

## Models

| Key | API Model ID | Provider | Multiplier | ~Credits/msg |
|-----|-------------|----------|-----------|-------------|
| claude-haiku-4-5 | claude-haiku-4-5-20251001 | anthropic | 1x | 3-8 |
| claude-sonnet-4-5 | claude-sonnet-4-5-20250514 | anthropic | 4x | 15-25 |
| claude-opus-4 | claude-opus-4-20250514 | anthropic | 19x | 60-100 |
| gpt-4o-mini | gpt-4o-mini | openai | 1x | 3-8 |
| gpt-4o | gpt-4o | openai | 3x | 10-20 |

### Image Generation

| Model | Size | Credits |
|-------|------|---------|
| DALL-E 3 | 1024x1024 (standard) | 150 flat |
| DALL-E 3 | 1024x1792 or 1792x1024 (HD/large) | 200 flat |

## Architecture

### Single Edge Function (ai-assistant)

Modify the existing `ai-assistant` edge function. No new functions needed.

**Provider routing:** Derive provider from model key prefix.
- `claude-*` → Anthropic Messages API (existing code path)
- `gpt-*` → OpenAI Chat Completions API (new code path)
- `mode === "image"` → OpenAI Images API / DALL-E 3 (new code path)

**Environment:** `OPENAI_API_KEY` already set in Supabase secrets (used by Whisper). Reuse for Chat Completions and DALL-E.

### Credit Formula

Existing base formula unchanged:
```
base = ceil((input_tokens + output_tokens * 3) / 400)
```

New: multiply by model-specific multiplier:
```
credits = max(3, ceil(base * multiplier))
```

For images: flat rate (150 or 200), no token calculation.

Admin users (user_id = c19ddc3c-76bc-4594-9c50-8818aae34381) bypass credit checks as before.

### Response Normalization

OpenAI responses are mapped to the existing format before returning:
```typescript
// OpenAI Chat Completions response → normalized
{
  content: response.choices[0].message.content,
  input_tokens: response.usage.prompt_tokens,
  output_tokens: response.usage.completion_tokens,
}

// DALL-E response → image format
{
  type: "image",
  image_b64: response.data[0].b64_json,
  revised_prompt: response.data[0].revised_prompt,
  size: requestedSize,
}
```

## Edge Function Changes

**File:** `supabase/functions/ai-assistant/index.ts`

### MODEL_CONFIG replaces MODEL_MAP

```typescript
const MODEL_CONFIG: Record<string, { apiModel: string; provider: "anthropic" | "openai"; multiplier: number }> = {
  "claude-haiku-4-5":  { apiModel: "claude-haiku-4-5-20251001", provider: "anthropic", multiplier: 1 },
  "claude-sonnet-4-5": { apiModel: "claude-sonnet-4-5-20250514", provider: "anthropic", multiplier: 4 },
  "claude-opus-4":     { apiModel: "claude-opus-4-20250514", provider: "anthropic", multiplier: 19 },
  "gpt-4o-mini":       { apiModel: "gpt-4o-mini", provider: "openai", multiplier: 1 },
  "gpt-4o":            { apiModel: "gpt-4o", provider: "openai", multiplier: 3 },
};
```

### OpenAI Chat Completions path

When `provider === "openai"`:
1. Translate system prompt to `{ role: "system", content: systemPrompt }`
2. Map conversation messages to OpenAI format `{ role: "user"/"assistant", content }`
3. Call `https://api.openai.com/v1/chat/completions` with model, messages, max_tokens
4. Extract `choices[0].message.content`, `usage.prompt_tokens`, `usage.completion_tokens`
5. Apply credit formula with model multiplier

### DALL-E 3 image path

When request body includes `mode: "image"`:
1. Check credits >= 150 (or 200 for HD)
2. Call `https://api.openai.com/v1/images/generations` with:
   - model: "dall-e-3"
   - prompt: user message
   - size: "1024x1024" (default) or requested size
   - response_format: "b64_json"
   - n: 1
3. Deduct flat credits (150 or 200)
4. Return `{ type: "image", image_b64, revised_prompt, credits_used }`

### deductCredits update

Add `multiplier` parameter (default 1). For images, add `flatCredits` parameter that bypasses the token formula entirely.

## Frontend Changes

### CanvasAIPanel.tsx

**New state:**
- `imageMode: boolean` (default false)
- `modelDropdownOpen: boolean` (default false)

**Input bar layout** (left to right):
1. Model selector button — shows Lucide `Layers` icon + current model short name + chevron
2. Image toggle button — Lucide `Image` icon, gray when off, purple when on with active dot
3. Text input — placeholder changes based on imageMode
4. Send button — cyan normally, purple in image mode

**Model dropdown:**
- Opens upward from the model selector button
- Grouped by provider: "Anthropic" header, then "OpenAI" header
- Each row: color dot + model name + approximate credits
- Active model highlighted with left border
- Closes on selection or outside click

**Image mode indicators:**
- When imageMode is ON: input border shifts purple, send button purple
- Small bar below input: "Image mode · DALL-E 3 · ~150 cr"
- Placeholder text: "Describe the image..."

**Image messages in chat:**
- New message type: `{ role: "assistant", type: "image", image_b64, revised_prompt }`
- Rendered as: image element with border-radius, revised prompt text below, credit cost
- Purple avatar icon (Image icon) instead of cyan sparkle for image messages

**sendMessage changes:**
- Include `model` key from current selection (existing)
- Include `mode: "image"` when imageMode is true
- On image response, append image message to chat, auto-toggle imageMode off

### AIAssistantNode.tsx

- Add `imageMode` / `setImageMode` state, pass to CanvasAIPanel
- No other changes needed

### SuperPlanningCanvas.tsx

- No changes — aiModel state and onModelChange already wired

## Error Handling

- **Insufficient credits:** Check balance before sending. Show inline "Not enough credits for [model/image]" in chat.
- **API errors:** Normalized error with provider name shown in chat as system message. No credits deducted.
- **Image timeout:** Purple shimmer loading placeholder in chat. 60s edge function timeout.
- **Model unavailability:** Error suggests trying another model. No automatic fallback.

## Image Storage

Images stored as base64 data URLs inline in the chat message JSONB (`canvas_ai_chats.messages`). No Supabase storage upload. Images are ephemeral to the chat session.

## Files Modified

1. `supabase/functions/ai-assistant/index.ts` — MODEL_CONFIG, OpenAI routing, DALL-E path, credit multiplier
2. `src/components/canvas/CanvasAIPanel.tsx` — model dropdown, image toggle, image message rendering
3. `src/components/canvas/AIAssistantNode.tsx` — imageMode state passthrough
