# Caption API Options — To Revisit

**Context:** AI Video Editor nodes need CapCut-style animated word-by-word captions. Creatomate's built-in captions are too basic. Need a dedicated caption API.

---

## Top Candidates

### ZapCap (zapcap.ai) — Recommended
- 20+ viral caption styles (word-highlight karaoke, TikTok/Reels optimized, emoji overlays)
- Production API on Pro and Agency+ plans
- ~$0.10/min at scale (credits sold separately)
- 99.9% uptime SLA
- Docs: https://platform.zapcap.ai/docs/

### SubMagic (submagic.co)
- Public API launched mid-2025
- Docs: https://docs.submagic.co/introduction
- Supports MCP server + webhooks
- 100+ languages, viral-style captions
- **Downside:** Business plan ($69/mo) only gives 100 min/mo — gets expensive at volume ($0.15/min overage)

---

## Proposed Integration

Two-step render pipeline:
1. **Creatomate** → assembles clips + music + logo → raw MP4
2. **ZapCap or SubMagic** → takes that MP4 → burns animated captions → final MP4

Or potentially ZapCap handles everything in one step if it accepts a clip timeline as input.

---

## Decision Needed
- [ ] Test ZapCap free tier — confirm caption style quality matches CapCut aesthetic
- [ ] Test SubMagic API — check if style options are customizable via API or only through their UI
- [ ] Pick one and update the video editor design spec
