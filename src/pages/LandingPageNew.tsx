import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Menu, X, ArrowRight, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  FileText, Video, BookOpen, Users,
  Calendar, Film, Globe, Zap, Clock,
  TrendingUp, Search, Upload, Monitor,
  CheckCircle, Flame,
} from "lucide-react";
import connectaLoginLogo from "@/assets/connecta-logo-new.png";
import connectaFaviconIcon from "@/assets/connecta-favicon-icon.png";
import BorderGlow from "@/components/ui/BorderGlow";

const useIsMobile = () => {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
};

const PARTICLES = [
  { left: "6%",  dur: 7,   del: 0,   size: 4, color: "rgba(6,182,212,0.7)" },
  { left: "18%", dur: 9,   del: 0.5, size: 3, color: "rgba(132,204,22,0.6)" },
  { left: "30%", dur: 6.5, del: 1.8, size: 5, color: "rgba(34,211,238,0.55)" },
  { left: "42%", dur: 10,  del: 0.3, size: 3, color: "rgba(6,182,212,0.6)" },
  { left: "54%", dur: 7.5, del: 2.5, size: 4, color: "rgba(132,204,22,0.5)" },
  { left: "66%", dur: 8,   del: 1,   size: 3, color: "rgba(34,211,238,0.6)" },
  { left: "78%", dur: 11,  del: 3.5, size: 3, color: "rgba(6,182,212,0.5)" },
  { left: "12%", dur: 8.5, del: 2,   size: 4, color: "rgba(132,204,22,0.45)" },
  { left: "90%", dur: 9.5, del: 1.5, size: 4, color: "rgba(6,182,212,0.55)" },
  { left: "48%", dur: 12,  del: 4,   size: 3, color: "rgba(34,211,238,0.5)" },
  { left: "35%", dur: 6,   del: 0.8, size: 5, color: "rgba(6,182,212,0.5)" },
  { left: "72%", dur: 10.5,del: 3,   size: 3, color: "rgba(132,204,22,0.55)" },
  { left: "85%", dur: 7,   del: 2.2, size: 4, color: "rgba(34,211,238,0.45)" },
  { left: "25%", dur: 13,  del: 5.5, size: 3, color: "rgba(6,182,212,0.4)" },
];

const gold = "#22d3ee";
const goldGradient = "linear-gradient(135deg, #06B6D4 0%, #84CC16 100%)";
const darkBg = "#000000";
const borderGold = "rgba(8, 145, 178, 0.15)";

