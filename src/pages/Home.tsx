import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { t, tr } from "@/i18n/translations";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { FileText, Target, CalendarDays, UserPlus, Users, Sparkles, Send, Briefcase, Film } from "lucide-react";

import connectaLoginLogo from "@/assets/connecta-logo-text-light.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-text-dark.png";
import horseIcon from "@/assets/chess-knight-white.svg";
import DottedGlobe from "@/components/DottedGlobe";
import CanvasDemo from "@/components/CanvasDemo";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function Home() {
  const { language } = useLanguage();
  const { theme } = useTheme();

  const heroTitle = tr(t.home.heroTitle, language);
  const heroWords = heroTitle.split(" ");

  const features = [
    {
      icon: FileText,
      title: tr(t.home.featureScriptTitle, language),
      desc: tr(t.home.featureScriptDesc, language),
      disabled: false,
    },
    {
      icon: Target,
      title: tr(t.home.featureLeadTitle, language),
      desc: tr(t.home.featureLeadDesc, language),
      disabled: false,
    },
    {
      icon: CalendarDays,
      title: tr(t.home.featureCalendarTitle, language),
      desc: tr(t.home.featureCalendarDesc, language),
      disabled: false,
    },
    {
      icon: Send,
      title: tr(t.home.featureScheduleTitle, language),
      desc: tr(t.home.featureScheduleDesc, language),
      disabled: true,
    },
    {
      icon: Briefcase,
      title: tr(t.home.featureClientsTitle, language),
      desc: tr(t.home.featureClientsDesc, language),
      disabled: false,
    },
    {
      icon: Film,
      title: tr(t.home.featureEditorsTitle, language),
      desc: tr(t.home.featureEditorsDesc, language),
      disabled: true,
    },
  ];

  const steps = [
    { icon: UserPlus, label: tr(t.home.step1, language) },
    { icon: Users, label: tr(t.home.step2, language) },
    { icon: Sparkles, label: tr(t.home.step3, language) },
  ];

  return (
    <div className="min-h-screen text-foreground relative">
      {/* Subtle primary glow */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div
          className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-[0.07] blur-[150px]"
          style={{ background: `hsl(var(--primary))` }}
        />
      </div>

      {/* Navbar */}
      <header className="fixed top-0 w-full z-50 backdrop-blur-xl bg-background/60 border-b border-border/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0891B2, #84CC16)", boxShadow: "0 2px 8px rgba(8,145,178,0.4)" }}
            >
              <img src={horseIcon} alt="" className="w-5 h-5" />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">Connecta</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
            <Link to="/dashboard">
              <button className="btn-17 btn-17-secondary px-5 py-1.5 text-sm font-medium">
                {tr(t.home.cta, language)}
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <DottedGlobe />
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center pt-24 relative z-10">
          {/* Pill label */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs tracking-widest uppercase font-medium"
              style={{ background: "rgba(8,145,178,0.1)", border: "1px solid rgba(8,145,178,0.25)", color: "#22d3ee" }}
            >
              AI-Powered Content Studio
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            Replicate Viral Videos.<br />
            <span style={{
              background: "linear-gradient(135deg, #06B6D4, #84CC16)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Generate Scripts in Seconds.
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.6 }}
          >
            {tr(t.home.heroSubtitle, language)}
          </motion.p>

          {/* Two CTAs */}
          <motion.div
            className="flex flex-col sm:flex-row items-center gap-4 mb-16"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.4 }}
          >
            <Link to="/select-plan">
              <button
                className="px-8 py-3 rounded-full text-sm font-semibold text-white"
                style={{
                  background: "linear-gradient(135deg, #0891B2, #84CC16)",
                  boxShadow: "0 4px 20px rgba(8,145,178,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                Start Free Trial →
              </button>
            </Link>
            <a href="#demo">
              <button
                className="px-8 py-3 rounded-full text-sm font-semibold"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#94a3b8",
                }}
              >
                See Demo
              </button>
            </a>
          </motion.div>

          {/* Canvas screenshot mockup */}
          <motion.div
            className="w-full max-w-5xl rounded-2xl overflow-hidden relative"
            style={{
              border: "1px solid rgba(8,145,178,0.2)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 60px rgba(8,145,178,0.08)",
            }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Browser chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="w-3 h-3 rounded-full" style={{ background: "#f43f5e", opacity: 0.7 }} />
              <div className="w-3 h-3 rounded-full" style={{ background: "#f59e0b", opacity: 0.7 }} />
              <div className="w-3 h-3 rounded-full" style={{ background: "#a3e635", opacity: 0.7 }} />
              <div
                className="flex-1 mx-4 rounded-md px-3 py-1 text-xs text-center"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b" }}
              >
                connectacreators.com/canvas
              </div>
            </div>
            {/* Canvas preview */}
            <div
              className="relative w-full"
              style={{
                background: "#06090c",
                minHeight: "340px",
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            >
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 20% 20%, rgba(8,145,178,0.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(132,204,22,0.05) 0%, transparent 55%)" }} />
              {/* Node mockups row */}
              <div className="absolute flex gap-4 items-start" style={{ left: "5%", top: "14%", right: "5%" }}>
                {/* Video node */}
                <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width: 180, background: "rgba(8,145,178,0.07)", border: "1px solid rgba(8,145,178,0.2)", boxShadow: "inset 0 1px 0 rgba(8,145,178,0.15), 0 4px 20px rgba(0,0,0,0.3)" }}>
                  <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(8,145,178,0.08)", borderBottom: "1px solid rgba(8,145,178,0.15)" }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ background: "rgba(8,145,178,0.2)", border: "1px solid rgba(8,145,178,0.3)" }}>🎬</div>
                    <span className="text-xs font-semibold" style={{ color: "#22d3ee" }}>Video Node</span>
                  </div>
                  <div className="m-2.5 rounded-lg flex items-center justify-center" style={{ height: 56, background: "linear-gradient(135deg,rgba(8,145,178,0.2),rgba(0,0,0,0.5))", border: "1px solid rgba(8,145,178,0.2)" }}>
                    <span style={{ fontSize: 20 }}>▶</span>
                  </div>
                  <div className="mx-2.5 mb-2.5 flex flex-col gap-1">
                    {([["HOOK", "#22d3ee", "rgba(8,145,178,0.08)", "rgba(8,145,178,0.2)"], ["BODY", "#94a3b8", "rgba(148,163,184,0.06)", "rgba(148,163,184,0.15)"], ["CTA", "#a3e635", "rgba(132,204,22,0.06)", "rgba(132,204,22,0.15)"]] as const).map(([label, color, bg, border]) => (
                      <div key={label} className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ background: bg, border: `1px solid ${border}` }}>
                        <span style={{ fontSize: 7, fontWeight: 700, color }}>{label}</span>
                        <span style={{ fontSize: 7, color: "rgba(226,232,240,0.4)" }}>Hook detected</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Edge video→AI */}
                <div className="flex items-center self-center" style={{ marginTop: -20 }}>
                  <svg width="60" height="24" style={{ overflow: "visible" }}>
                    <path d="M 0,12 C 20,12 40,12 60,12" stroke="rgba(34,211,238,0.5)" strokeWidth="1.5" fill="none" strokeDasharray="3,2" />
                    <circle cx="60" cy="12" r="3" fill="#22d3ee" />
                  </svg>
                </div>
                {/* AI node */}
                <div className="rounded-xl overflow-hidden flex-1" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)" }}>
                  <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(8,145,178,0.08)", borderBottom: "1px solid rgba(8,145,178,0.15)" }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ background: "rgba(8,145,178,0.15)", border: "1px solid rgba(8,145,178,0.25)" }}>🤖</div>
                    <span className="text-xs font-semibold" style={{ color: "#0891B2" }}>Connecta AI</span>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <div className="flex gap-1.5 flex-wrap">
                      <div className="rounded px-2 py-1 text-xs flex items-center gap-1.5" style={{ background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.2)" }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22d3ee", flexShrink: 0 }} />
                        <span style={{ color: "#22d3ee", fontSize: 9 }}>VideoNode · @viral.fitness</span>
                      </div>
                      <div className="rounded px-2 py-1 text-xs flex items-center gap-1.5" style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)" }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#f43f5e", flexShrink: 0 }} />
                        <span style={{ color: "#f43f5e", fontSize: 9 }}>CompetitorNode</span>
                      </div>
                    </div>
                    {([["HOOK", "#22d3ee", "rgba(8,145,178,0.08)", "rgba(8,145,178,0.2)", '"The thing most creators never..."'], ["BODY", "#94a3b8", "rgba(148,163,184,0.06)", "rgba(148,163,184,0.15)", "I wasted 6 months before I found..."], ["CTA", "#a3e635", "rgba(132,204,22,0.06)", "rgba(132,204,22,0.15)", 'Comment "YES" for the full list']] as const).map(([label, color, bg, border, text]) => (
                      <div key={label} className="rounded-md p-2" style={{ background: bg, border: `1px solid ${border}` }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 9, color: "rgba(226,232,240,0.45)" }}>{text}</div>
                      </div>
                    ))}
                    <div className="rounded-lg py-2 text-center text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)", boxShadow: "0 4px 12px rgba(8,145,178,0.3)" }}>✓ Copy Script</div>
                  </div>
                </div>
                {/* Competitor node bottom-left */}
                <div className="absolute rounded-xl overflow-hidden" style={{ left: "5%", top: "58%", width: 175, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)" }}>
                  <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "linear-gradient(135deg,rgba(244,63,94,0.15),rgba(168,85,247,0.15))", borderBottom: "1px solid rgba(244,63,94,0.2)" }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ background: "linear-gradient(135deg,#f43f5e,#a855f7)" }}>🔍</div>
                    <div>
                      <div className="text-xs font-semibold text-foreground leading-none">Competitor Analysis</div>
                      <div style={{ fontSize: 9, color: "rgba(244,63,94,0.8)", marginTop: 1 }}>@dr.rival.fitness</div>
                    </div>
                  </div>
                  <div className="p-2 flex flex-col gap-1">
                    {([["#1", "5.2x", "1.2M", "rgba(244,63,94,0.1)", "#f43f5e", "#22d3ee"], ["#2", "3.1x", "890K", "rgba(244,63,94,0.07)", "#f43f5e", "#a3e635"], ["#3", "2.4x", "650K", "rgba(244,63,94,0.05)", "#64748b", "#64748b"]] as const).map(([rank, score, views, rowBg, vColor, badgeColor]) => (
                      <div key={rank} className="flex items-center justify-between rounded px-2 py-1" style={{ background: rowBg }}>
                        <span style={{ fontSize: 9, color: "rgba(226,232,240,0.45)" }}>{rank} · Reel</span>
                        <span style={{ fontSize: 8, fontWeight: 600, borderRadius: 20, padding: "1px 5px", background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}33` }}>{score}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: vColor }}>{views}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Bottom fade */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(to bottom, transparent, #06090c)", pointerEvents: "none" }} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* See it work — Canvas Demo */}
      <section id="demo" className="py-32 border-t border-border/20">
        <div className="max-w-6xl mx-auto px-6">
          <motion.p
            className="text-xs tracking-[0.3em] uppercase text-muted-foreground text-center mb-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={0}
            variants={fadeUp}
          >
            {tr({ en: "Live Demo", es: "Demo en vivo" }, language)}
          </motion.p>
          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-4 tracking-tight"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={1}
            variants={fadeUp}
          >
            {tr({ en: "See it work", es: "Míralo en acción" }, language)}
          </motion.h2>
          <motion.p
            className="text-center text-muted-foreground mb-12 max-w-xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={2}
            variants={fadeUp}
          >
            {tr({ en: "Drop a video, connect it to AI, add a competitor — watch the script generate in real time.", es: "Agrega un video, conéctalo a la IA, añade un competidor — mira cómo se genera el script en tiempo real." }, language)}
          </motion.p>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={3}
            variants={fadeUp}
          >
            <CanvasDemo />
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-32 border-t border-border/20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <motion.p
            className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={0}
            variants={fadeUp}
          >
            {tr({ en: "Process", es: "Proceso" }, language)}
          </motion.p>
          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold mb-20 tracking-tight"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={1}
            variants={fadeUp}
          >
            {tr(t.home.howItWorksHeading, language)}
          </motion.h2>
          <div className="grid sm:grid-cols-3 gap-12">
            {steps.map((s, i) => (
              <motion.div
                key={i}
                className="flex flex-col items-center gap-5"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i + 2}
                variants={fadeUp}
              >
                <span className="text-6xl font-bold text-foreground/10">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.13)',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.15),0 4px 16px rgba(0,0,0,0.2)'}}>
                  <s.icon className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-32 px-6">
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 tracking-tight"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={0}
            variants={fadeUp}
          >
            {tr(t.home.bottomCtaTitle, language)}
          </motion.h2>
          <motion.p
            className="text-muted-foreground text-lg mb-10 max-w-xl"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={1}
            variants={fadeUp}
          >
            {tr(t.home.bottomCtaDesc, language)}
          </motion.p>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={2}
            variants={fadeUp}
          >
            <Link to="/dashboard">
              <button className="btn-17 btn-17-hero px-8 py-3 text-sm font-semibold tracking-wide">
                {tr(t.home.cta, language)}
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/10 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <img
            src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
            alt="Connecta"
            className="h-5 object-contain opacity-60"
          />
          <div className="flex gap-6 text-xs text-muted-foreground">
            <Link to="/privacy-policy" className="hover:text-foreground transition-colors">
              {tr(t.home.privacy, language)}
            </Link>
            <Link to="/terms-and-conditions" className="hover:text-foreground transition-colors">
              {tr(t.home.terms, language)}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} Connecta
          </p>
        </div>
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground/60">
            {tr({ en: "Contact us", es: "Contáctanos" }, language)}:{" "}
            <a href="mailto:admin@connectacreators.com" className="text-primary hover:underline">
              admin@connectacreators.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
