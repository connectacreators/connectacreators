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
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.5, ease: [0, 0, 0.2, 1] as const },
  }),
};

export default function Home() {
  const { language } = useLanguage();
  const { theme } = useTheme();

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
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
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
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-bg pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 py-24 sm:py-32 text-center relative z-10">
          <motion.h1
            className="text-3xl sm:text-5xl font-bold leading-tight mb-4"
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
          >
            {tr(t.home.heroTitle, language)}
          </motion.h1>
          <motion.p
            className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto mb-8"
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
          >
            {tr(t.home.heroSubtitle, language)}
          </motion.p>
          <motion.div initial="hidden" animate="visible" custom={2} variants={fadeUp}>
            <Button asChild size="xl" variant="cta">
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
              className="rounded-xl border border-border bg-card p-6 shadow-card hover:shadow-glow transition-smooth"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i + 1}
              variants={fadeUp}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-muted/30 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <motion.h2
            className="text-2xl sm:text-3xl font-bold text-center mb-12"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={0}
            variants={fadeUp}
          >
            {tr(t.home.howItWorksHeading, language)}
          </motion.h2>
          <div className="grid sm:grid-cols-3 gap-8 text-center">
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
      <section className="max-w-3xl mx-auto px-4 py-20 text-center">
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
          <Button asChild size="xl" variant="cta">
            <Link to="/dashboard">{tr(t.home.cta, language)}</Link>
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
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
