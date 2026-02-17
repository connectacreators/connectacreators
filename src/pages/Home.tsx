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
import heroImage from "@/assets/home-hero.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const letterPull = {
  hidden: { opacity: 0, y: 60, rotateX: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { delay: 0.3 + i * 0.04, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
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
      <section className="relative overflow-hidden min-h-[85vh] flex items-center justify-center">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-background/75 backdrop-blur-[2px]" />
          <div className="absolute inset-0 gradient-bg opacity-60" />
        </div>

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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            {tr(t.home.heroSubtitle, language)}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.1, duration: 0.5 }}
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
      <section className="bg-muted/30 py-20">
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
