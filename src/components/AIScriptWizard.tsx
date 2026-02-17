import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, ArrowLeft, ArrowRight, Wand2, RotateCcw, Save, Search, Zap, BookOpen, Shuffle, Crown, GitCompare, MessageSquare } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
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
  onComplete: (rawContent: string, title: string) => Promise<void> | void;
  onCancel: () => void;
}

export default function AIScriptWizard({ selectedClient, onComplete, onCancel }: AIScriptWizardProps) {
  const { language } = useLanguage();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Topic
  const [topic, setTopic] = useState("");

  // Step 2: Research
  const [facts, setFacts] = useState<Fact[]>([]);

  // Step 3: Hook format
  const [selectedHookCategory, setSelectedHookCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Step 4: Generated hook
  const [generatedHook, setGeneratedHook] = useState("");

  // Step 5: Script structure
  const [selectedStructure, setSelectedStructure] = useState<string | null>(null);

  // Step 6: Final script
  const [scriptLength, setScriptLength] = useState(1); // 0=short, 1=medium, 2=long
  const [selectedFacts, setSelectedFacts] = useState<number[]>([]);
  const [generatedScript, setGeneratedScript] = useState<any>(null);

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
      setFacts(data.facts || []);
      setSelectedFacts(data.facts?.map((_: any, i: number) => i) || []);
      setStep(2);
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
      });
      setGeneratedHook(data.hook || "");
      setStep(4);
    } catch (e: any) {
      toast.error(e.message || "Error generating hook");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!selectedStructure) return;
    setLoading(true);
    try {
      const lengthMap = ["short", "medium", "long"];
      const chosenFacts = selectedFacts.map((i) => facts[i]).filter(Boolean);
      const data = await callAIBuild({
        step: "generate-script",
        topic,
        selectedFacts: chosenFacts,
        hook: generatedHook,
        structure: selectedStructure,
        length: lengthMap[scriptLength],
      });
      setGeneratedScript(data);
      setStep(6);
    } catch (e: any) {
      toast.error(e.message || "Error generating script");
    } finally {
      setLoading(false);
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!generatedScript?.lines || saving) return;
    setSaving(true);
    try {
      const rawContent = generatedScript.lines.map((l: any) => l.text).join("\n");
      const title = generatedScript.idea_ganadora || topic;
      await onComplete(rawContent, title);
    } finally {
      setSaving(false);
    }
  };

  const toggleFact = (idx: number) => {
    setSelectedFacts((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-smooth ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* ===== STEP 1: Topic ===== */}
      {step === 1 && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="w-5 h-5 text-primary" />
              {tr({ en: "What's your topic or idea?", es: "¿Cuál es tu tema o idea?" }, language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={tr({ en: "e.g. Benefits of cold showers, How to grow on TikTok...", es: "ej. Beneficios de las duchas frías, Cómo crecer en TikTok..." }, language)}
              className="text-base"
              onKeyDown={(e) => { if (e.key === "Enter") handleResearch(); }}
            />
            <Button onClick={handleResearch} disabled={loading || !topic.trim()} variant="cta" className="gap-2 w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? tr({ en: "Researching...", es: "Investigando..." }, language) : tr({ en: "Research Topic", es: "Investigar Tema" }, language)}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== STEP 2: Deep Research ===== */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {tr({ en: "Deep Research", es: "Investigación Profunda" }, language)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {tr({ en: "Here are the most impactful facts we found about your topic:", es: "Estos son los datos más impactantes que encontramos sobre tu tema:" }, language)}
          </p>
          <div className="grid gap-3">
            {facts.map((f, i) => (
              <Card key={i} className="border-primary/10 hover:border-primary/30 transition-smooth">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold bg-primary/20 text-primary px-2 py-1 rounded-full flex-shrink-0">
                      {f.impact_score}/10
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{f.fact}</p>
                      <p className="text-xs text-muted-foreground mt-1">{f.why_shocking}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {tr({ en: "Back", es: "Atrás" }, language)}
            </Button>
            <Button variant="cta" onClick={() => setStep(3)} className="gap-2 flex-1">
              {tr({ en: "Next: Choose Hook", es: "Siguiente: Elegir Hook" }, language)} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP 3: Choose Hook Format ===== */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            {tr({ en: "Choose Hook Format", es: "Elige el Formato de Hook" }, language)}
          </h3>
          <div className="grid gap-4">
            {Object.entries(HOOK_FORMATS).map(([key, cat]) => {
              const Icon = cat.icon;
              const isSelected = selectedHookCategory === key;
              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-smooth ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => { setSelectedHookCategory(key); setSelectedTemplate(null); }}
                >
                  <CardHeader className="pb-2">
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
                          className={`w-full text-left p-3 rounded-xl text-xs transition-smooth border ${
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
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {tr({ en: "Back", es: "Atrás" }, language)}
            </Button>
            <Button
              variant="cta"
              onClick={handleGenerateHook}
              disabled={loading || !selectedTemplate}
              className="gap-2 flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? tr({ en: "Generating...", es: "Generando..." }, language) : tr({ en: "Generate Hook", es: "Generar Hook" }, language)}
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP 4: Generated Hook ===== */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {tr({ en: "Your Generated Hook", es: "Tu Hook Generado" }, language)}
          </h3>
          <Card className="border-primary/20">
            <CardContent className="p-6">
              <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">{generatedHook}</p>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {tr({ en: "Back", es: "Atrás" }, language)}
            </Button>
            <Button variant="outline" onClick={handleGenerateHook} disabled={loading} className="gap-2">
              <RotateCcw className="w-4 h-4" /> {tr({ en: "Regenerate", es: "Regenerar" }, language)}
            </Button>
            <Button variant="cta" onClick={() => setStep(5)} className="gap-2 flex-1">
              {tr({ en: "Next: Script Structure", es: "Siguiente: Estructura" }, language)} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP 5: Choose Script Structure ===== */}
      {step === 5 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            {tr({ en: "Choose Script Structure", es: "Elige la Estructura del Script" }, language)}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {SCRIPT_STRUCTURES.map((s) => {
              const Icon = s.icon;
              const isSelected = selectedStructure === s.key;
              return (
                <Card
                  key={s.key}
                  className={`cursor-pointer transition-smooth ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setSelectedStructure(s.key)}
                >
                  <CardContent className="p-4 text-center space-y-2">
                    <Icon className={`w-6 h-6 mx-auto ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {tr(structureNames[s.key], language)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tr(structureDescriptions[s.key], language)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Length & Fact selection */}
          <Card className="border-border">
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  {tr({ en: "Script Length", es: "Duración del Script" }, language)}: <span className="text-primary">{lengthLabels[scriptLength]}</span>
                </label>
                <Slider
                  value={[scriptLength]}
                  onValueChange={(v) => setScriptLength(v[0])}
                  min={0}
                  max={2}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  {lengthLabels.map((l) => <span key={l}>{l}</span>)}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  {tr({ en: "Include these research facts:", es: "Incluir estos datos de investigación:" }, language)}
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {facts.map((f, i) => (
                    <label key={i} className="flex items-start gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={selectedFacts.includes(i)}
                        onCheckedChange={() => toggleFact(i)}
                        className="mt-0.5"
                      />
                      <span className={selectedFacts.includes(i) ? "text-foreground" : "text-muted-foreground"}>
                        {f.fact}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(4)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {tr({ en: "Back", es: "Atrás" }, language)}
            </Button>
            <Button
              variant="cta"
              onClick={handleGenerateScript}
              disabled={loading || !selectedStructure}
              className="gap-2 flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? tr({ en: "Generating Script...", es: "Generando Script..." }, language) : tr({ en: "Generate Script", es: "Generar Script" }, language)}
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP 6: Final Script ===== */}
      {step === 6 && generatedScript && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {tr({ en: "Your AI-Generated Script", es: "Tu Script Generado por IA" }, language)}
          </h3>

          {/* Script preview — dialogue only */}
          <Card className="border-primary/20">
            <CardContent className="p-4 space-y-2">
              {generatedScript.lines?.filter((line: any) => line.line_type === "actor").map((line: any, i: number) => {
                const sectionBadge: Record<string, string> = {
                  hook: "bg-amber-500/20 text-amber-400",
                  body: "bg-blue-500/20 text-blue-400",
                  cta: "bg-green-500/20 text-green-400",
                };
                return (
                  <div key={i} className="p-3 rounded-xl border border-purple-500/40 bg-purple-500/10">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${sectionBadge[line.section] || ""}`}>
                        {line.section}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{line.text}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Filters for regeneration */}
          <Card className="border-border">
            <CardContent className="p-4 space-y-4">
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
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {facts.map((f, i) => (
                    <label key={i} className="flex items-start gap-2 cursor-pointer text-sm">
                      <Checkbox checked={selectedFacts.includes(i)} onCheckedChange={() => toggleFact(i)} className="mt-0.5" />
                      <span className={selectedFacts.includes(i) ? "text-foreground" : "text-muted-foreground"}>{f.fact}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button variant="outline" onClick={handleGenerateScript} disabled={loading} className="gap-2 w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {tr({ en: "Regenerate with changes", es: "Regenerar con cambios" }, language)}
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(5)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {tr({ en: "Back", es: "Atrás" }, language)}
            </Button>
            <Button variant="cta" onClick={handleSave} disabled={saving} className="gap-2 flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? tr({ en: "Saving...", es: "Guardando..." }, language) : tr({ en: "Save Script", es: "Guardar Script" }, language)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
