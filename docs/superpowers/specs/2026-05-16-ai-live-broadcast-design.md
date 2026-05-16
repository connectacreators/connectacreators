# /ai — Live Broadcast Chat

**Status:** approved 2026-05-16
**Page:** `src/pages/CommandCenter.tsx` (route: `/ai`)
**Goal:** Turn the AI chat from a text-only utility into a *live editorial broadcast* — every turn renders the actual work (channels checking off, scripts typing in, charts drawing themselves, video players analyzing) on the full chat canvas, not as a paragraph of text. The fingerprint avatar is reserved for pure "thinking" moments only.

## Why

Today's `/ai` page is a standard chat: user types → Robby types back → repeat. When Robby says "I found 3 viral hooks" the user gets a sentence. When he says "Calvin's last 3 reels averaged 28K views" the user gets another sentence. None of the work is *visible* — there's no thumbnails, no metrics, no playable previews, no editorial moment of "ah, he's literally pulling from Instagram Insights right now."

The fingerprint is doing too much work: it pulses for every operation regardless of whether Robby is scanning channels, drafting copy, or genuinely reasoning. The result is a chat that feels like a slow command line.

## What we're building

Each Robby turn is now a **stage**. The chat canvas (the central column) renders, in order:

1. (Optional) one or more **Activity scenes** — large, animated, editorial mockups of *the actual operation in progress*. The scene reflects which tool the agent is calling.
2. The **narrative line** — italic EB Garamond text from Robby, one sentence framing what just happened.
3. (Optional) one or more **Embedded media cards** — rich inline content for anything Robby references (a reel he's analyzing, metrics he just pulled, a draft he just wrote, a framework he's recommending).

Each activity scene replaces what would otherwise be a generic spinner. Each embed replaces what would otherwise be a bare text reference. The fingerprint pulses only when no operation is running — i.e. Robby is genuinely between tool calls, reasoning.

## Editorial constraints (non-negotiable)

- **Palette:** Ink `#0A0E12` · Bone `#EAE6DC` · Honey `#E0A560` · Aqua `#8FD0D5`. Add Rose `#b04848` and Sage `#7fb48a` only as semantic accents (hook / CTA / approve / reject).
- **Fonts:** EB Garamond italic for narrative lines and editorial labels; Caveat for hand-written annotations ("first 10x of his career ✦"); JetBrains Mono for technical sub-meta ("ig-insights · 3 reels"); Inter for chips, buttons, eyebrows.
- **Surfaces:** Bone cards over ink page with 2-3px ink stroke and `box-shadow: 4-6px 5-8px 0 #1a1410` hard offset shadow. No drop shadows with blur. No gradients except subtle scene atmospheres.
- **Animation curves:** ease-out for entrances, ease-in-out for idle loops. Reveal timing roughly 0.2-0.6s per element. Use staggered delays so the scene feels orchestrated, not all-at-once.

## Activity scene library

Each agent tool maps to one scene type. Initial 12 scenes:

