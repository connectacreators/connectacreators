import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, Sparkles, Wand2, RotateCcw, Search, Zap, BookOpen,
  Shuffle, Crown, GitCompare, MessageSquare, Check, ArrowRight,
  Languages, Send, Copy, ChevronDown, ChevronUp, Film, Mic, Scissors,
  X, RefreshCw, AlignLeft, Video, Users, Grid3X3, Archive,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { tr } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Client } from "@/hooks/useClients";
import type { ScriptLine } from "@/hooks/useScripts";

// ==================== VAULT TEMPLATE TYPE ====================
type VaultTemplate = {
  id: string;
  name: string;
  template_lines: Array<{ line_type: string; section: string; text: string }>;
  structure_analysis?: Record<string, any>;
};

// ==================== HOOK FORMAT DATA ====================
const HOOK_FORMATS = {
  educational: {
    icon: BookOpen,
    label: { en: "Educational", es: "Educativo" },
    color: "from-blue-500/35 to-blue-600/25 border-blue-500/50 text-blue-300",
    activeColor: "from-blue-500/45 to-blue-600/35 border-blue-400 text-blue-100",
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
    label: { en: "Random Inspo", es: "Inspo Random" },
    color: "from-purple-500/35 to-purple-600/25 border-purple-500/50 text-purple-300",
    activeColor: "from-purple-500/45 to-purple-600/35 border-purple-400 text-purple-100",
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
    label: { en: "Authority Inspo", es: "Inspo de Autoridad" },
    color: "from-amber-500/35 to-amber-600/25 border-amber-500/50 text-amber-300",
    activeColor: "from-amber-500/45 to-amber-600/35 border-amber-400 text-amber-100",
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
    label: { en: "Comparison", es: "Comparación" },
    color: "from-emerald-500/35 to-emerald-600/25 border-emerald-500/50 text-emerald-300",
    activeColor: "from-emerald-500/45 to-emerald-600/35 border-emerald-400 text-emerald-100",
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
    label: { en: "Storytelling", es: "Storytelling" },
    color: "from-rose-500/35 to-rose-600/25 border-rose-500/50 text-rose-300",
    activeColor: "from-rose-500/45 to-rose-600/35 border-rose-400 text-rose-100",
    templates: [
      "I started my (insert business) when I was (insert age) with (insert $).",
      "X years ago my (insert person) told me (insert quote).",
      "I don't have a backup plan so this kind of needs to work.",
      "This is how my (insert event/item/result) changed my life.",
      "X years ago I decided to (insert decision).",
    ],
  },
};

// ==================== SCRIPT FORMATS ====================
const SCRIPT_FORMATS = [
  {
    id: "talking_head",
    icon: Mic,
    label: "TALKING HEAD",
    description: { en: "Direct-to-camera monologue", es: "Monólogo directo a cámara" },
    color: "from-purple-500/35 to-purple-700/25 border-purple-500/50",
    activeColor: "from-purple-500/45 to-purple-700/35 border-purple-400",
    iconColor: "text-purple-300",
  },
  {
    id: "broll_caption",
    icon: Video,
    label: "B-ROLL CAPTION",
    description: { en: "Voiceover with B-roll footage", es: "Voz en off con imágenes de apoyo" },
    color: "from-blue-500/35 to-blue-700/25 border-blue-500/50",
    activeColor: "from-blue-500/45 to-blue-700/35 border-blue-400",
    iconColor: "text-blue-300",
  },
  {
    id: "entrevista",
    icon: Users,
    label: "ENTREVISTA",
    description: { en: "Interview / Q&A format", es: "Formato de entrevista / Q&A" },
    color: "from-emerald-500/35 to-emerald-700/25 border-emerald-500/50",
    activeColor: "from-emerald-500/45 to-emerald-700/35 border-emerald-400",
    iconColor: "text-emerald-300",
  },
  {
    id: "variado",
    icon: Grid3X3,
    label: "VARIADO",
    description: { en: "Mixed format & transitions", es: "Formato mixto con transiciones" },
    color: "from-amber-500/35 to-amber-700/25 border-amber-500/50",
    activeColor: "from-amber-500/45 to-amber-700/35 border-amber-400",
    iconColor: "text-amber-300",
  },
];

// ==================== TYPES ====================
type Fact = { fact: string; impact_score: number };
type Step = 1 | 2 | 3 | 4 | 5;

interface AIScriptWizardProps {
  selectedClient: Client;
  onComplete: (
    result: {
      lines: ScriptLine[];
      idea_ganadora: string;
      target: string;
      formato: string;
      virality_score?: number;
    },
    inspirationUrl?: string
  ) => Promise<void> | void;
  onCancel: () => void;
}

