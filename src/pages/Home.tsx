import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { t, tr } from "@/i18n/translations";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { FileText, Target, CalendarDays, UserPlus, Users, Sparkles, Send, Briefcase, Film } from "lucide-react";

import connectaLoginLogo from "@/assets/connecta-login-logo.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-dark.png";
import DottedGlobe from "@/components/DottedGlobe";

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
          <img
            src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
            alt="Connecta"
            className="h-6 object-contain"
          />
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
            <Link to="/dashboard">
              <button className="rounded-full border border-foreground/20 px-5 py-1.5 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors">
                {tr(t.home.cta, language)}
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
        <DottedGlobe />
        <div className="max-w-5xl mx-auto text-center flex flex-col items-center pt-20 relative z-10">
          {/* Pill label */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <span className="inline-block rounded-full border border-foreground/15 px-4 py-1.5 text-xs tracking-widest uppercase text-muted-foreground">
              AI + Social Media
            </span>
          </motion.div>

          {/* Giant headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.9] mb-6">
            {heroWords.map((word, i) => (
              <motion.span
                key={i}
                className="inline-block mr-[0.25em]"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
              >
                <span className={i === 0 ? "text-primary" : ""}>
                  {word}
                </span>
              </motion.span>
            ))}
          </h1>

          <motion.p
            className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            {tr(t.home.heroSubtitle, language)}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            <Link to="/dashboard">
              <button className="rounded-full border border-primary/40 bg-primary/10 px-8 py-3 text-sm font-medium text-primary hover:bg-primary/20 transition-colors">
                {tr(t.home.cta, language)}
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-32">
        <motion.p
          className="text-xs tracking-[0.3em] uppercase text-muted-foreground text-center mb-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          variants={fadeUp}
        >
          {tr({ en: "Features", es: "Funcionalidades" }, language)}
        </motion.p>
        <motion.h2
          className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-20 tracking-tight"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={1}
          variants={fadeUp}
        >
          {tr(t.home.featuresHeading, language)}
        </motion.h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={i}
              className={`rounded-2xl border p-8 transition-colors group ${f.disabled ? "border-border/20 bg-card/10 opacity-50" : "border-border/50 bg-card/30 hover:border-primary/30"}`}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i + 2}
              variants={fadeUp}
            >
              <div className={`w-12 h-12 rounded-full border flex items-center justify-center mb-6 transition-colors ${f.disabled ? "border-foreground/5" : "border-foreground/10 group-hover:border-primary/30"}`}>
                <f.icon className={`w-5 h-5 transition-colors ${f.disabled ? "text-muted-foreground/50" : "text-muted-foreground group-hover:text-primary"}`} />
              </div>
              <h3 className="font-semibold text-lg mb-3 tracking-tight">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
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
                <div className="w-14 h-14 rounded-full border border-foreground/10 flex items-center justify-center">
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
              <button className="rounded-full border border-primary/40 bg-primary/10 px-8 py-3 text-sm font-medium text-primary hover:bg-primary/20 transition-colors">
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
