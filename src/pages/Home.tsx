import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { t, tr } from "@/i18n/translations";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { FileText, Target, CalendarDays, UserPlus, Users, Sparkles } from "lucide-react";

import connectaLoginLogo from "@/assets/connecta-login-logo.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-dark.png";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.3 },
  }),
};

const letterPull = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.025, duration: 0.3 },
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
    },
    {
      icon: Target,
      title: tr(t.home.featureLeadTitle, language),
      desc: tr(t.home.featureLeadDesc, language),
    },
    {
      icon: CalendarDays,
      title: tr(t.home.featureCalendarTitle, language),
      desc: tr(t.home.featureCalendarDesc, language),
    },
  ];

  const steps = [
    { icon: UserPlus, label: tr(t.home.step1, language) },
    { icon: Users, label: tr(t.home.step2, language) },
    { icon: Sparkles, label: tr(t.home.step3, language) },
  ];

  return (
    <div className="min-h-screen text-foreground relative overflow-hidden">
      {/* Full-page gradient background */}
      <div className="fixed inset-0 -z-10" style={{
        background: theme === "light"
          ? "linear-gradient(135deg, hsl(0 0% 100%) 0%, hsl(210 80% 96%) 40%, hsl(210 70% 90%) 100%)"
          : "linear-gradient(135deg, hsl(220 15% 10%) 0%, hsl(215 20% 12%) 40%, hsl(210 25% 15%) 100%)"
      }}>
        {/* Radial glow accents */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full blur-[120px]"
          style={{ background: theme === "light" ? "hsl(210 80% 70% / 0.15)" : "hsl(var(--primary) / 0.08)" }} />
        <div className="absolute bottom-0 right-0 w-[600px] h-[500px] rounded-full blur-[100px]"
          style={{ background: theme === "light" ? "hsl(210 90% 80% / 0.12)" : "hsl(var(--primary) / 0.05)" }} />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/30 backdrop-blur-xl"
        style={{ background: theme === "light" ? "hsla(0,0%,100%,0.6)" : "hsl(var(--background) / 0.6)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <img
            src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
            alt="Connecta"
            className="h-7 object-contain"
          />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <Button asChild size="sm" variant="cta">
              <Link to="/dashboard">{tr(t.home.cta, language)}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center justify-center">
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-24 sm:py-32 text-center flex flex-col items-center">
          {/* Animated headline word-by-word */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-6" style={{ perspective: 600 }}>
            {heroWords.map((word, i) => (
              <motion.span
                key={i}
                className="inline-block mr-[0.3em]"
                initial="hidden"
                animate="visible"
                custom={i}
                variants={letterPull}
              >
                <span className={i === 0 || (language === "es" && i <= 0) ? "text-primary" : ""}>
                  {word}
                </span>
              </motion.span>
            ))}
          </h1>

          <motion.p
            className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto mb-10 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.3 }}
          >
            {tr(t.home.heroSubtitle, language)}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.25 }}
          >
            <Button asChild size="xl" variant="cta" className="shadow-glow">
              <Link to="/dashboard">{tr(t.home.cta, language)}</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <motion.h2
          className="text-2xl sm:text-3xl font-bold text-center mb-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          variants={fadeUp}
        >
          {tr(t.home.featuresHeading, language)}
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={i}
              className="rounded-xl border border-border bg-card p-6 shadow-card hover:shadow-glow transition-smooth text-center flex flex-col items-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i + 1}
              variants={fadeUp}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20" style={{ background: theme === "light" ? "hsl(210 60% 95% / 0.5)" : "hsl(220 10% 8% / 0.4)" }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <motion.h2
            className="text-2xl sm:text-3xl font-bold mb-12"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={0}
            variants={fadeUp}
          >
            {tr(t.home.howItWorksHeading, language)}
          </motion.h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <motion.div
                key={i}
                className="flex flex-col items-center gap-3"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i + 1}
                variants={fadeUp}
              >
                <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-primary font-bold text-xl">
                  {i + 1}
                </div>
                <s.icon className="w-6 h-6 text-primary" />
                <p className="font-medium text-sm">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-3xl mx-auto px-4 py-20 text-center flex flex-col items-center">
        <motion.h2
          className="text-2xl sm:text-3xl font-bold mb-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          variants={fadeUp}
        >
          {tr(t.home.bottomCtaTitle, language)}
        </motion.h2>
        <motion.p
          className="text-muted-foreground mb-8"
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
          <Button asChild size="xl" variant="cta" className="shadow-glow">
            <Link to="/dashboard">{tr(t.home.cta, language)}</Link>
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4 text-sm text-muted-foreground text-center">
          <img
            src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
            alt="Connecta"
            className="h-5 object-contain"
          />
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="hover:text-foreground transition-colors">
              {tr(t.home.privacy, language)}
            </Link>
            <Link to="/terms-and-conditions" className="hover:text-foreground transition-colors">
              {tr(t.home.terms, language)}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
