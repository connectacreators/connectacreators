import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, Wand2, RotateCcw, Save, Search, Zap, BookOpen, Shuffle, Crown, GitCompare, MessageSquare, Lock, Check, ArrowRight, Languages, Send, Copy } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { tr } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Client } from "@/hooks/useClients";

// ==================== HOOK FORMAT DATA ====================
const HOOK_FORMATS = {
  educational: {
    icon: BookOpen,
    templates: [
      "This represents your X before, during, and after X",
      "Here's exactly how much (insert action/item) you need to (insert result)",
      "Can you tell us how to (insert result) in 60 seconds?",
      "I'm going to tell you how to get (insert result), (insert mind blowing method).",
      "It took me 10 years to learn this but I'll teach it to you in less than 1 minute.",
    ],
  },
  randomInspo: {
    icon: Shuffle,
    templates: [
      "This is (insert large number) of (insert item).",
      "You're losing your boyfriend/girlfriend this week to (insert event/hobby).",
      "What (insert title) says vs what they mean.",
      "(insert trend) is the most disgusting trend on social media.",
      "I do not believe in (insert common belief), I believe in (insert your belief).",
    ],
  },
  authorityInspo: {
    icon: Crown,
    templates: [
      "My (insert before state) used to look like this and now they look like this.",
      "10 YEARS it took me from (insert before state) to (insert after state).",
      "How to turn this into this in X simple steps.",
      "(insert big result) from (insert item/thing). Here's how you can do it in X steps.",
      "Over the past (insert time) I've grown my (insert thing) from (insert before) to (insert after).",
    ],
  },
  comparisonInspo: {
    icon: GitCompare,
    templates: [
      "This is an (insert noun), and this is an (insert noun).",
      "This (insert noun) and this (insert noun) have the same amount of (insert noun).",
      "A lot of people ask me what's better (option #1) or (option #2) for (dream result)...",
      "For this (insert item) you could have all of these (insert item).",
      "This (option #1) has (insert noun) in it, and (option #2) has (insert noun) in it.",
    ],
  },
  storytellingInspo: {
    icon: MessageSquare,
    templates: [
      "I started my (insert business) when I was (insert age) with (insert $).",
      "X years ago my (insert person) told me (insert quote).",
      "I don't have a backup plan so this kind of needs to work.",
      "This is how my (insert event/item/result) changed my life.",
      "X years ago I decided to (insert decision).",
    ],
  },
};

const SCRIPT_STRUCTURES = [
  { key: "storytelling", icon: MessageSquare },
  { key: "educational", icon: BookOpen },
  { key: "comparison", icon: GitCompare },
  { key: "authoritarian", icon: Crown },
  { key: "simpleTips", icon: Zap },
  { key: "longTutorial", icon: Search },
];

type Fact = { fact: string; impact_score: number; why_shocking: string };

interface AIScriptWizardProps {
  selectedClient: Client;
  onComplete: (rawContent: string, title: string, inspirationUrl?: string) => Promise<void> | void;
  onCancel: () => void;
}

const STEP_NAMES_EN = ["Topic", "Research", "Structure", "Hook", "Script"];
const STEP_NAMES_ES = ["Tema", "Investigación", "Estructura", "Hook", "Script"];
const STEP_ICONS = [Search, Zap, Copy, Wand2, Save];

