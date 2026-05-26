// src/pages/CommandCenterPreview.tsx
// Visual-regression sandbox for the /ai live broadcast scenes + embeds.
// Mock turns demonstrate every component with realistic content.

import TurnRenderer from "@/components/companion/TurnRenderer";
import type { BroadcastTurn } from "@/lib/companion/turn-script";

const MOCK_TURNS: { title: string; turn: BroadcastTurn }[] = [
  {
    title: "Scanning competitors",
    turn: {
      scenes: [{
        type: "scanning",
        verb: "Scanning your chiropractor niche…",
        meta: "scrape-channels · 51 sources · live status",
        payload: {
          channels: [
            { id: "1", username: "joe_gennusa",      avatar_seed: 0, status: "hit",      note: "3 new · 12.4x outlier" },
            { id: "2", username: "leilahormozi",     avatar_seed: 1, status: "done",     note: "2 new" },
            { id: "3", username: "drjones_dc",       avatar_seed: 2, status: "done",     note: "no updates" },
            { id: "4", username: "kaysen.stevens",   avatar_seed: 3, status: "hit",      note: "1 new · 5.4x" },
            { id: "5", username: "squat_university", avatar_seed: 4, status: "done",     note: "no updates" },
            { id: "6", username: "herasmedia",       avatar_seed: 5, status: "checking", note: "checking…" },
            { id: "7", username: "odalundekvam",     avatar_seed: 6, status: "queued",   note: "queued" },
            { id: "8", username: "grant.cardone",    avatar_seed: 7, status: "queued",   note: "queued" },
          ],
          summary: "★ Three hits worth your time — pulling them now.",
        },
      }],
      narrative: "Pulled three. The split-screen one is hot — @joe_gennusa just dropped a comparison opener pacing for 12x in your sub-niche.",
      embeds: [
        { type: "video-card", data: { id: "v1", thumbnail_url: null, caption_overlay: "“It’s a bit expensive”", username: "joe_gennusa",    outlier: 8.2, views: 523_000,   engagement: 4.6, age: "2d ago", format_hint: "Comparison · split-screen" } },
        { type: "video-card", data: { id: "v2", thumbnail_url: null, caption_overlay: "Why most chiros lose",  username: "leilahormozi",   outlier: 7.1, views: 1_800_000, engagement: 3.8, age: "3w ago", format_hint: "Authority · talking head" } },
        { type: "video-card", data: { id: "v3", thumbnail_url: null, caption_overlay: "DOOR TO DOOR",          username: "kaysen.stevens", outlier: 5.4, views: 628_000,   engagement: 2.2, age: "2w ago", format_hint: "Tutorial · POV" } },
      ],
    },
  },
  {
    title: "Drafting",
    turn: {
      scenes: [{
        type: "drafting",
        verb: "Writing Calvin's Tuesday hook…",
        meta: "claude-haiku · borrowing split-screen rhythm · target: week-2 churn",
        payload: {
          sections: [
            { tag: "Hook", body: "Most chiros lose patients in week 2. <scribble>Here's what they're doing wrong.</scribble>" },
            { tag: "Body · split-screen", body: "Left: confident posture, exact follow-up timing.\nRight: vague schedule, no reminder, patient gone." },
            { tag: "CTA", body: "Save this if your retention is leaking after the first appointment." },
          ],
          est_outlier: 12.1,
          read_time_sec: 22,
          matches_note: "matches Calvin's last 3 hooks",
        },
      }],
      narrative: "Here. Borrowed the rhythm from Joe's split-screen and mapped it to Calvin's churn pain.",
      embeds: [],
    },
  },
  {
    title: "Pulling stats",
    turn: {
      scenes: [{
        type: "stats",
        verb: "Loading Calvin's last 7 days from Instagram Insights…",
        meta: "ig-insights · 3 reels · live",
        payload: {
          label: "Views · last 7 days",
          big_value: "28.4K",
          delta: "+44% wow",
          scribble: "↑ best week since launch ✦",
          bars: [
            { label: "WED", value: 22 }, { label: "THU", value: 32 },
            { label: "FRI", value: 28 }, { label: "SAT", value: 40 },
            { label: "SUN", value: 52 }, { label: "MON", value: 58, highlight: true },
            { label: "TUE", value: 86, highlight: true },
          ],
          peak_label: "12.4x ✦",
        },
      }],
      narrative: "Climbing. Thursday's hook finally cracked the niche cap — first 10x of his career.",
      embeds: [],
    },
  },
  {
    title: "Video analysis",
    turn: {
      scenes: [{
        type: "video-analysis",
        verb: "Reading @joe_gennusa's split-screen…",
        meta: "whisper + multimodal · marking hook / body / CTA",
        payload: {
          video_url: null,
          caption: "It’s a bit expensive",
          markers: [
            { section: "hook", start: 0,  end: 5,  label: "hook · 0-5s" },
            { section: "body", start: 5,  end: 32, label: "body · 5-32s" },
            { section: "cta",  start: 32, end: 38, label: "CTA · 32-38s" },
          ],
          transcript: [
            ...["“It’s", "a", "bit", "expensive”", "—"].map((w) => ({ word: w, section: "hook" as const })),
            ...["here’s", "what", "a", "$1,000", "salesman", "does:", "he", "apologizes,", "drops", "the", "price.", "The", "$1M", "salesman?", "He", "asks", "one", "question."].map((w) => ({ word: w, section: "body" as const })),
            ...["Follow", "for", "part", "2."].map((w) => ({ word: w, section: "cta" as const })),
          ],
        },
      }],
      narrative: "His hook is the price tease. The body is the contrast structure I've been recommending to Calvin.",
      embeds: [],
    },
  },
  {
    title: "Pure thinking (fingerprint)",
    turn: {
      scenes: [{
        type: "thinking",
        verb: "",
        meta: "",
        payload: { hint: "Thinking — comparing patterns across your last 12 wins" },
      }],
      narrative: "Two patterns repeat: contrarian openers + week-2 framing. Want me to test a third?",
      embeds: [],
    },
  },
  {
    title: "Embeds — gallery",
    turn: {
      scenes: [],
      narrative: "Inline references — what Robby renders when he mentions a thing.",
      embeds: [
        { type: "metric-strip", data: {
          label: "Calvin · last 3 reels",
          big_value: "28.4K",
          delta: "+44%",
          bars: [{ label: "Sun", value: 12 }, { label: "Mon", value: 30 }, { label: "Tue", value: 60 }],
          scribble: "first 10x of his career ✦",
        } },
        { type: "framework-deck", data: { cards: [
          { tag: "Framework · Comparison", headline: "Most chiros lose patients in <scribble>week 2</scribble>" },
          { tag: "Framework · Listicle",   headline: "5 ways your retention is leaking" },
        ] } },
        { type: "channel-grid", data: { channels: [
          { id: "c1", username: "joe_gennusa",  status: "hot" },
          { id: "c2", username: "leilahormozi", status: "active" },
          { id: "c3", username: "drjones_dc",   status: "paused" },
        ] } },
        { type: "script-card", data: {
          sections: [
            { tag: "Hook", body: "Stop telling chiros to <scribble>just post more</scribble>." },
            { tag: "CTA",  body: "Follow for the part-2 fix." },
          ],
          est_outlier: 7.4, read_time_sec: 18, matches_note: "matches your authority pattern",
        } },
      ],
    },
  },
];

export default function CommandCenterPreview() {
  return (
    <div className="min-h-screen" style={{ background: "#141414" }}>
      <div className="max-w-3xl mx-auto px-5 py-10">
        <h1
          className="text-3xl font-medium mb-1"
          style={{ color: "#EAE6DC", fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif" }}
        >
          /ai live broadcast — preview
        </h1>
        <p className="text-sm mb-8" style={{ color: "rgba(234,230,220,0.55)" }}>
          Every scene and embed with mock data. Reload to replay the animations.
        </p>
        {MOCK_TURNS.map((m, i) => (
          <div key={i} className="mb-10">
            <div
              className="text-[10px] tracking-widest uppercase font-bold mb-3"
              style={{ color: "#8FD0D5", fontFamily: "Inter, sans-serif" }}
            >
              {String(i + 1).padStart(2, "0")} · {m.title}
            </div>
            <TurnRenderer turn={m.turn} />
          </div>
        ))}
      </div>
    </div>
  );
}