// ── Viral Videos Mockup (full, for feature section) ───────────────────
function ViralVideosMockup() {
  const videos = [
    { topic: "Morning routine for busy dads", channel: "@fitnessmindset", views: "2.3M", score: "12x", hot: true, hue: 30 },
    { topic: "You've been eating protein wrong", channel: "@drnutrition", views: "847K", score: "7x", hot: true, hue: 90 },
    { topic: "How I got 100K in 30 days", channel: "@thecreatorlab", views: "412K", score: "3x", hot: false, hue: 200 },
    { topic: "The hook formula that never fails", channel: "@contentstrategy", views: "1.1M", score: "9x", hot: true, hue: 270 },
  ];
  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur-xl border w-full"
      style={{ backgroundColor: "rgba(6,9,12,0.97)", borderColor: "rgba(8,145,178,0.35)", boxShadow: "0 0 60px rgba(8,145,178,0.12), 0 30px 80px rgba(0,0,0,0.5)" }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <TrendingUp size={11} style={{ color: "#22d3ee" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}>Viral Today</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-70" />
          <div className="w-2.5 h-2.5 rounded-full opacity-70" style={{ background: gold }} />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-70" />
        </div>
      </div>
      <div className="px-5 pt-4 pb-3 flex items-center gap-2 overflow-hidden">
        <div className="cc-viral-search flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ flex: "1 1 80px", minWidth: 0, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Search size={9} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Search videos or @channel…</span>
        </div>
        {["All platforms", "This week", "10x+ outlier"].map((f, i) => (
          <div key={i} className={`px-2 py-1 rounded-md flex-shrink-0${i > 0 ? " cc-viral-overflow-chips" : ""}`}
            style={{ background: i === 2 ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${i === 2 ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.1)"}`, fontSize: 8, color: i === 2 ? "#f97316" : "rgba(255,255,255,0.45)", fontWeight: i === 2 ? 700 : 400 }}>
            {f}
          </div>
        ))}
      </div>
      <div className="px-5 pb-5 flex flex-col gap-2">
        {videos.map((v, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl group cursor-pointer"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="w-12 h-9 rounded-lg flex-shrink-0 flex items-center justify-center"
              style={{ background: `hsl(${v.hue}, 35%, 18%)`, border: "1px solid rgba(255,255,255,0.08)" }}>
              <Play size={10} style={{ color: "rgba(255,255,255,0.4)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.topic}</p>
              <p style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{v.channel} · {v.views} views</p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md"
              style={{ background: v.hot ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${v.hot ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.1)"}` }}>
              {v.hot && <Flame className="w-2.5 h-2.5 text-[#84CC16]" />}
              <span style={{ fontSize: 8, fontWeight: 700, color: v.hot ? "#84CC16" : "rgba(255,255,255,0.4)" }}>{v.score}</span>
            </div>
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-md"
              style={{ background: "rgba(8,145,178,0.15)", border: "1px solid rgba(8,145,178,0.3)", fontSize: 8, color: gold, fontWeight: 700 }}>
              Remix →
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Feature Mockups ───────────────────────────────────────────────────

function ScriptOutputMockup() {
  return (
    <div
      className="rounded-2xl overflow-hidden backdrop-blur-xl border w-full max-w-md mx-auto"
      style={{
        backgroundColor: "rgba(6,9,12,0.97)",
        borderColor: "rgba(8,145,178,0.25)",
        boxShadow: "0 0 40px rgba(8,145,178,0.1)",
      }}
    >
      {/* Progress steps */}
      <div className="flex items-center gap-0 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {["Topic", "Structure", "Script"].map((step, i) => (
          <div
            key={i}
            className="flex-1 py-3 text-center text-xs relative"
            style={{
              background: i === 2 ? "rgba(8,145,178,0.08)" : "transparent",
              borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
              color: i === 2 ? gold : "rgba(255,255,255,0.3)",
              fontWeight: i === 2 ? 600 : 400,
              fontSize: 9,
            }}
          >
            {i < 2 ? <span style={{ color: "#4ade80" }}>✓ </span> : null}{step}
          </div>
        ))}
      </div>

      {/* Script output */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Generated Script</span>
          <span style={{ fontSize: 8, color: gold, background: "rgba(8,145,178,0.12)", padding: "2px 7px", borderRadius: 4 }}>TikTok · 60s</span>
        </div>
        {[
          { type: "HOOK", text: "I lost 10 lbs in 6 weeks without changing what I eat. Here's the method nobody tells you about." },
          { type: "BRIDGE", text: "Turns out, the problem wasn't my diet. It was my timing. I discovered time-restricted eating by accident." },
          { type: "STORY", text: "I tried everything — meal prep, keto, counting macros. Nothing stuck. Then I started eating in a 10-hour window and the weight started disappearing." },
          { type: "CTA", text: "Try this tonight. No gym, no diet changes. Comment '10' and I'll send you the exact protocol." },
        ].map((line, i) => (
          <div key={i} className="flex gap-2.5 mb-3 last:mb-0">
            <div className="w-0.5 flex-shrink-0 rounded-full mt-0.5" style={{ background: goldGradient, minHeight: 14 }} />
            <div>
              <span style={{ fontSize: 7, color: gold, fontWeight: 700, letterSpacing: "0.12em" }}>{line.type}  </span>
              <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{line.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeleprompterMockup() {
  return (
    <div
      className="rounded-2xl overflow-hidden backdrop-blur-xl border w-full max-w-md mx-auto"
      style={{
        backgroundColor: "rgba(6,9,12,0.99)",
        borderColor: "rgba(8,145,178,0.2)",
        boxShadow: "0 0 40px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2">
          <Monitor size={11} style={{ color: gold }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: gold }}>Teleprompter</span>
        </div>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: 4 }}>Speed 1.2x</span>
      </div>

      {/* Text area */}
      <div className="px-8 py-8 relative overflow-hidden" style={{ minHeight: 160 }}>
        <div className="absolute top-0 left-0 right-0 h-10 z-10" style={{ background: "linear-gradient(to bottom, rgba(6,6,6,0.99), transparent)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-10 z-10" style={{ background: "linear-gradient(to top, rgba(6,6,6,0.99), transparent)" }} />
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", lineHeight: 2.4, marginBottom: 6 }}>Before I show you this,</p>
        <p style={{ fontSize: 17, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 1.8, fontWeight: 300, letterSpacing: "-0.01em" }}>
          Today I want to show you something that completely changed how I approach my mornings —
        </p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", lineHeight: 2.4, marginTop: 6 }}>and it only takes 3 minutes.</p>
      </div>

      {/* Controls */}
      <div className="px-5 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3 mb-4">
          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)" }}>SLOW</span>
          <div className="flex-1 h-1 rounded-full relative" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: "45%", background: goldGradient }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 shadow" style={{ left: "43%", background: "#1a1a1a", borderColor: gold }} />
          </div>
          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)" }}>FAST</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer" style={{ background: goldGradient }}>
            <Play size={14} style={{ color: "#1a1a1a" }} fill="#1a1a1a" />
          </div>
          <div className="px-4 py-2 rounded-lg cursor-pointer" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Mirror Mode</span>
          </div>
          <div className="px-4 py-2 rounded-lg cursor-pointer" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Font +</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TranscriptionMockup() {
  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-3">
      <div
        className="rounded-2xl p-5"
        style={{ border: "2px dashed rgba(8,145,178,0.3)", background: "rgba(8,145,178,0.03)", backdropFilter: "blur(10px)" }}
      >
        <div className="flex flex-col items-center mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(8,145,178,0.12)", border: "1px solid rgba(8,145,178,0.25)" }}>
            <Upload size={18} style={{ color: gold }} />
          </div>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>Drop video or paste link</p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Google Drive · Instagram · TikTok · YouTube</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <Video size={10} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>https://drive.google.com/file/d/1abc...</span>
        </div>
        <div className="py-2.5 rounded-xl text-center font-semibold" style={{ background: goldGradient, color: "#1a1a1a", fontSize: 11, cursor: "pointer" }}>
          Transcribe Now →
        </div>
      </div>

      <div
        className="rounded-2xl p-4 backdrop-blur-xl border"
        style={{ backgroundColor: "rgba(6,9,12,0.97)", borderColor: "rgba(8,145,178,0.2)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontSize: 10, fontWeight: 600, color: gold }}>Transcribed Script</span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.07)", padding: "2px 6px", borderRadius: 4 }}>2m 34s · 3 sections</span>
        </div>
        {[
          { type: "HOOK", text: "Did you know most people gain weight because of when they eat, not what?" },
          { type: "STORY", text: "I used to eat 'healthy' but still gained weight — then I discovered time-restricted eating..." },
          { type: "CTA", text: "Comment '12' and I'll send you the full 12-hour window protocol." },
        ].map((line, i) => (
          <div key={i} className="flex gap-2 mb-2.5 last:mb-0">
            <div className="w-0.5 flex-shrink-0 rounded-full" style={{ background: goldGradient, minHeight: 14 }} />
            <div>
              <span style={{ fontSize: 7, color: gold, fontWeight: 700, letterSpacing: "0.12em" }}>{line.type}  </span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{line.text}</span>
            </div>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-end gap-1.5" style={{ color: gold, cursor: "pointer" }}>
          <BookOpen size={10} />
          <span style={{ fontSize: 9, fontWeight: 600 }}>Save to Vault →</span>
        </div>
      </div>
    </div>
  );
}

function ScriptVaultMockup() {
  const scripts = [
    { title: "10 lbs without dieting — the truth", category: "Health", date: "Mar 5", status: "Scheduled", sc: "#22d3ee" },
    { title: "Morning routine that changed my practice", category: "Lifestyle", date: "Mar 3", status: "Used", sc: "#4ade80" },
    { title: "Why your gym routine isn't working", category: "Fitness", date: "Feb 28", status: "Draft", sc: "#94a3b8" },
    { title: "The 3-minute habit that scales businesses", category: "Business", date: "Feb 24", status: "Used", sc: "#4ade80" },
  ];
  return (
    <div
      className="rounded-2xl overflow-hidden backdrop-blur-xl border w-full max-w-md mx-auto"
      style={{ backgroundColor: "rgba(6,9,12,0.97)", borderColor: "rgba(8,145,178,0.2)", boxShadow: "0 0 30px rgba(8,145,178,0.07)" }}
    >
      <div className="px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Search size={11} style={{ color: "rgba(255,255,255,0.3)" }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Search scripts...</span>
          <span style={{ marginLeft: "auto", fontSize: 8, color: "rgba(255,255,255,0.2)" }}>12 scripts</span>
        </div>
      </div>
      {scripts.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{
            borderColor: "rgba(255,255,255,0.04)",
            background: i === 0 ? "rgba(8,145,178,0.05)" : "transparent",
            borderLeft: i === 0 ? `2px solid ${gold}` : "2px solid transparent",
          }}
        >
          <FileText size={10} style={{ color: i === 0 ? gold : "rgba(255,255,255,0.2)", flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 10, color: i === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)", fontWeight: i === 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span style={{ fontSize: 7, color: gold, background: "rgba(8,145,178,0.14)", padding: "1px 5px", borderRadius: 3 }}>{s.category}</span>
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>{s.date}</span>
            </div>
          </div>
          <span style={{ fontSize: 8, color: s.sc, background: `${s.sc}18`, padding: "2px 7px", borderRadius: 4, flexShrink: 0 }}>{s.status}</span>
        </div>
      ))}
    </div>
  );
}

function LeadTrackerMockup() {
  const columns = [
    {
      title: "New", count: 5, color: "#60a5fa",
      leads: [
        { name: "Sarah M.", source: "IG", time: "2h ago" },
        { name: "Dr. Patel", source: "FB", time: "5h ago" },
      ],
    },
    {
      title: "Contacted", count: 3, color: "#22d3ee",
      leads: [{ name: "Mike R.", source: "TT", time: "1d ago" }],
    },
    {
      title: "Booked", count: 2, color: "#4ade80",
      leads: [{ name: "Ana C.", source: "YT", time: "2d ago" }],
    },
  ];
  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="flex gap-3">
        {columns.map((col, ci) => (
          <div key={ci} className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <span style={{ fontSize: 10, fontWeight: 700, color: col.color }}>{col.title}</span>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.07)", padding: "1px 6px", borderRadius: 10 }}>{col.count}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.leads.map((lead, li) => (
                <div
                  key={li}
                  className="p-3 rounded-xl"
                  style={{ background: "rgba(35,35,35,0.9)", border: `1px solid ${col.color}22`, backdropFilter: "blur(10px)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>{lead.name}</span>
                    <span style={{ fontSize: 7, color: col.color, background: `${col.color}18`, padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>{lead.source}</span>
                  </div>
                  <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.28)" }}>{lead.time}</span>
                </div>
              ))}
              <div
                className="p-2 rounded-xl text-center"
                style={{ border: `1px dashed ${col.color}22`, cursor: "pointer" }}
              >
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>+ Add lead</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarMockup() {
  const dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const weeks = [
    [null, null, null, null, null, null, 1],
    [2, 3, 4, 5, 6, 7, 8],
    [9, 10, 11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20, 21, 22],
    [23, 24, 25, 26, 27, 28, 29],
    [30, 31, null, null, null, null, null],
  ];
  const events: Record<number, string> = {
    3: "#4ade80", 5: "#22d3ee", 10: "#22d3ee",
    12: "#f87171", 17: "#4ade80", 20: "#22d3ee",
    24: "#4ade80", 27: "#22d3ee", 7: "#f87171",
  };
  return (
    <div
      className="rounded-2xl overflow-hidden backdrop-blur-xl border w-full max-w-sm mx-auto"
      style={{ backgroundColor: "rgba(6,9,12,0.97)", borderColor: "rgba(8,145,178,0.2)" }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <Calendar size={12} style={{ color: gold }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>March 2026</span>
        </div>
        <div className="flex gap-4">
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}>‹</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}>›</span>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-7 mb-2">
          {dayLabels.map((d) => (
            <div key={d} className="text-center" style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 mb-0.5">
            {week.map((date, di) => (
              <div key={di} className="flex flex-col items-center py-1.5">
                {date !== null && (
                  <>
                    <span style={{ fontSize: 9, color: date === 7 ? "white" : "rgba(255,255,255,0.5)", fontWeight: date === 7 ? 600 : 400 }}>{date}</span>
                    {events[date] && (
                      <div className="w-1 h-1 rounded-full mt-0.5" style={{ background: events[date] }} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {[{ c: "#4ade80", l: "Approved" }, { c: "#22d3ee", l: "Scheduled" }, { c: "#f87171", l: "Revision" }].map((item) => (
            <div key={item.l} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.c }} />
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.35)" }}>{item.l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditingQueueMockup() {
  const rows = [
    { title: "Morning Routine Reel", editor: "Carlos V.", status: "In Edit", sc: "#60a5fa", date: "Mar 8" },
    { title: "10 lbs No Diet Challenge", editor: "Maria L.", status: "Review", sc: "#22d3ee", date: "Mar 6" },
    { title: "Why Gyms Fail You", editor: "David R.", status: "Done", sc: "#4ade80", date: "Mar 4" },
  ];
  return (
    <div
      className="rounded-2xl overflow-hidden backdrop-blur-xl border w-full max-w-lg mx-auto"
      style={{ backgroundColor: "rgba(6,9,12,0.97)", borderColor: "rgba(8,145,178,0.2)", boxShadow: "0 0 30px rgba(8,145,178,0.06)" }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <Film size={12} style={{ color: gold }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: gold }}>Editing Queue</span>
        </div>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.07)", padding: "2px 7px", borderRadius: 4 }}>Synced · Notion</span>
      </div>
      <div className="grid px-5 py-2 border-b" style={{ gridTemplateColumns: "1fr 90px 75px 45px", borderColor: "rgba(255,255,255,0.04)" }}>
        {["Title", "Editor", "Status", "Date"].map((h) => (
          <span key={h} style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.09em" }}>{h}</span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid px-5 py-3.5 border-b items-center"
          style={{
            gridTemplateColumns: "1fr 90px 75px 45px",
            borderColor: "rgba(255,255,255,0.04)",
            background: i === 1 ? "rgba(8,145,178,0.03)" : "transparent",
          }}
        >
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}>{row.title}</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{row.editor}</span>
          <span style={{ fontSize: 8, color: row.sc, background: `${row.sc}18`, padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>{row.status}</span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>{row.date}</span>
        </div>
      ))}
    </div>
  );
}

// ── Feature Section Component ─────────────────────────────────────────
function FeatureSection({
  label, headline, desc, bullets, mockup, reverse = false,
}: {
  label: string; headline: string; desc: string; bullets: string[];
  mockup: React.ReactNode; reverse?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
      viewport={{ once: true, margin: "-80px" }}
      className="py-20 px-6 border-t relative z-10"
      style={{ borderColor: borderGold }}
    >
      <div className="max-w-7xl mx-auto">
        <div className={`flex flex-col ${reverse ? "md:flex-row-reverse" : "md:flex-row"} gap-12 md:gap-20 items-center`}>
          {/* Text */}
          <div className="flex-1 max-w-lg">
            <p style={{ fontSize: 10, fontWeight: 700, color: gold, letterSpacing: "0.14em", marginBottom: 14 }}>{label}</p>
            <h2 className="text-3xl sm:text-4xl font-light tracking-tight mb-5 leading-tight text-white">{headline}</h2>
            <p className="text-base leading-relaxed mb-7" style={{ color: "#888" }}>{desc}</p>
            <ul className="flex flex-col gap-2.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "#bbb" }}>
                  <CheckCircle size={14} style={{ color: gold, flexShrink: 0, marginTop: 1 }} />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          {/* Mockup */}
          <motion.div
            initial={{ opacity: 0, x: reverse ? -30 : 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            viewport={{ once: true, margin: "-80px" }}
            className="flex-1 w-full"
          >
            {mockup}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

// ── Demo Video Player ────────────────────────────────────────────────
const DEMO_VIDEO_URL = "https://hxojqrilwhhrvloiwmfo.supabase.co/storage/v1/object/public/landing-assets/demo-video.mp4";

function DemoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2800);
  }, [playing]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); setShowControls(true); }
    resetHideTimer();
  }, [resetHideTimer]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setCurrentTime(v.currentTime);
    setProgress(v.currentTime / v.duration);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <section style={{ padding: "0 var(--lp-demo-px) 40px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" as const, zIndex: 1 }}>



      {/* Video wrapper */}
      <div
        ref={containerRef}
        style={{
          position: "relative", width: "100%", maxWidth: 900,
          borderRadius: fullscreen ? 0 : 20, overflow: "hidden",
          border: "1px solid rgba(8,145,178,0.18)",
          boxShadow: "0 0 50px rgba(6,182,212,0.10), 0 0 100px rgba(6,182,212,0.05)",
          background: "#000",
          cursor: "pointer",
        }}
        onMouseMove={resetHideTimer}
        onMouseLeave={() => { if (playing) setShowControls(false); }}
        onClick={toggle}
      >

        {/* Video */}
        <video
          ref={videoRef}
          src={DEMO_VIDEO_URL}
          poster="/demo-poster.jpg"
          style={{ width: "100%", display: "block", maxHeight: fullscreen ? "100vh" : "none" }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
          onEnded={() => { setPlaying(false); setShowControls(true); }}
          playsInline
        />

        {/* Big play overlay (shown when paused) */}
        {!playing && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.25)",
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.28)",
              backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Play size={26} style={{ color: "rgba(255,255,255,0.9)", marginLeft: 4 }} />
            </div>
          </div>
        )}

        {/* Controls bar */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "28px 16px 14px",
            background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%)",
            transition: "opacity 0.35s ease",
            opacity: showControls ? 1 : 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div
            ref={progressRef}
            style={{ height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2, marginBottom: 10, cursor: "pointer", position: "relative" }}
            onClick={handleSeek}
          >
            <div style={{ height: "100%", width: `${progress * 100}%`, background: gold, borderRadius: 2, position: "relative" }}>
              <div style={{ position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "#fff", boxShadow: `0 0 6px ${gold}` }} />
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 0, display: "flex", alignItems: "center" }}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={toggleMute} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.65)", padding: 0, display: "flex", alignItems: "center" }}>
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
              {fmt(currentTime)} / {fmt(duration)}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={toggleFullscreen} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.65)", padding: 0, display: "flex", alignItems: "center" }}>
              {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export default function LandingPageNew() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    {
      label: "CONTENT CREATION",
      headline: "Write Viral Scripts in Minutes, Not Hours",
      desc: "AI generates research-backed, platform-optimized scripts for Instagram, TikTok, and YouTube — complete with hook styles, story structure, and scroll-stopping CTAs.",
      bullets: ["5 hook styles: Shocking Fact, Story, Bold Claim & more", "Research-backed structure per platform", "One-click generation from topic to full script"],
      mockup: <ScriptOutputMockup />,
      reverse: false,
    },
    {
      label: "DELIVERY",
      headline: "Read Your Script. Never Stumble On Camera Again.",
      desc: "Full-screen teleprompter built for creators shooting their own content. Adjustable speed, font size, mirror mode — works beautifully on any device.",
      bullets: ["Mirror mode for front-facing camera", "Variable speed from 0.5x to 3x", "Mobile-optimized for on-the-go recording"],
      mockup: <TeleprompterMockup />,
      reverse: true,
    },
    {
      label: "REPURPOSING",
      headline: "Turn Any Video Into a Script in Seconds",
      desc: "Upload a video or paste a Google Drive link — AI transcribes and structures the content as a ready-to-reuse script with labeled sections.",
      bullets: ["Google Drive, Instagram, TikTok & YouTube links", "Auto-format into Hook / Story / CTA structure", "Save directly to your Script Vault"],
      mockup: <TranscriptionMockup />,
      reverse: false,
    },
    {
      label: "ORGANIZATION",
      headline: "Every Script, Perfectly Organized",
      desc: "A searchable library of all your scripts with categories, status tracking, version history, and one-click export to the teleprompter.",
      bullets: ["Drag-to-reorder lines inside any script", "Full version history — restore any draft", "Export to teleprompter in one click"],
      mockup: <ScriptVaultMockup />,
      reverse: true,
    },
    {
      label: "GROWTH",
      headline: "Never Lose a Lead Again",
      desc: "Track every lead from Instagram DMs, TikTok comments, website forms, and Facebook Ads — all in one unified, filterable pipeline.",
      bullets: ["Kanban and table view with one click", "Source tracking: IG, TikTok, FB, YouTube", "Automated follow-up workflow triggers"],
      mockup: <LeadTrackerMockup />,
      reverse: false,
    },
    {
      label: "PLANNING",
      headline: "See Your Entire Content Pipeline at a Glance",
      desc: "Visual calendar linked to your editing queue and Notion databases. Share a public link with clients to show real-time post status.",
      bullets: ["Color-coded post statuses: Approved, Scheduled, Revision", "Client-shareable public calendar link", "Notion database sync — no manual entry"],
      mockup: <CalendarMockup />,
      reverse: true,
    },
    {
      label: "PRODUCTION",
      headline: "Your Editing Queue, Always Up to Date",
      desc: "Synced directly from Notion — every video in production is visible with real-time status, editor assignments, and delivery dates.",
      bullets: ["Live Notion sync — no copy-pasting", "Videographer assignment and tracking", "Status flow: In Edit → Review → Done"],
      mockup: <EditingQueueMockup />,
      reverse: false,
    },
    {
      label: "VIRAL INTELLIGENCE",
      headline: "Find Viral Videos From Creators in Your Niche",
      desc: "Discover what's already working before you create anything. Spot viral outliers — videos that dramatically outperform a channel's average — and remix them into your next winning script with one click.",
      bullets: [
        "Filter by niche, platform, date, and outlier score",
        "Spot 10x outliers — videos that beat the channel average",
        "One-click remix: turn any viral video into your script",
      ],
      mockup: <ViralVideosMockup />,
      reverse: true,
    },
  ];

  const tickerItems = [
    "AI Script Wizard", "Teleprompter", "Video Transcription", "Lead Tracker",
    "Content Calendar", "Editing Queue", "Public Booking", "Script Vault",
    "Onboarding", "Workflow Automation",
  ];

  return (
    <>
      <style>{`
        @keyframes cc-ember-breathe { 0%,100%{opacity:0.15;transform:scale(1)} 50%{opacity:0.22;transform:scale(1.08)} }
        @keyframes cc-ember-drift { 0%,100%{opacity:0.042;transform:translate(0,0)} 50%{opacity:0.065;transform:translate(20px,-15px)} }
        @keyframes cc-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }

        :root {
          --lp-hero-px: 48px;
          --lp-hero-pt: 120px;
          --lp-h1-size: 56px;
          --lp-h1-tracking: -2px;
          --lp-h1-lh: 1.08;
          --lp-demo-px: 48px;
        }
        @media (max-width: 640px) {
          :root {
            --lp-hero-px: 20px;
            --lp-hero-pt: 90px;
            --lp-h1-size: 32px;
            --lp-h1-tracking: -0.5px;
            --lp-h1-lh: 1.14;
            --lp-demo-px: 14px;
          }
          .cc-viral-overflow-chips { display: none !important; }
          .cc-viral-search { min-width: 0 !important; flex: 1 !important; }
          .cc-feature-mockup { max-width: 100% !important; overflow-x: hidden; }
          .cc-cta-btn { padding: 12px 24px !important; font-size: 14px !important; }
          .cc-stats-num { font-size: 2.75rem !important; }
        }
      `}</style>
      <style>{`
        .glow-orb { position: fixed; border-radius: 50%; pointer-events: none; will-change: transform, opacity; z-index: 50; }
        .glow-orb-1 { top: -30%; left: 30%; width: 1200px; height: 1000px; background: radial-gradient(circle, rgba(6,182,212,.6), transparent 60%); opacity: .06; filter: blur(200px); animation: g1 16s ease-in-out infinite; }
        .glow-orb-2 { bottom: -20%; right: -10%; width: 1000px; height: 800px; background: radial-gradient(circle, rgba(132,204,22,.5), transparent 60%); opacity: .03; filter: blur(180px); animation: g2 20s ease-in-out infinite; }
        .glow-orb-3 { top: 30%; right: 20%; width: 600px; height: 600px; background: radial-gradient(circle, rgba(8,145,178,.4), transparent 60%); opacity: .04; filter: blur(160px); animation: g3 22s ease-in-out infinite; }
        @keyframes g1 { 0%,100%{opacity:.06;transform:scale(1) translate(0,0)} 50%{opacity:.09;transform:scale(1.05) translate(30px,-20px)} }
        @keyframes g2 { 0%,100%{opacity:.03;transform:translate(0,0)} 50%{opacity:.05;transform:translate(-25px,15px)} }
        @keyframes g3 { 0%,100%{opacity:.04;transform:scale(1)} 50%{opacity:.06;transform:scale(1.1) translate(-15px,10px)} }
        video::-webkit-media-controls { display: none !important; }
        video::-webkit-media-controls-panel { display: none !important; }
        video::-webkit-media-controls-play-button { display: none !important; }
        video::-webkit-media-controls-start-playback-button { display: none !important; }
        video::-moz-media-controls { display: none !important; }

      `}</style>

      <div className="min-h-screen text-white overflow-x-hidden ambient-glow" style={{ backgroundColor: darkBg }}>
        <div className="glow-orb glow-orb-1" />
        <div className="glow-orb glow-orb-2" />
        <div className="glow-orb glow-orb-3" />

        {/* Background Embers */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute rounded-full" style={{ top: "-15%", left: "45%", width: 900, height: 700, background: "radial-gradient(circle, rgba(6,182,212,1), transparent 70%)", opacity: 0.12, filter: "blur(160px)", animation: "cc-ember-breathe 14s ease-in-out infinite" }} />
          <div className="absolute rounded-full" style={{ bottom: "-5%", left: "-8%", width: 780, height: 680, background: "radial-gradient(circle, rgba(132,204,22,1), transparent 70%)", opacity: 0.06, filter: "blur(150px)", animation: "cc-ember-drift 18s ease-in-out infinite" }} />
          <div className="absolute rounded-full" style={{ top: "40%", right: "-5%", width: 500, height: 500, background: "radial-gradient(circle, rgba(34,211,238,1), transparent 70%)", opacity: 0.07, filter: "blur(130px)", animation: "cc-ember-breathe 22s ease-in-out infinite 5s" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 130% 90% at 50% 20%, transparent 40%, rgba(6,9,12,0.65) 100%)" }} />
        </div>

        {/* Nav */}
        <nav
          className={`fixed top-0 w-full z-50 transition-all duration-300`}
          style={{
            backdropFilter: isScrolled ? "blur(24px)" : "none",
            backgroundColor: isScrolled ? "rgba(12,12,12,0.75)" : "transparent",
            borderBottom: isScrolled ? `1px solid rgba(8,145,178,0.15)` : "1px solid transparent",
          }}
        >
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <img src={connectaLoginLogo} alt="ConnectaCreators" className="h-8 object-contain" />
            </motion.div>
            <div className="hidden md:flex items-center gap-6">
              <BorderGlow borderRadius={10} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={25} glowRadius={50} coneSpread={10} fillOpacity={0} className="transition duration-200 hover:scale-105 active:scale-95">
                <Link to="/scripts" className="px-6 py-2.5 font-semibold text-sm text-white block" style={{ textDecoration: "none" }}>
                  Try Connecta
                </Link>
              </BorderGlow>
            </div>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ color: gold }}>
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="md:hidden px-6 py-4 border-t"
              style={{ backgroundColor: "rgba(6,9,12,0.95)", borderColor: "rgba(8,145,178,0.2)", backdropFilter: "blur(24px)" }}
            >
              <BorderGlow borderRadius={10} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={25} glowRadius={50} coneSpread={10} fillOpacity={0} className="w-fit">
                <Link to="/scripts" className="px-6 py-2.5 font-semibold text-sm text-white block" style={{ textDecoration: "none" }}>
                  Try Connecta
                </Link>
              </BorderGlow>
            </motion.div>
          )}
        </nav>

        {/* Hero + Demo wrapper with particles background */}
        <div className="relative" style={{ zIndex: 2 }}>
          {/* Background — floating particles + radial glow + noise */}
          <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
            {/* Radial glow base */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15) 0%, transparent 55%)" }} />
            {/* Secondary glow */}
            <div style={{ position: "absolute", top: "15%", left: "25%", width: "50%", height: "40%", background: "radial-gradient(ellipse at center, rgba(132,204,22,0.06) 0%, transparent 65%)" }} />
            {/* Floating particles */}
            {PARTICLES.map((p, i) => (
              <div key={i} className="lp-particle" style={{
                left: p.left, bottom: 0,
                width: p.size, height: p.size,
                background: p.color,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.del}s`,
              }} />
            ))}
            {/* Noise grain overlay */}
            <div className="lp-noise" style={{ position: "absolute", inset: 0, opacity: 0.06 }} />
          </div>

        {/* HERO */}
        <section className="relative flex flex-col items-center" style={{ padding: "var(--lp-hero-pt) var(--lp-hero-px) 48px", zIndex: 1 }}>

          <motion.div
            className="text-center relative z-10"
            style={{ maxWidth: 720 }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <motion.div
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full mb-6"
              style={{ border: "1px solid rgba(8,145,178,.15)", background: "rgba(8,145,178,.03)", fontSize: 10, color: "rgba(34,211,238,.55)", fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" as const }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: gold, opacity: .5 }} />
              AI-Powered Creator Platform
            </motion.div>

            <h1 style={{ fontSize: "var(--lp-h1-size)", fontWeight: 300, fontFamily: "'Big Caslon', 'Book Antiqua', 'Palatino Linotype', Palatino, Georgia, serif", lineHeight: "var(--lp-h1-lh)", marginBottom: 20, letterSpacing: "0.04em", wordSpacing: "normal", color: "rgba(255,255,255,.92)" }}>
              Create viral short-form<br />
              <b style={{ fontWeight: 700, background: goldGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>videos in seconds</b>
            </h1>

            <p style={{ fontSize: 17, color: "rgba(255,255,255,.35)", lineHeight: 1.7, marginBottom: 36, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
              Turn any viral video into a ready-to-edit asset, assign it to your team, and ship faster without the chaos.
            </p>

            <BorderGlow borderRadius={12} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={25} glowRadius={50} coneSpread={10} fillOpacity={0} className="hover:scale-[1.02] transition-transform w-fit mx-auto">
              <Link to="/dashboard" className="inline-flex items-center gap-2.5 px-8 py-3.5 text-white" style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.02em", textDecoration: "none" }}>
                <Play size={14} />
                Try It Free
              </Link>
            </BorderGlow>
          </motion.div>
        </section>

        {/* DEMO VIDEO */}
        <DemoPlayer />
        </div>{/* end Hero + Demo wrapper */}

        {/* Ticker */}
        <div
          className="relative z-10 overflow-hidden border-y py-4"
          style={{ borderColor: "rgba(8,145,178,0.12)", background: "rgba(0,0,0,0.25)" }}
        >
          <div style={{ display: "flex", animation: "cc-ticker 35s linear infinite", width: "max-content" }}>
            {[0, 1].map((rep) => (
              <div key={rep} className="flex items-center gap-10 px-10">
                {tickerItems.map((item) => (
                  <span key={item} className="flex items-center gap-4 whitespace-nowrap">
                    <span style={{ fontSize: 12, color: gold, fontWeight: 500, letterSpacing: "0.03em" }}>{item}</span>
                    <span style={{ color: "rgba(8,145,178,0.4)", fontSize: 16, lineHeight: 1 }}>·</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Feature Sections */}
        {features.map((f, i) => (
          <FeatureSection key={i} {...f} />
        ))}

        {/* Stats Bar */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="py-24 px-6 border-t relative z-10"
          style={{ borderColor: borderGold }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-6 text-center">
              {[
                { stat: "10x", label: "Faster script creation with AI", icon: <Zap size={22} style={{ color: gold }} /> },
                { stat: "3hrs", label: "Saved per video on average", icon: <Clock size={22} style={{ color: gold }} /> },
                { stat: "47%", label: "More leads captured vs manual tracking", icon: <TrendingUp size={22} style={{ color: gold }} /> },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.12, duration: 0.6 }}
                  viewport={{ once: true }}
                  className="flex flex-col items-center"
                >
                  <div className="mb-3">{item.icon}</div>
                  <div className="cc-stats-num text-5xl sm:text-6xl font-light mb-2 text-gradient-brand">
                    {item.stat}
                  </div>
                  <p className="text-sm leading-snug" style={{ color: "#666", maxWidth: 180 }}>{item.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* How It Works */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="py-24 px-6 border-t relative z-10"
          style={{ borderColor: borderGold }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <p style={{ fontSize: 10, fontWeight: 700, color: gold, letterSpacing: "0.14em", marginBottom: 12 }}>HOW IT WORKS</p>
              <h2 className="text-3xl sm:text-4xl font-light tracking-tight text-white">Up and Running in Minutes</h2>
            </div>
            <div className="relative">
              {/* Connecting line */}
              <div
                className="hidden md:block absolute top-8 left-[17%] right-[17%] h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(8,145,178,0.25) 20%, rgba(8,145,178,0.25) 80%, transparent)" }}
              />
              <div className="grid md:grid-cols-3 gap-10 md:gap-8 relative">
                {[
                  { num: "01", title: "Onboard Your Brand", desc: "Fill in your niche, audience, tone, and goals. Connecta learns your brand voice in minutes.", icon: <Users size={20} style={{ color: gold }} /> },
                  { num: "02", title: "Generate & Deliver", desc: "AI writes scripts, your calendar syncs, editing queue updates — everything connected automatically.", icon: <Zap size={20} style={{ color: gold }} /> },
                  { num: "03", title: "Track & Grow", desc: "Monitor leads, bookings, and analytics from one dashboard. Scale what's already working.", icon: <TrendingUp size={20} style={{ color: gold }} /> },
                ].map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.15, duration: 0.6 }}
                    viewport={{ once: true }}
                    className="glass-card rounded-xl p-6 text-center"
                  >
                    <div
                      className="flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-5 relative z-10"
                      style={{ background: "rgba(8,145,178,0.1)", border: "1px solid rgba(8,145,178,0.3)" }}
                    >
                      {step.icon}
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(8,145,178,0.65)", marginBottom: 6, letterSpacing: "0.08em" }}>{step.num}</p>
                    <h3 className="text-base font-semibold mb-2 text-white">{step.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "#666" }}>{step.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* CTA Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="py-28 px-6 border-t relative z-10"
          style={{ borderColor: borderGold }}
        >
          <div className="max-w-3xl mx-auto text-center relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div style={{ width: 600, height: 350, background: "radial-gradient(ellipse, rgba(6,182,212,0.1), transparent 70%)", filter: "blur(40px)" }} />
            </div>
            <div className="relative">
              <p style={{ fontSize: 10, fontWeight: 700, color: gold, letterSpacing: "0.14em", marginBottom: 16 }}>GET STARTED TODAY</p>
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-light tracking-tight mb-6 leading-tight text-white">
                Ready to Create Content{" "}
                <span className="text-gradient-brand" style={{ fontWeight: 600 }}>
                  That Converts?
                </span>
              </h2>
              <p className="text-lg mb-10" style={{ color: "#666" }}>
                Join the creators already using Connecta to scale their personal brand.
              </p>
              <BorderGlow borderRadius={16} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={25} glowRadius={50} coneSpread={10} fillOpacity={0} className="transition duration-200 hover:scale-105 active:scale-95 w-fit mx-auto">
                <Link to="/dashboard" className="cc-cta-btn inline-flex items-center gap-3 px-10 py-5 font-semibold text-base text-white" style={{ textDecoration: "none" }}>
                  Start Free Today
                  <ArrowRight size={18} />
                </Link>
              </BorderGlow>
            </div>
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="border-t py-8 px-6 relative z-10" style={{ borderColor: borderGold }}>
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={connectaLoginLogo} alt="ConnectaCreators" className="h-6 object-contain opacity-60" />
              <span style={{ fontSize: 11, color: "#444" }}>© 2026 ConnectaCreators</span>
            </div>
            <div className="flex items-center gap-6 flex-wrap justify-center">
              <Link to="/dashboard" style={{ fontSize: 12, color: "#444" }} className="hover:text-white transition-colors duration-200">Dashboard</Link>
              <Link to="/login" style={{ fontSize: 12, color: "#444" }} className="hover:text-white transition-colors duration-200">Login</Link>
              <Link to="/privacy-policy" style={{ fontSize: 12, color: "#444" }} className="hover:text-white transition-colors duration-200">Privacy Policy</Link>
              <Link to="/terms-and-conditions" style={{ fontSize: 12, color: "#444" }} className="hover:text-white transition-colors duration-200">Terms of Service</Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}