export default function AIScriptWizard({ selectedClient, onComplete, onCancel }: AIScriptWizardProps) {
  const { language } = useLanguage();

  const [currentStep, setCurrentStep] = useState(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Step 1: Topic
  const [topic, setTopic] = useState("");

  // Step 2: Research
  const [facts, setFacts] = useState<Fact[]>([]);

  // Step 3: Structure + Template
  const [useAsTemplate, setUseAsTemplate] = useState(false);
  const [templateUrl, setTemplateUrl] = useState("");
  const [selectedStructure, setSelectedStructure] = useState<string | null>(null);
  const [scriptLength, setScriptLength] = useState(1);
  const [selectedFacts, setSelectedFacts] = useState<number[]>([]);

  // Step 4: Hook format + generated hook
  const [selectedHookCategory, setSelectedHookCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [generatedHook, setGeneratedHook] = useState("");

  // Step 5: Final script
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [refining, setRefining] = useState(false);
  const [translating, setTranslating] = useState(false);

  const lengthLabels = [
    tr({ en: "Short (30s)", es: "Corto (30s)" }, language),
    tr({ en: "Medium (45s)", es: "Medio (45s)" }, language),
    tr({ en: "Long (60s)", es: "Largo (60s)" }, language),
  ];

  const hookCategoryNames: Record<string, { en: string; es: string }> = {
    educational: { en: "Educational", es: "Educativo" },
    randomInspo: { en: "Random Inspo", es: "Inspo Random" },
    authorityInspo: { en: "Authority Inspo", es: "Inspo de Autoridad" },
    comparisonInspo: { en: "Comparison Inspo", es: "Inspo de Comparación" },
    storytellingInspo: { en: "Storytelling Inspo", es: "Inspo de Storytelling" },
  };

  const structureNames: Record<string, { en: string; es: string }> = {
    storytelling: { en: "Storytelling", es: "Storytelling" },
    educational: { en: "Educational", es: "Educativo" },
    comparison: { en: "Comparison", es: "Comparación" },
    authoritarian: { en: "Authoritarian", es: "Autoritario" },
    simpleTips: { en: "Simple Tips", es: "Tips Simples" },
    longTutorial: { en: "Long Tutorial", es: "Tutorial Largo" },
  };

  const structureDescriptions: Record<string, { en: string; es: string }> = {
    storytelling: { en: "Narrative arc with beginning, conflict, resolution", es: "Arco narrativo con inicio, conflicto y resolución" },
    educational: { en: "Teach something step by step", es: "Enseña algo paso a paso" },
    comparison: { en: "Compare two things side by side", es: "Compara dos cosas lado a lado" },
    authoritarian: { en: "Expert-driven, authority positioning", es: "Basado en expertise, posicionamiento de autoridad" },
    simpleTips: { en: "Quick numbered tips format", es: "Formato de tips numerados rápidos" },
    longTutorial: { en: "In-depth tutorial with detailed steps", es: "Tutorial a profundidad con pasos detallados" },
  };

  const stepNames = language === "es" ? STEP_NAMES_ES : STEP_NAMES_EN;

  function scrollToStep(stepNum: number) {
    stepRefs.current[stepNum - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function advanceTo(stepNum: number) {
    setCurrentStep(stepNum);
    setMaxUnlockedStep((prev) => Math.max(prev, stepNum));
    setTimeout(() => scrollToStep(stepNum), 100);
  }

  async function callAIBuild(payload: any) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-build-script`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `Error ${res.status}`);
    }
    return await res.json();
  }

  const handleResearch = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const data = await callAIBuild({ step: "research", topic: topic.trim() });
      const factsArr: Fact[] = data.facts || [];
      setFacts(factsArr);
      const top3 = factsArr
        .map((f, i) => ({ score: f.impact_score, i }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.i);
      setSelectedFacts(top3);
      advanceTo(2);
    } catch (e: any) {
      toast.error(e.message || "Error researching topic");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateHook = async () => {
    if (!selectedHookCategory || !selectedTemplate) return;
    setLoading(true);
    try {
      const data = await callAIBuild({
        step: "generate-hook",
        topic,
        facts,
        hookCategory: selectedHookCategory,
        hookTemplate: selectedTemplate,
        language,
      });
      setGeneratedHook(data.hook || "");
    } catch (e: any) {
      toast.error(e.message || "Error generating hook");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!selectedStructure && !useAsTemplate) return;
    setLoading(true);
    try {
      if (useAsTemplate && templateUrl.trim()) {
        toast.info(tr({ en: "Transcribing video...", es: "Transcribiendo video..." }, language));
        const { data: { session } } = await supabase.auth.getSession();
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        };
        const transcribeRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-video`,
          { method: "POST", headers, body: JSON.stringify({ url: templateUrl.trim() }) }
        );
        if (!transcribeRes.ok) {
          const err = await transcribeRes.json().catch(() => ({ error: "Transcription failed" }));
          throw new Error(err.error || "Transcription failed");
        }
        const { transcription } = await transcribeRes.json();
        if (!transcription) throw new Error("Empty transcription");

        toast.info(tr({ en: "Creating template script...", es: "Creando script desde plantilla..." }, language));
        const data = await callAIBuild({
          step: "templatize-script",
          topic,
          transcription,
          language,
        });
        setGeneratedScript(data);
      } else {
        const lengthMap = ["short", "medium", "long"];
        const chosenFacts = selectedFacts.map((i) => facts[i]).filter(Boolean);
        const data = await callAIBuild({
          step: "generate-script",
          topic,
          selectedFacts: chosenFacts,
          hook: generatedHook,
          structure: selectedStructure,
          length: lengthMap[scriptLength],
          language,
        });
        setGeneratedScript(data);
      }
    } catch (e: any) {
      toast.error(e.message || "Error generating script");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedScript?.lines || saving) return;
    setSaving(true);
    try {
      const rawContent = generatedScript.lines.map((l: any) => l.text).join("\n");
      const title = generatedScript.idea_ganadora || topic;
      const inspUrl = useAsTemplate && templateUrl.trim() ? templateUrl.trim() : undefined;
      await onComplete(rawContent, title, inspUrl);
    } finally {
      setSaving(false);
    }
  };

  const handleRefine = async () => {
    if (!feedbackText.trim() || !generatedScript || refining) return;
    setRefining(true);
    try {
      const data = await callAIBuild({
        step: "refine-script",
        topic,
        currentScript: generatedScript,
        feedback: feedbackText.trim(),
      });
      setGeneratedScript(data);
      setFeedbackText("");
      toast.success(tr({ en: "Script refined!", es: "¡Script refinado!" }, language));
    } catch (e: any) {
      toast.error(e.message || "Error refining script");
    } finally {
      setRefining(false);
    }
  };

  const handleTranslate = async (targetLang: "en" | "es") => {
    if (!generatedScript || translating) return;
    setTranslating(true);
    try {
      const data = await callAIBuild({
        step: "translate-script",
        currentScript: generatedScript,
        targetLanguage: targetLang,
      });
      setGeneratedScript(data);
      toast.success(tr({ en: `Translated to ${targetLang === "en" ? "English" : "Spanish"}!`, es: `¡Traducido al ${targetLang === "en" ? "inglés" : "español"}!` }, language));
    } catch (e: any) {
      toast.error(e.message || "Error translating script");
    } finally {
      setTranslating(false);
    }
  };

  const toggleFact = (idx: number) => {
    setSelectedFacts((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  function isStepLocked(s: number) {
    return s > maxUnlockedStep;
  }

  function isStepActive(s: number) {
    return s === currentStep;
  }

  function handleJumpTo(s: number) {
    if (s <= maxUnlockedStep) {
      setCurrentStep(s);
      scrollToStep(s);
    }
  }

  function viralityColor(score: number) {
    if (score >= 8) return "text-green-500 bg-green-500/20";
    if (score >= 6) return "text-amber-500 bg-amber-500/20";
    return "text-red-500 bg-red-500/20";
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ===== JUMP-TO NAVIGATION BAR ===== */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b border-border py-3 -mx-4 px-4 md:-mx-6 md:px-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {stepNames.map((name, i) => {
            const stepNum = i + 1;
            const Icon = STEP_ICONS[i];
            const locked = isStepLocked(stepNum);
            const active = isStepActive(stepNum);
            const complete = stepNum < maxUnlockedStep;

            return (
              <button
                key={stepNum}
                onClick={() => handleJumpTo(stepNum)}
                disabled={locked}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all
                  ${active
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : complete
                      ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                      : locked
                        ? "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                  }
                `}
              >
                {complete ? (
                  <Check className="w-3 h-3" />
                ) : locked ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== STEP 1: Topic ===== */}
      <div ref={(el) => { stepRefs.current[0] = el; }}>
        <StepCard
          stepNum={1}
          title={tr({ en: "What's your topic or idea?", es: "¿Cuál es tu tema o idea?" }, language)}
          icon={<Search className="w-5 h-5 text-primary" />}
          locked={isStepLocked(1)}
          active={isStepActive(1)}
          complete={1 < maxUnlockedStep}
        >
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={tr({ en: "e.g. Benefits of cold showers, How to grow on TikTok...", es: "ej. Beneficios de las duchas frías, Cómo crecer en TikTok..." }, language)}
            className="text-base"
            onKeyDown={(e) => { if (e.key === "Enter") handleResearch(); }}
          />

          <Button onClick={handleResearch} disabled={loading || !topic.trim()} variant="cta" className="gap-2 w-full mt-3">
            {loading && currentStep === 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading && currentStep === 1 ? tr({ en: "Researching...", es: "Investigando..." }, language) : tr({ en: "Research Topic", es: "Investigar Tema" }, language)}
          </Button>
        </StepCard>
      </div>

      {/* ===== STEP 2: Deep Research ===== */}
      <div ref={(el) => { stepRefs.current[1] = el; }}>
        <StepCard
          stepNum={2}
          title={tr({ en: "Deep Research", es: "Investigación Profunda" }, language)}
          icon={<Zap className="w-5 h-5 text-primary" />}
          locked={isStepLocked(2)}
          active={isStepActive(2)}
          complete={2 < maxUnlockedStep}
        >
          {facts.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {tr({ en: "Here are the most impactful facts we found:", es: "Estos son los datos más impactantes:" }, language)}
              </p>
              <div className="grid gap-2">
                {facts.map((f, i) => (
                  <div key={i} className="p-3 rounded-lg border border-primary/10 hover:border-primary/30 transition-all">
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold bg-primary/20 text-primary px-2 py-1 rounded-full flex-shrink-0">
                        {f.impact_score}/10
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{f.fact}</p>
                        <p className="text-xs text-muted-foreground mt-1">{f.why_shocking}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="cta" onClick={() => advanceTo(3)} className="gap-2 w-full mt-3">
                {tr({ en: "Next: Choose Structure", es: "Siguiente: Elegir Estructura" }, language)} <ArrowRight className="w-4 h-4" />
              </Button>
            </>
          )}
        </StepCard>
      </div>

      {/* ===== STEP 3: Structure + Template ===== */}
      <div ref={(el) => { stepRefs.current[2] = el; }}>
        <StepCard
          stepNum={3}
          title={tr({ en: "Choose Structure", es: "Elige Estructura" }, language)}
          icon={<Copy className="w-5 h-5 text-primary" />}
          locked={isStepLocked(3)}
          active={isStepActive(3)}
          complete={3 < maxUnlockedStep}
        >
          {/* Use as Template Toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-gradient-to-r from-card to-muted/30 mb-4">
            <Switch checked={useAsTemplate} onCheckedChange={(checked) => {
              setUseAsTemplate(checked);
              if (checked) setSelectedStructure(null);
            }} />
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium text-foreground cursor-pointer" onClick={() => {
                const next = !useAsTemplate;
                setUseAsTemplate(next);
                if (next) setSelectedStructure(null);
              }}>
                {tr({ en: "Use as Template", es: "Usar como plantilla" }, language)}
              </label>
              <p className="text-xs text-muted-foreground">
                {tr({ en: "Paste a video URL to use its structure as a template", es: "Pega una URL de video para usar su estructura como plantilla" }, language)}
              </p>
            </div>
            <Copy className={`w-4 h-4 flex-shrink-0 ${useAsTemplate ? "text-primary" : "text-muted-foreground"}`} />
          </div>

          {useAsTemplate && (
            <Input
              value={templateUrl}
              onChange={(e) => setTemplateUrl(e.target.value)}
              placeholder={tr({ en: "Paste inspiration video URL (TikTok, Instagram, YouTube...)", es: "Pega URL del video de inspiración (TikTok, Instagram, YouTube...)" }, language)}
              className="mb-4 text-sm"
            />
          )}

          {/* Structure picker - disabled when template mode is on */}
          <div className={`grid grid-cols-2 gap-2 ${useAsTemplate ? "opacity-40 pointer-events-none" : ""}`}>
            {SCRIPT_STRUCTURES.map((s) => {
              const Icon = s.icon;
              const isSelected = selectedStructure === s.key;
              return (
                <Card
                  key={s.key}
                  className={`cursor-pointer transition-all ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => !useAsTemplate && setSelectedStructure(s.key)}
                >
                  <CardContent className="p-3 text-center space-y-1">
                    <Icon className={`w-5 h-5 mx-auto ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <p className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {tr(structureNames[s.key], language)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {tr(structureDescriptions[s.key], language)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Length & Fact selection */}
          <div className="mt-3 p-3 rounded-lg border border-border space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                {tr({ en: "Script Length", es: "Duración del Script" }, language)}: <span className="text-primary">{lengthLabels[scriptLength]}</span>
              </label>
              <Slider value={[scriptLength]} onValueChange={(v) => setScriptLength(v[0])} min={0} max={2} step={1} className="w-full" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                {lengthLabels.map((l) => <span key={l}>{l}</span>)}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                {tr({ en: "Include these research facts:", es: "Incluir estos datos de investigación:" }, language)}
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {facts.map((f, i) => (
                  <label key={i} className="flex items-start gap-2 cursor-pointer text-sm">
                    <Checkbox checked={selectedFacts.includes(i)} onCheckedChange={() => toggleFact(i)} className="mt-0.5" />
                    <span className={selectedFacts.includes(i) ? "text-foreground" : "text-muted-foreground"}>{f.fact}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Button
            variant="cta"
            onClick={() => advanceTo(4)}
            disabled={!selectedStructure && !useAsTemplate}
            className="gap-2 w-full mt-3"
          >
            {tr({ en: "Next: Choose Hook", es: "Siguiente: Elegir Hook" }, language)} <ArrowRight className="w-4 h-4" />
          </Button>
        </StepCard>
      </div>

      {/* ===== STEP 4: Hook ===== */}
      <div ref={(el) => { stepRefs.current[3] = el; }}>
        <StepCard
          stepNum={4}
          title={tr({ en: "Choose & Generate Hook", es: "Elige y Genera Hook" }, language)}
          icon={<Wand2 className="w-5 h-5 text-primary" />}
          locked={isStepLocked(4)}
          active={isStepActive(4)}
          complete={4 < maxUnlockedStep}
        >
          {/* Hook category + template picker */}
          <div className="grid gap-3">
            {Object.entries(HOOK_FORMATS).map(([key, cat]) => {
              const Icon = cat.icon;
              const isSelected = selectedHookCategory === key;
              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-all ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => { setSelectedHookCategory(key); setSelectedTemplate(null); }}
                >
                  <CardHeader className={isSelected ? "pb-2" : "py-3"}>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      {tr(hookCategoryNames[key], language)}
                    </CardTitle>
                  </CardHeader>
                  {isSelected && (
                    <CardContent className="pt-0 space-y-2">
                      {cat.templates.map((tpl, i) => (
                        <button
                          key={i}
                          onClick={(e) => { e.stopPropagation(); setSelectedTemplate(tpl); }}
                          className={`w-full text-left p-3 rounded-xl text-xs transition-all border ${
                            selectedTemplate === tpl
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border hover:border-primary/20 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          "{tpl}"
                        </button>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          <Button
            variant="cta"
            onClick={handleGenerateHook}
            disabled={loading || !selectedTemplate}
            className="gap-2 w-full mt-3"
          >
            {loading && currentStep === 4 && !generatedHook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading && currentStep === 4 && !generatedHook
              ? tr({ en: "Generating...", es: "Generando..." }, language)
              : tr({ en: "Generate Hook", es: "Generar Hook" }, language)}
          </Button>

          {/* Generated hook inline */}
          {generatedHook && (
            <div className="mt-4 space-y-3">
              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{generatedHook}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleGenerateHook} disabled={loading} className="gap-2 flex-1" size="sm">
                  <RotateCcw className="w-3 h-3" /> {tr({ en: "Regenerate", es: "Regenerar" }, language)}
                </Button>
                <Button variant="cta" onClick={() => advanceTo(5)} className="gap-2 flex-1" size="sm">
                  {tr({ en: "Next: Script", es: "Siguiente: Script" }, language)} <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </StepCard>
      </div>

      {/* ===== STEP 5: Generate Script ===== */}
      <div ref={(el) => { stepRefs.current[4] = el; }}>
        <StepCard
          stepNum={5}
          title={tr({ en: "Generate Script", es: "Generar Script" }, language)}
          icon={<Save className="w-5 h-5 text-primary" />}
          locked={isStepLocked(5)}
          active={isStepActive(5)}
          complete={false}
        >
          {/* Template mode notice */}
          {useAsTemplate && templateUrl.trim() && (
            <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 mb-3">
              <p className="text-sm text-foreground flex items-center gap-2">
                <Copy className="w-4 h-4 text-primary" />
                {tr({ en: "Template mode active — the script will follow the structure from your inspiration video.", es: "Modo plantilla activo — el script seguirá la estructura del video de inspiración." }, language)}
              </p>
            </div>
          )}

          <Button
            variant="cta"
            onClick={handleGenerateScript}
            disabled={loading || (!selectedStructure && !useAsTemplate) || (useAsTemplate && !templateUrl.trim())}
            className="gap-2 w-full"
          >
            {loading && currentStep === 5 && !generatedScript ? <Loader2 className="w-4 h-4 animate-spin" /> : useAsTemplate ? <Copy className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {loading && currentStep === 5 && !generatedScript
              ? tr({ en: useAsTemplate ? "Transcribing & Building..." : "Generating Script...", es: useAsTemplate ? "Transcribiendo y Construyendo..." : "Generando Script..." }, language)
              : tr({ en: useAsTemplate ? "Transcribe & Generate" : "Generate Script", es: useAsTemplate ? "Transcribir y Generar" : "Generar Script" }, language)}
          </Button>

          {/* Generated script inline */}
          {generatedScript && (
            <div className="mt-4 space-y-4">
              {/* Virality Check Badge */}
              {generatedScript.virality_score != null && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${viralityColor(generatedScript.virality_score)}`}>
                    {Math.round(generatedScript.virality_score * 10) / 10}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {tr({ en: "🔥 Virality Check", es: "🔥 Virality Check" }, language)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tr({ en: "Average of 9 quality criteria", es: "Promedio de 9 criterios de calidad" }, language)}
                    </p>
                  </div>
                </div>
              )}

              {/* Script lines */}
              <div className="space-y-2">
                {generatedScript.lines?.filter((line: any) => line.line_type === "actor" || line.line_type === "filming").map((line: any, i: number) => {
                  const sectionBadge: Record<string, string> = {
                    hook: "bg-amber-500/20 text-amber-400",
                    body: "bg-blue-500/20 text-blue-400",
                    cta: "bg-green-500/20 text-green-400",
                  };
                  return (
                    <div key={i} className={`p-3 rounded-xl border ${line.line_type === "filming" ? "border-red-500/30 bg-red-500/5" : "border-primary/30 bg-primary/5"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${sectionBadge[line.section] || ""}`}>
                          {line.section}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${line.line_type === "filming" ? "bg-red-500/20 text-red-400" : "bg-purple-500/20 text-purple-400"}`}>
                          {line.line_type === "filming" ? (tr({ en: "Filming", es: "Filmación" }, language)) : (tr({ en: "Voiceover", es: "Voiceover" }, language))}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{line.text}</p>
                    </div>
                  );
                })}
              </div>

              {/* Refine section */}
              <div className="p-3 rounded-lg border border-border space-y-2">
                <label className="text-sm font-medium text-foreground block">
                  {tr({ en: "✏️ What do you want to fix?", es: "✏️ ¿Qué quieres corregir?" }, language)}
                </label>
                <Textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={tr({
                    en: "e.g. Make the CTA more aggressive, change the hook to be more shocking, add more data...",
                    es: "ej. Haz el CTA más agresivo, cambia el hook para que sea más impactante, agrega más datos..."
                  }, language)}
                  className="min-h-[60px] text-sm"
                />
                <Button
                  variant="outline"
                  onClick={handleRefine}
                  disabled={refining || !feedbackText.trim()}
                  className="gap-2 w-full"
                  size="sm"
                >
                  {refining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {refining
                    ? tr({ en: "Refining...", es: "Refinando..." }, language)
                    : tr({ en: "Refine Script", es: "Refinar Script" }, language)
                  }
                </Button>
              </div>

              {/* Translate buttons */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleTranslate("en")} disabled={translating} className="gap-2 flex-1" size="sm">
                  {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                  {tr({ en: "Translate to English", es: "Traducir al Inglés" }, language)}
                </Button>
                <Button variant="outline" onClick={() => handleTranslate("es")} disabled={translating} className="gap-2 flex-1" size="sm">
                  {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                  {tr({ en: "Translate to Spanish", es: "Traducir al Español" }, language)}
                </Button>
              </div>

              {/* Regeneration options */}
              <div className="p-3 rounded-lg border border-border space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    {tr({ en: "Adjust Length", es: "Ajustar Duración" }, language)}: <span className="text-primary">{lengthLabels[scriptLength]}</span>
                  </label>
                  <Slider value={[scriptLength]} onValueChange={(v) => setScriptLength(v[0])} min={0} max={2} step={1} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    {tr({ en: "Facts to include:", es: "Datos a incluir:" }, language)}
                  </label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {facts.map((f, i) => (
                      <label key={i} className="flex items-start gap-2 cursor-pointer text-sm">
                        <Checkbox checked={selectedFacts.includes(i)} onCheckedChange={() => toggleFact(i)} className="mt-0.5" />
                        <span className={selectedFacts.includes(i) ? "text-foreground" : "text-muted-foreground"}>{f.fact}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button variant="outline" onClick={handleGenerateScript} disabled={loading} className="gap-2 w-full" size="sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  {tr({ en: "Regenerate with changes", es: "Regenerar con cambios" }, language)}
                </Button>
              </div>

              <Button variant="cta" onClick={handleSave} disabled={saving} className="gap-2 w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? tr({ en: "Saving...", es: "Guardando..." }, language) : tr({ en: "Save Script", es: "Guardar Script" }, language)}
              </Button>
            </div>
          )}
        </StepCard>
      </div>
    </div>
  );
}

/* ===== Step Card Wrapper ===== */
function StepCard({
  stepNum,
  title,
  icon,
  locked,
  active,
  complete,
  children,
}: {
  stepNum: number;
  title: string;
  icon: React.ReactNode;
  locked: boolean;
  active: boolean;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={`transition-all duration-300 ${
        locked
          ? "opacity-40 pointer-events-none border-border"
          : active
            ? "border-primary/40 shadow-soft"
            : complete
              ? "border-primary/20"
              : "border-border"
      }`}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-base">
          <span className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
            complete
              ? "bg-primary text-primary-foreground"
              : active
                ? "bg-primary/20 text-primary border border-primary/40"
                : "bg-muted text-muted-foreground"
          }`}>
            {complete ? <Check className="w-3.5 h-3.5" /> : stepNum}
          </span>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