// ==================== STEP CONFIG ====================
const STEPS = [
  { num: 1 as Step, icon: Search,   label: { en: "Topic",     es: "Tema"       } },
  { num: 2 as Step, icon: Zap,      label: { en: "Research",  es: "Research"   } },
  { num: 3 as Step, icon: Wand2,    label: { en: "Hook",      es: "Hook"       } },
  { num: 4 as Step, icon: Film,     label: { en: "Style",     es: "Estilo"     } },
  { num: 5 as Step, icon: AlignLeft, label: { en: "Script",   es: "Script"     } },
];

// ==================== VIRALITY COLOR ====================
function viralityColor(score: number) {
  if (score >= 8) return "text-green-400";
  if (score >= 6) return "text-amber-400";
  return "text-red-400";
}

function viralityBg(score: number) {
  if (score >= 8) return "bg-green-500/20 border-green-500/30";
  if (score >= 6) return "bg-amber-500/20 border-amber-500/30";
  return "bg-red-500/20 border-red-500/30";
}

// ==================== MAIN COMPONENT ====================
export function AIScriptWizard({ selectedClient, onComplete, onCancel }: AIScriptWizardProps) {
  const { language } = useLanguage();

  // Navigation
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);

  // Step 1 — Topic
  const [topic, setTopic] = useState("");

  // Step 2 — Research
  const [facts, setFacts] = useState<Fact[]>([]);
  const [selectedFacts, setSelectedFacts] = useState<number[]>([]);

  // Step 3 — Hook
  const [expandedHookCategory, setExpandedHookCategory] = useState<string | null>(null);
  const [selectedHookCategory, setSelectedHookCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Step 4 — Style/Format
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [scriptLength, setScriptLength] = useState(1);
  const [scriptLanguage, setScriptLanguage] = useState<"en" | "es">("es");

  // Step 4 — Vault Templates
  const [vaultTemplates, setVaultTemplates] = useState<VaultTemplate[]>([]);
  const [vaultTemplatesLoading, setVaultTemplatesLoading] = useState(false);
  const [selectedVaultTemplateId, setSelectedVaultTemplateId] = useState<string | null>(null);
  const [structureMode, setStructureMode] = useState<"default" | "vault">("default");

  // Step 5 — Script
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [refining, setRefining] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);

  const lengthLabels = [
    tr({ en: "Short (30s)", es: "Corto (30s)" }, language),
    tr({ en: "Medium (45s)", es: "Medio (45s)" }, language),
    tr({ en: "Long (60s)", es: "Largo (60s)" }, language),
  ];

  // ==================== NAVIGATION ====================
  const advanceTo = useCallback((step: Step) => {
    setCurrentStep(step);
    setMaxUnlockedStep((prev) => (step > prev ? step : prev) as Step);
    // Smooth scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const jumpTo = useCallback((step: Step) => {
    if (step <= maxUnlockedStep) {
      setCurrentStep(step);
    }
  }, [maxUnlockedStep]);

  // ==================== FETCH VAULT TEMPLATES ON STEP 4 ====================
  useEffect(() => {
    if (currentStep === 4 && vaultTemplates.length === 0 && !vaultTemplatesLoading) {
      setVaultTemplatesLoading(true);
      supabase
        .from("vault_templates")
        .select("id, name, template_lines, structure_analysis")
        .eq("client_id", selectedClient.id)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setVaultTemplates(data as VaultTemplate[]);
          }
          setVaultTemplatesLoading(false);
        });
    }
  }, [currentStep, selectedClient.id, vaultTemplates.length, vaultTemplatesLoading]);

  // ==================== API HELPER ====================
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

  // ==================== HANDLERS ====================
  const handleResearch = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const data = await callAIBuild({ step: "research", topic: topic.trim() });
      const factsArr: Fact[] = (data.facts || []).slice(0, 5);
      setFacts(factsArr);
      // Auto-select top 3 by impact_score
      const top3 = factsArr
        .map((f, i) => ({ score: f.impact_score, i }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.i);
      setSelectedFacts(top3);
      advanceTo(2);
    } catch (e: any) {
      toast.error(e.message || tr({ en: "Error researching topic", es: "Error al investigar el tema" }, language));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateScript = async () => {
    // If vault mode is selected, require a vault template
    if (structureMode === "vault") {
      if (!selectedVaultTemplateId) {
        toast.error(tr({ en: "Please select a Vault template first.", es: "Selecciona una plantilla del Vault primero." }, language));
        return;
      }
      setLoading(true);
      try {
        const vaultTemplate = vaultTemplates.find((t) => t.id === selectedVaultTemplateId);
        if (!vaultTemplate) throw new Error("Vault template not found");
        const data = await callAIBuild({
          step: "templatize-script",
          topic,
          vault_template: vaultTemplate,
          language: scriptLanguage,
        });
        setGeneratedScript(data);
        advanceTo(5);
      } catch (e: any) {
        toast.error(e.message || tr({ en: "Error generating script from template", es: "Error al generar el script desde plantilla" }, language));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Default mode — require hook template
    if (!selectedHookCategory || !selectedTemplate) {
      toast.error(tr({ en: "Please select a hook template first.", es: "Selecciona una plantilla de hook primero." }, language));
      return;
    }
    setLoading(true);
    try {
      const lengthMap = ["short", "medium", "long"];
      const chosenFacts = selectedFacts.map((i) => facts[i]).filter(Boolean);
      const data = await callAIBuild({
        step: "generate-script",
        topic,
        selectedFacts: chosenFacts,
        hookCategory: selectedHookCategory,
        hookTemplate: selectedTemplate,
        structure: "Hook → Story → CTA",
        formato: selectedFormat || "talking_head",
        length: lengthMap[scriptLength],
        language: scriptLanguage,
      });
      setGeneratedScript(data);
      advanceTo(5);
    } catch (e: any) {
      toast.error(e.message || tr({ en: "Error generating script", es: "Error al generar el script" }, language));
    } finally {
      setLoading(false);
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
      toast.error(e.message || tr({ en: "Error refining script", es: "Error al refinar el script" }, language));
    } finally {
      setRefining(false);
    }
  };

  const handleTranslate = async (targetLang: "en" | "es") => {
    if (!generatedScript || translating || targetLang === scriptLanguage) return;
    setTranslating(true);
    try {
      const data = await callAIBuild({
        step: "translate-script",
        currentScript: generatedScript,
        targetLanguage: targetLang,
      });
      setGeneratedScript(data);
      setScriptLanguage(targetLang);
      toast.success(targetLang === "en"
        ? tr({ en: "Translated to English!", es: "¡Traducido al inglés!" }, language)
        : tr({ en: "Translated to Spanish!", es: "¡Traducido al español!" }, language)
      );
    } catch (e: any) {
      toast.error(e.message || tr({ en: "Error translating script", es: "Error al traducir el script" }, language));
    } finally {
      setTranslating(false);
    }
  };

  const handleRegenerateLength = async () => {
    if (!generatedScript || loading) return;
    setLoading(true);
    try {
      let data;
      if (structureMode === "vault" && selectedVaultTemplateId) {
        const vaultTemplate = vaultTemplates.find((t) => t.id === selectedVaultTemplateId);
        if (!vaultTemplate) throw new Error("Vault template not found");
        data = await callAIBuild({
          step: "templatize-script",
          topic,
          vault_template: vaultTemplate,
          language: scriptLanguage,
        });
      } else {
        const lengthMap = ["short", "medium", "long"];
        const chosenFacts = selectedFacts.map((i) => facts[i]).filter(Boolean);
        data = await callAIBuild({
          step: "generate-script",
          topic,
          selectedFacts: chosenFacts,
          hookCategory: selectedHookCategory,
          hookTemplate: selectedTemplate,
          structure: "Hook → Story → CTA",
          formato: selectedFormat || "talking_head",
          length: lengthMap[scriptLength],
          language: scriptLanguage,
        });
      }
      setGeneratedScript(data);
      toast.success(tr({ en: "Script regenerated!", es: "¡Script regenerado!" }, language));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedScript?.lines || saving) return;
    setSaving(true);
    try {
      // Validate and normalize lines before saving
      const rawLines = generatedScript.lines;
      if (!Array.isArray(rawLines) || rawLines.length === 0) {
        console.error("[AIScriptWizard] handleSave: lines is empty or not an array:", rawLines);
        toast.error(tr({ en: "Script has no lines to save.", es: "El script no tiene líneas para guardar." }, language));
        return;
      }

      // Normalize each line to ensure correct ScriptLine shape
      const validLineTypes = ["filming", "actor", "editor"] as const;
      const validSections = ["hook", "body", "cta"] as const;
      const normalizedLines: ScriptLine[] = rawLines.map((l: any, i: number) => {
        const lineType = validLineTypes.includes(l.line_type) ? l.line_type : "actor";
        const section = validSections.includes(l.section) ? l.section : "body";
        const text = typeof l.text === "string" ? l.text.trim() : String(l.text || "");
        if (!validLineTypes.includes(l.line_type) || !validSections.includes(l.section)) {
          console.warn(`[AIScriptWizard] Line ${i} had invalid type/section, normalized:`, l, "→", { line_type: lineType, section, text });
        }
        return { line_type: lineType, section, text };
      });

      // Strict validation: ensure title is not empty
      let ideaGanadora = (generatedScript.idea_ganadora || topic || "").trim();
      if (!ideaGanadora) {
        ideaGanadora = "Script";
      }
      const target = (generatedScript.target || "").trim();
      const formato = generatedScript.formato || selectedFormat || "";
      const viralityScore = generatedScript.virality_score;

      console.log("[AIScriptWizard] Saving script:", {
        linesCount: normalizedLines.length,
        idea_ganadora: ideaGanadora,
        idea_ganadora_empty: !ideaGanadora,
        target,
        formato,
        virality_score: viralityScore,
        firstLine: normalizedLines[0],
      });

      await onComplete({
        lines: normalizedLines,
        idea_ganadora: ideaGanadora,
        target,
        formato,
        virality_score: viralityScore,
      });
    } catch (e: any) {
      console.error("[AIScriptWizard] handleSave error:", e);
      toast.error(e.message || tr({ en: "Error saving script", es: "Error al guardar el script" }, language));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyScript = () => {
    if (!generatedScript?.lines) return;
    const text = generatedScript.lines
      .map((l: any) => `[${l.section?.toUpperCase() || "BODY"} - ${l.line_type?.toUpperCase()}]\n${l.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(tr({ en: "Copied to clipboard!", es: "¡Copiado al portapapeles!" }, language));
  };

  const toggleFact = (idx: number) => {
    setSelectedFacts((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const restart = () => {
    setCurrentStep(1);
    setMaxUnlockedStep(1);
    setTopic("");
    setFacts([]);
    setSelectedFacts([]);
    setSelectedHookCategory(null);
    setSelectedTemplate(null);
    setExpandedHookCategory(null);
    setSelectedFormat(null);
    setSelectedVaultTemplateId(null);
    setStructureMode("default");
    setGeneratedScript(null);
    setFeedbackText("");
  };

  // ==================== STEP CONTENT ====================
  const renderStep1 = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2 pb-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
          <Search className="w-3.5 h-3.5" />
          {tr({ en: "Step 1 of 5", es: "Paso 1 de 5" }, language)}
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          {tr({ en: "What's your video topic?", es: "¿Cuál es el tema de tu video?" }, language)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr({ en: "Enter a topic and AI will research 5 viral facts for you.", es: "Ingresa un tema y la IA investigará 5 datos virales para ti." }, language)}
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" />
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={tr({
              en: "e.g. Benefits of cold showers, How to grow on TikTok...",
              es: "ej. Beneficios de las duchas frías, Cómo crecer en TikTok...",
            }, language)}
            className="pl-12 pr-4 py-4 text-base bg-card border-border/60 focus:border-primary/60 rounded-xl h-14"
            onKeyDown={(e) => { if (e.key === "Enter") handleResearch(); }}
          />
        </div>

        <Button
          onClick={handleResearch}
          disabled={loading || !topic.trim()}
          className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 gap-3 transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {tr({ en: "Researching topic...", es: "Investigando el tema..." }, language)}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              {tr({ en: "Research & Generate Facts", es: "Investigar y Generar Datos" }, language)}
              <ArrowRight className="w-5 h-5 ml-auto" />
            </>
          )}
        </Button>
      </div>

      {/* Loading animation */}
      {loading && (
        <div className="bg-card/50 border border-primary/20 rounded-2xl p-6 text-center space-y-3">
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {tr({ en: "AI is scanning for viral data...", es: "La IA está buscando datos virales..." }, language)}
          </p>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2 pb-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
          <Zap className="w-3.5 h-3.5" />
          {tr({ en: "Step 2 of 5", es: "Paso 2 de 5" }, language)}
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          {tr({ en: "Select your best facts", es: "Selecciona tus mejores datos" }, language)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr({ en: "Top 3 selected by impact score. Toggle any to include/exclude.", es: "Los 3 mejores seleccionados por impacto. Activa/desactiva para incluir/excluir." }, language)}
        </p>
      </div>

      {/* Topic recap */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
        <Search className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm text-foreground font-medium">{topic}</span>
        <button
          onClick={() => { setCurrentStep(1); }}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          {tr({ en: "Change", es: "Cambiar" }, language)}
        </button>
      </div>

      {/* Facts list */}
      <div className="space-y-3">
        {facts.map((f, i) => {
          const isSelected = selectedFacts.includes(i);
          return (
            <button
              key={i}
              onClick={() => toggleFact(i)}
              className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 group ${
                isSelected
                  ? "bg-primary/10 border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                  : "bg-card border-border/60 hover:border-primary/30 hover:bg-card/80"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
                }`}>
                  {isSelected ? <Check className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-relaxed ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                    {f.fact}
                  </p>
                </div>
                <div className={`flex-shrink-0 flex flex-col items-center gap-0.5 ${
                  f.impact_score >= 8 ? "text-green-400" : f.impact_score >= 6 ? "text-amber-400" : "text-red-400"
                }`}>
                  <span className="text-lg font-bold leading-none">{f.impact_score}</span>
                  <span className="text-[10px] font-medium opacity-70">/ 10</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {selectedFacts.length} {tr({ en: "facts selected", es: "datos seleccionados" }, language)}
        </span>
        <Button
          onClick={() => advanceTo(3)}
          className="gap-2 bg-primary hover:bg-primary/90 rounded-xl px-6"
        >
          {tr({ en: "Next: Choose Hook", es: "Siguiente: Elegir Hook" }, language)}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2 pb-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
          <Wand2 className="w-3.5 h-3.5" />
          {tr({ en: "Step 3 of 5", es: "Paso 3 de 5" }, language)}
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          {tr({ en: "Pick your hook style", es: "Elige el estilo de tu hook" }, language)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr({ en: "The first line that stops the scroll. Select a category, then a template.", es: "La primera línea que detiene el scroll. Elige una categoría y luego una plantilla." }, language)}
        </p>
      </div>

      {/* Hook category grid */}
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(HOOK_FORMATS).map(([key, cat]) => {
          const Icon = cat.icon;
          const isExpanded = expandedHookCategory === key;
          const isCategorySelected = selectedHookCategory === key;

          return (
            <div
              key={key}
              className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                isCategorySelected
                  ? `bg-gradient-to-br ${cat.activeColor}`
                  : `bg-gradient-to-br ${cat.color} hover:opacity-90`
              }`}
            >
              {/* Category header */}
              <button
                onClick={() => setExpandedHookCategory(isExpanded ? null : key)}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                <div className={`w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{tr(cat.label, language)}</span>
                    {isCategorySelected && selectedTemplate && (
                      <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full font-medium">
                        {tr({ en: "Selected", es: "Seleccionado" }, language)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs opacity-60 truncate block">
                    {cat.templates.length} {tr({ en: "templates", es: "plantillas" }, language)}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 opacity-60 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 opacity-60 flex-shrink-0" />
                )}
              </button>

              {/* Templates */}
              {isExpanded && (
                <div className="px-4 pb-4 grid gap-2">
                  {cat.templates.map((tpl, i) => {
                    const isSelected = selectedHookCategory === key && selectedTemplate === tpl;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedHookCategory(key);
                          setSelectedTemplate(tpl);
                        }}
                        className={`text-left p-3 rounded-xl text-xs leading-relaxed transition-all border ${
                          isSelected
                            ? "bg-black/30 border-white/30 text-white font-medium"
                            : "bg-black/10 border-transparent hover:bg-black/20 text-white/70 hover:text-white"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-[10px] font-bold ${
                            isSelected ? "bg-white text-black" : "bg-white/20 text-white/60"
                          }`}>
                            {isSelected ? <Check className="w-3 h-3" /> : i + 1}
                          </span>
                          <span className="italic">"{tpl}"</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selection summary + next */}
      {selectedHookCategory && selectedTemplate && (
        <div className="sticky bottom-4 bg-card/95 backdrop-blur border border-primary/20 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">
                {tr(HOOK_FORMATS[selectedHookCategory as keyof typeof HOOK_FORMATS]?.label, language)}
              </p>
              <p className="text-sm text-foreground italic truncate">"{selectedTemplate}"</p>
            </div>
          </div>
          <Button
            onClick={() => advanceTo(4)}
            className="w-full gap-2 bg-primary hover:bg-primary/90 rounded-xl"
          >
            {tr({ en: "Next: Choose Style", es: "Siguiente: Elegir Estilo" }, language)}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {!selectedHookCategory && (
        <p className="text-center text-xs text-muted-foreground">
          {tr({ en: "Expand a category above to choose a hook template.", es: "Expande una categoría para elegir una plantilla de hook." }, language)}
        </p>
      )}
    </div>
  );

  const renderStep4 = () => {
    const isDefaultMode = structureMode === "default";
    const isVaultMode = structureMode === "vault";
    const selectedVaultTemplate = vaultTemplates.find((t) => t.id === selectedVaultTemplateId) || null;

    // For default mode: require a format. For vault mode: require a vault template selection.
    const canGenerate = isVaultMode ? !!selectedVaultTemplateId : !!selectedFormat;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2 pb-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
            <Film className="w-3.5 h-3.5" />
            {tr({ en: "Step 4 of 5", es: "Paso 4 de 5" }, language)}
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            {tr({ en: "Choose your video style", es: "Elige el estilo de tu video" }, language)}
          </h2>
          <p className="text-muted-foreground text-sm">
            {tr({ en: "This shapes how the script is structured and written.", es: "Esto determina cómo se estructura y escribe el script." }, language)}
          </p>
        </div>

        {/* Structure Mode Toggle */}
        <div className="flex gap-2 p-1 rounded-xl bg-muted/50 border border-border/60">
          <button
            onClick={() => setStructureMode("default")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              isDefaultMode
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {tr({ en: "Default Structure", es: "Estructura por Defecto" }, language)}
          </button>
          <button
            onClick={() => setStructureMode("vault")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              isVaultMode
                ? "bg-amber-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Archive className="w-4 h-4" />
            {tr({ en: "Vault Template", es: "Plantilla del Vault" }, language)}
          </button>
        </div>

        {/* DEFAULT MODE: Format cards */}
        {isDefaultMode && (
          <div className="grid grid-cols-2 gap-3">
            {SCRIPT_FORMATS.map((fmt) => {
              const Icon = fmt.icon;
              const isSelected = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`text-left p-5 rounded-2xl border transition-all duration-200 bg-gradient-to-br ${
                    isSelected ? fmt.activeColor : fmt.color
                  } hover:opacity-90`}
                >
                  <div className="space-y-3">
                    <div className={`w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${fmt.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{fmt.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{tr(fmt.description, language)}</p>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1.5 text-primary text-xs font-medium">
                        <Check className="w-3.5 h-3.5" />
                        {tr({ en: "Selected", es: "Seleccionado" }, language)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* VAULT MODE: Vault template selection */}
        {isVaultMode && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-400">
              <Archive className="w-4 h-4" />
              {tr({ en: "Select a Vault Template", es: "Selecciona una Plantilla del Vault" }, language)}
            </div>

            {vaultTemplatesLoading ? (
              <div className="flex items-center justify-center gap-3 p-8 rounded-2xl border border-border/60 bg-card/50">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {tr({ en: "Loading vault templates...", es: "Cargando plantillas del vault..." }, language)}
                </span>
              </div>
            ) : vaultTemplates.length === 0 ? (
              <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-center space-y-2">
                <Archive className="w-8 h-8 text-amber-400/50 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {tr({ en: "No Vault templates found for this client.", es: "No se encontraron plantillas del Vault para este cliente." }, language)}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {tr({ en: "Add templates in the Vault section first.", es: "Agrega plantillas en la sección Vault primero." }, language)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {vaultTemplates.map((tpl) => {
                  const isSelected = selectedVaultTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedVaultTemplateId(isSelected ? null : tpl.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                        isSelected
                          ? "bg-amber-500/15 border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]"
                          : "bg-card border-border/60 hover:border-amber-500/30 hover:bg-amber-500/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          isSelected ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground border border-border"
                        }`}>
                          {isSelected ? <Check className="w-4 h-4" /> : <Archive className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                            {tpl.name}
                          </p>
                          {tpl.structure_analysis && (
                            <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">
                              {(tpl.structure_analysis as any).hook_type || ""}{(tpl.structure_analysis as any).hook_type && (tpl.structure_analysis as any).body_pattern ? " · " : ""}{(tpl.structure_analysis as any).body_pattern || ""}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground/50 mt-0.5">
                            {tpl.template_lines?.length || 0} {tr({ en: "lines", es: "líneas" }, language)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedVaultTemplate && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                <span className="font-medium">{tr({ en: "Using template:", es: "Usando plantilla:" }, language)}</span>{" "}
                {selectedVaultTemplate.name} — {tr({ en: "AI will follow this exact structure with your topic.", es: "La IA seguirá esta estructura exacta con tu tema." }, language)}
              </div>
            )}
          </div>
        )}

        {/* Language + Length controls (only for default mode) */}
        {isDefaultMode && (
          <div className="space-y-4 p-4 rounded-2xl bg-card/50 border border-border/60">
            {/* Language */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Languages className="w-4 h-4 text-primary" />
                {tr({ en: "Script Language", es: "Idioma del Script" }, language)}
              </label>
              <div className="flex gap-2">
                {(["en", "es"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setScriptLanguage(lang)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      scriptLanguage === lang
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 bg-card"
                    }`}
                  >
                    {lang === "en" ? "English" : "Español"}
                  </button>
                ))}
              </div>
            </div>

            {/* Length */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center justify-between">
                <span>{tr({ en: "Script Length", es: "Duración del Script" }, language)}</span>
                <span className="text-primary text-xs font-semibold">{lengthLabels[scriptLength]}</span>
              </label>
              <Slider
                value={[scriptLength]}
                onValueChange={(v) => setScriptLength(v[0])}
                min={0}
                max={2}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {lengthLabels.map((l) => <span key={l}>{l}</span>)}
              </div>
            </div>
          </div>
        )}

        {/* Language selector for vault mode */}
        {isVaultMode && (
          <div className="p-4 rounded-2xl bg-card/50 border border-border/60">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Languages className="w-4 h-4 text-primary" />
                {tr({ en: "Script Language", es: "Idioma del Script" }, language)}
              </label>
              <div className="flex gap-2">
                {(["en", "es"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setScriptLanguage(lang)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      scriptLanguage === lang
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 bg-card"
                    }`}
                  >
                    {lang === "en" ? "English" : "Español"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Generate button */}
        <Button
          onClick={handleGenerateScript}
          disabled={loading || !canGenerate}
          className="w-full h-14 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 gap-3 transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {tr({ en: "Generating script...", es: "Generando script..." }, language)}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              {isVaultMode
                ? tr({ en: "Generate from Template", es: "Generar desde Plantilla" }, language)
                : tr({ en: "Generate Script", es: "Generar Script" }, language)
              }
              <ArrowRight className="w-5 h-5 ml-auto" />
            </>
          )}
        </Button>

        {!canGenerate && (
          <p className="text-center text-xs text-muted-foreground">
            {isVaultMode
              ? tr({ en: "Select a Vault template above to continue.", es: "Selecciona una plantilla del Vault para continuar." }, language)
              : tr({ en: "Select a video style above to continue.", es: "Selecciona un estilo de video para continuar." }, language)
            }
          </p>
        )}

        {/* Loading progress */}
        {loading && (
          <div className="bg-card/50 border border-primary/20 rounded-2xl p-6 text-center space-y-4">
            <div className="flex justify-center gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-primary/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {isVaultMode
                  ? tr({ en: "Applying vault template...", es: "Aplicando plantilla del vault..." }, language)
                  : tr({ en: "Building your script...", es: "Construyendo tu script..." }, language)
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {tr({ en: "AI is writing hook, body and CTA...", es: "La IA está escribiendo hook, cuerpo y CTA..." }, language)}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStep5 = () => {
    if (!generatedScript) return (
      <div className="max-w-2xl mx-auto text-center py-12 space-y-4">
        <p className="text-muted-foreground">
          {tr({ en: "No script generated yet.", es: "Aún no hay script generado." }, language)}
        </p>
        <Button onClick={() => advanceTo(4)} variant="outline" className="gap-2">
          <ArrowRight className="w-4 h-4 rotate-180" />
          {tr({ en: "Go back to Style", es: "Volver al Estilo" }, language)}
        </Button>
      </div>
    );

    const lineTypeConfig: Record<string, { label: string; icon: any; bg: string; border: string; badge: string; iconColor: string }> = {
      filming: {
        label: tr({ en: "FILMING", es: "FILMACIÓN" }, language),
        icon: Film,
        bg: "bg-gradient-to-br from-red-500/15 to-red-900/5",
        border: "border-red-500/30",
        badge: "bg-red-500/20 text-red-400",
        iconColor: "text-red-400",
      },
      actor: {
        label: tr({ en: "VOICEOVER", es: "VOICEOVER" }, language),
        icon: Mic,
        bg: "bg-gradient-to-br from-purple-500/15 to-purple-900/5",
        border: "border-purple-500/30",
        badge: "bg-purple-500/20 text-purple-400",
        iconColor: "text-purple-400",
      },
      editor: {
        label: tr({ en: "EDITOR", es: "EDITOR" }, language),
        icon: Scissors,
        bg: "bg-gradient-to-br from-emerald-500/15 to-emerald-900/5",
        border: "border-emerald-500/30",
        badge: "bg-emerald-500/20 text-emerald-400",
        iconColor: "text-emerald-400",
      },
    };

    const sectionBadge: Record<string, string> = {
      hook: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      body: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      cta: "bg-green-500/20 text-green-400 border-green-500/30",
    };

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-primary/60 bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
              <AlignLeft className="w-3.5 h-3.5" />
              {tr({ en: "Step 5 of 5 — Your Script", es: "Paso 5 de 5 — Tu Script" }, language)}
            </div>
            {generatedScript.idea_ganadora && (
              <h2 className="text-xl font-bold text-foreground">{generatedScript.idea_ganadora}</h2>
            )}
            {generatedScript.target && (
              <p className="text-sm text-muted-foreground">{tr({ en: "Target:", es: "Target:" }, language)} {generatedScript.target}</p>
            )}
          </div>

          {/* Virality Score */}
          {generatedScript.virality_score != null && (
            <div className={`flex-shrink-0 flex flex-col items-center gap-0.5 p-3 rounded-2xl border ${viralityBg(generatedScript.virality_score)}`}>
              <span className={`text-2xl font-black leading-none ${viralityColor(generatedScript.virality_score)}`}>
                {Math.round(generatedScript.virality_score * 10) / 10}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {tr({ en: "Virality", es: "Viralidad" }, language)}
              </span>
            </div>
          )}
        </div>

        {/* Script lines by section */}
        {["hook", "body", "cta"].map((section) => {
          const sectionLines = (generatedScript.lines || []).filter((l: any) => l.section === section);
          if (sectionLines.length === 0) return null;
          const sectionLabels: Record<string, { en: string; es: string }> = {
            hook: { en: "HOOK", es: "HOOK" },
            body: { en: "BODY", es: "CUERPO" },
            cta: { en: "CALL TO ACTION", es: "LLAMADO A LA ACCIÓN" },
          };
          return (
            <div key={section} className="space-y-2">
              <div className={`inline-flex items-center gap-2 text-xs font-bold tracking-widest px-3 py-1 rounded-full border ${sectionBadge[section]}`}>
                {tr(sectionLabels[section], language)}
              </div>
              <div className="space-y-2">
                {sectionLines.map((line: any, i: number) => {
                  const cfg = lineTypeConfig[line.line_type] || lineTypeConfig.actor;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-4 rounded-2xl border ${cfg.bg} ${cfg.border}`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center mt-0.5`}>
                        <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <p className="text-sm text-foreground leading-relaxed mt-1.5">{line.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Inline controls bar */}
        <div className="sticky bottom-4 bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-xl overflow-hidden">
          {/* Length control */}
          <div className="px-4 pt-4 pb-3 border-b border-border/60">
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {tr({ en: "LENGTH", es: "DURACIÓN" }, language)}
              </label>
              <div className="flex-1">
                <Slider
                  value={[scriptLength]}
                  onValueChange={(v) => setScriptLength(v[0])}
                  min={0}
                  max={2}
                  step={1}
                  className="w-full"
                />
              </div>
              <span className="text-xs text-primary font-bold whitespace-nowrap">{lengthLabels[scriptLength]}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateLength}
                disabled={loading}
                className="gap-1.5 text-xs h-7 px-3 rounded-lg flex-shrink-0"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {tr({ en: "Regen", es: "Regen" }, language)}
              </Button>
            </div>
          </div>

          {/* Actions row */}
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
            {/* Refine input */}
            <div className="flex-1 min-w-[200px] flex gap-2">
              <Input
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={tr({ en: "Refine: e.g. more aggressive CTA...", es: "Refinar: ej. CTA más agresivo..." }, language)}
                className="h-8 text-xs rounded-lg flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") handleRefine(); }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefine}
                disabled={refining || !feedbackText.trim()}
                className="h-8 px-3 gap-1.5 text-xs rounded-lg flex-shrink-0"
              >
                {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {tr({ en: "Refine", es: "Refinar" }, language)}
              </Button>
            </div>

            {/* Translate */}
            <div className="flex gap-1">
              {(["en", "es"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleTranslate(lang)}
                  disabled={translating || lang === scriptLanguage}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all border ${
                    lang === scriptLanguage
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground bg-card"
                  }`}
                >
                  {translating && lang !== scriptLanguage ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    lang.toUpperCase()
                  )}
                </button>
              ))}
            </div>

            {/* Copy */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyScript}
              className="h-8 px-3 gap-1.5 text-xs rounded-lg flex-shrink-0"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? tr({ en: "Copied!", es: "¡Copiado!" }, language) : tr({ en: "Copy", es: "Copiar" }, language)}
            </Button>

            {/* Restart */}
            <Button
              variant="ghost"
              size="sm"
              onClick={restart}
              className="h-8 px-3 gap-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              {tr({ en: "Restart", es: "Reiniciar" }, language)}
            </Button>
          </div>

          {/* Save CTA */}
          <div className="px-4 pb-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tr({ en: "Saving script...", es: "Guardando script..." }, language)}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {tr({ en: "Save Script", es: "Guardar Script" }, language)}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== MAIN RENDER ====================
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-background via-primary/5 to-background border-b border-border/60">
        {/* Decorative glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-primary/5 rounded-full blur-2xl" />
        </div>

        <div className="relative px-4 sm:px-6 py-6">
          {/* Hero title - simplified */}
          <div className="text-center mb-4">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {tr({ en: "Let AI Build Your Script", es: "Construye tu Script con IA" }, language)}
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              {tr({
                en: "Research → Hook → Style → Script. Professional quality in minutes.",
                es: "Research → Hook → Estilo → Script. Calidad profesional en minutos.",
              }, language)}
            </p>
          </div>

          {/* Step navigation bar */}
          <div className="flex items-center justify-center overflow-x-auto pb-1 scrollbar-none">
            <div className="flex items-center gap-1">
              {STEPS.map(({ num, icon: Icon, label }, idx) => {
                const isActive = currentStep === num;
                const isComplete = num < currentStep;
                const isLocked = num > maxUnlockedStep;

                return (
                  <div key={num} className="flex items-center">
                    <button
                      onClick={() => jumpTo(num)}
                      disabled={isLocked}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                          : isComplete
                            ? "bg-primary/15 text-primary hover:bg-primary/25 cursor-pointer"
                            : isLocked
                              ? "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                              : "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                      }`}
                    >
                      {isComplete ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{tr(label, language)}</span>
                      <span className="sm:hidden">{num}</span>
                    </button>

                    {idx < STEPS.length - 1 && (
                      <div className={`w-4 sm:w-6 h-px mx-1 transition-colors ${
                        num < currentStep ? "bg-primary/40" : "bg-border/60"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="px-4 sm:px-6 py-8">
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}
      </div>
    </div>
  );
}

// Default export for backward compatibility
export default AIScriptWizard;