| # | Operation | Trigger (agent tool) | Scene |
|---|-----------|----------------------|-------|
| 01 | Scanning competitors | `scrape-channels`, `viral-channel-list` | **Live channel grid** — rows fade in one at a time. Each row: avatar, @handle, status (`queued` → `checking…` (aqua, spinning) → `done` (sage) or `★ hit` (honey, hard shadow, pulsing dot)). Summary slides in after all settle. |
| 02 | Drafting | `generate-hook`, `ai-build-script` | **Live script card** — bone paper with hard offset shadow + honey "draft v1" sticker. Sections (Hook → Body → CTA) appear one at a time; text clips in via type-on animation; blinking cursor on the last line. Footer with est. outlier + actions appears when done. |
| 03 | Pulling stats | `ig-insights`, `viral-video-metrics` | **Live stats board** — bone surface, ink stroke. Title row → big EB-Garamond number ticks up → bars grow from baseline left-to-right → Caveat scribble label drops onto the peak bar → dashed-border quote slides in below. |
| 04 | Analyzing a video | `analyze-viral-video`, `viral-video-categorize` | **Live video stage** — actual reel plays on left with an aqua scanline sweeping the frame and a playback bar filling. On the right: a timeline strip populates with hook (honey) / body (aqua) / CTA (sage) markers as they're identified. Below: transcript words stream in, color-tinted by section. |
| 05 | Generating thumbnails | `banana-thumbnail`, `generate-image` | **Polaroid develop** — 3 tilted polaroid frames develop from honey-glow into the actual image. Each takes 800-1200ms. |
| 06 | Comparing | `compare-videos`, `framework-vs-framework` | **Versus stage** — two large cards face off (one rose-tinted, one sage-tinted) with an italic "vs" badge between. Bottom card unfolds with the verdict: which won, on what metric. |
| 07 | Scheduling | `meta-graph-schedule`, `calendar-block` | **Calendar leaf** — a calendar page tears off → new day card flutters into a grid showing the week. Selected slot pulses honey. |
| 08 | Searching the vault | `vault-search`, `vault-list` | **Chest open** — wooden chest lid swings open, honey glow emanates → matching framework cards float out and stack on the canvas. |
| 09 | Reading transcript | `whisper-transcribe`, `transcript-summarize` | **Highlighter sweep** — transcript page appears tilted, a honey highlighter sweeps across the hook/CTA lines, marking them. |
| 10 | Categorizing | `viral-video-categorize` | **Stamp** — large italic format name (`COMPARISON`, `TUTORIAL`) on a rose-bordered pad presses down onto the video, leaving a tilted stamp mark. |
| 11 | Researching trends | `trend-pulse`, `niche-feed-scan` | **Magnifying glass** — hand-drawn glass drifts over a feed of thumbnails. Thumbnails it passes over light up; matching ones snap to the right side as findings. |
| 12 | Thinking | *no tool — pure LLM reasoning* | **Fingerprint pulse** — the existing fingerprint, small, with italic "Thinking — comparing patterns across your last 12 wins." This is the *only* place the fingerprint shows. |

New scenes get added as new tools are wired. A scene must always reflect a real operation — never decorative.

## Inline embed types

Each embed renders content Robby references in his narrative. Embeds are draggable / clickable.

| Embed | Used when narrative mentions | Visual |
|---|---|---|
| **Video card** | "@joe_gennusa's split-screen" | 9:16 thumbnail card with outlier badge corner, handle, stats row (views / engagement / age). Hover lifts; click expands; drag onto chat seeds a draft. |
| **Video player** | "watch this reel" | Same as card but inline-playable: tap = plays in place, with caption overlay, progress bar, mute/fullscreen. |
| **Metric strip** | "Calvin's last 3 reels" | Bone surface, ink stroke. EB-Garamond big number + JetBrains-Mono delta badge (tilted -2deg) + 2-line sparkline + Caveat scribble note. |
| **Framework deck** | "use this hook" | Stacked bone cards (1-3) with hard offset shadow. Top card shows section tags + scribble-underlined punchline. Drag top card off to use it. |
| **Channel grid** | "your 51 channels" | Compact grid showing avatars + handles. Status chips (active / paused / hot). |
| **Script card** | "here's the draft" | Same as the Drafting scene's output, but settled — no type-on, all sections visible, footer with `↻ regen` and `▶ ship to canvas`. |

## Turn-level orchestration

A Robby turn now produces a *script* of operations + narrative + embeds. Pseudocode:

```
turn = {
  scenes: [                      // 0..N — ordered
    { type: "scanning", payload: { channels: [...], hits: [...] } },
    { type: "comparing", payload: { left: video_a, right: video_b } },
  ],
  narrative: "Pulled three. The split-screen one is hot — …",  // italic EB Garamond
  embeds: [                      // 0..N — rendered after narrative
    { type: "video-card", id: "..." },
    { type: "video-card", id: "..." },
    { type: "video-card", id: "..." },
  ],
}
```

