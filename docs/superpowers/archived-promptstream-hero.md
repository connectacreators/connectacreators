# Archived: PromptStream hero composition

Removed from the landing hero on **2026-06-07** (it sat directly above the new
ViralWall thumbnail band and the user wanted it gone). Archived here so it can
be dropped back in later.

**The component itself is untouched** and still lives at
`src/components/landing/PromptStream.tsx` (exports `PromptStream` and
`PromptStreamMobile`). Nothing about it was deleted — only its usage in
`src/pages/LandingPageNew.tsx` was removed.

## What it is
The "text into the soundwave" animation: a curling italic prompt on the left →
an animated waveform pill (the AI bubble) in the centre → a tilted dark band on
the right with bold uppercase output ("1M VIEWS ✦ VIRAL SCRIPTS ✦ …"). Desktop
uses a full-viewport-width left/right CurvedLoop composition; mobile is a
centred vertical trio.

## To restore
1. Re-add the import at the top of `src/pages/LandingPageNew.tsx`:

```tsx
import PromptStream, { PromptStreamMobile } from "@/components/landing/PromptStream";
```

2. Re-add this block at the end of the hero `<section>`, just before its
   closing `</section>` (where the comment marker now is):

```tsx
        {/* PromptStream — prompt → AI pill → output banner.
            Desktop: full-viewport-width left/right CurvedLoop composition.
            Mobile: centered vertical trio (no SVG curves, no marquee). */}
        <div
          data-reveal="6"
          style={{
            position: "relative",
            zIndex: 1,
            width: isMobile ? "auto" : "100vw",
            marginLeft: isMobile ? 0 : "calc(50% - 50vw)",
            marginRight: isMobile ? 0 : "calc(50% - 50vw)",
            marginTop: isMobile ? 8 : 24,
          }}
        >
          {isMobile ? <PromptStreamMobile /> : <PromptStream />}
        </div>
```