The UI renders scenes top-down, plays each scene's animation (the agent stays "in" the scene while the tool actually runs, then plays the completion frame), then drops the italic narrative, then the embeds. Each scene's animation length matches actual tool latency wherever possible — if `scrape-channels` takes 3.2s, the channel grid animates for 3.2s. No more, no less.

When the tool finishes faster than the scene's minimum reveal, the scene plays through its minimum (~1.5s) so the user has time to read it.

## Fingerprint usage rules

- The fingerprint pulses *only* during pure-reasoning turns where the agent ran no tools — e.g. "what should we test next?" → no API calls → fingerprint.
- The fingerprint **never** appears alongside an activity scene.
- The fingerprint **never** appears as a default loading state for a tool call. If the tool doesn't yet have an activity scene mapped, the agent shows a minimal text-only state ("`scrape-channels` · 1.2s") rather than the fingerprint.

## What stays the same

- The current chat threading model (recent chats list, save script flow, autonomy modes Auto/Ask/Plan).
- The shadcn chat input + suggestion chips.
- The DashboardLayout slot rendering.
- Existing realtime / streaming infrastructure — we'll layer on top of it.

## Out of scope (this spec)

- Voice / TTS — pure visual broadcast only.
- A character avatar that idles / blinks — explicitly *not* the direction; fingerprint stays for thinking, no Live2D, no companion creature.
- Game mechanics — no XP, hearts, levels. The "video-game feel" comes from the visible live work, not from gamification.
- Editing existing tool functions to emit new event shapes. The agent layer will translate existing tool output into scene payloads via a small adapter.
- Mobile-specific layout for /ai. (Will be in a follow-up spec — many of these scenes need a different shape on a narrow viewport.)

## Files likely touched (rough)

- `src/components/assistant/AssistantChat.tsx` — the main chat renderer. Add a turn type that carries scenes + narrative + embeds, render in order.
- `src/components/companion/scenes/` — new directory (`src/components/companion/` already exists for `BuildBanner.tsx`), one component per activity scene (`ScanningScene.tsx`, `DraftingScene.tsx`, `StatsScene.tsx`, `VideoAnalysisScene.tsx`, etc.).
- `src/components/companion/embeds/` — new directory for inline embed components (`VideoCardEmbed.tsx`, `MetricStripEmbed.tsx`, `FrameworkDeckEmbed.tsx`, etc.).
- `src/lib/companion/turn-script.ts` — type for the orchestrated turn (scenes / narrative / embeds).
- `src/lib/companion/tool-to-scene.ts` — adapter: given a tool name + result, return the scene type + payload.
- `src/pages/CommandCenter.tsx` — wire the new turn renderer; remove the fingerprint from the default loading state.
- `src/index.css` — add the editorial scene tokens (Caveat font import, scribble-wavy underline mixin if missing, hard-offset-shadow shorthand).

## Acceptance

- Sending a message that triggers `scrape-channels` shows the live channel grid filling in row-by-row (not a fingerprint).
- Sending a message that triggers `ai-build-script` shows the script card with text typing into Hook / Body / CTA sections.
- Sending a message that triggers `ig-insights` shows the stats board with the chart drawing itself.
- Sending a message with no tools (e.g. "what should I test next?") shows the fingerprint with "Thinking — …".
- All embedded media (video cards, metric strips, framework decks) renders inline; clicking opens the relevant detail page; dragging a card onto chat seeds Robby's next turn with that context.
- Mobile viewport (<768px): scenes degrade to a single-column layout with the same animations; cards stack full-width.
- Animations respect `prefers-reduced-motion: reduce` — text appears all at once, no clipping, no draws.

## Future (not this spec)

- Voice narration of activity scenes ("scanning… found three hits").
- A "replay" button on each scene so the user can re-watch what just happened.
- Persistent "session timeline" — a horizontal strip above the chat showing the day's operations as miniature scene icons.
- Multi-agent broadcasts — Robby + a specialist working in parallel, each with their own scene lane.
