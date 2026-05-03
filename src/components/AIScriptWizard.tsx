import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, Sparkles, Wand2, RotateCcw, Search, Zap, BookOpen,
  Shuffle, Crown, GitCompare, MessageSquare, Check, ArrowRight,
  Languages, Send, Copy, ChevronDown, ChevronUp, Film, Mic, Scissors,
  X, RefreshCw, AlignLeft, Video, Users, Grid3X3, Archive, MonitorPlay,
  Music, Rows3, LayoutList, Eye, ArrowLeftRight, ShieldX, BookText, Camera, List,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { tr } from "@/i18n/translations";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import BorderGlow from "@/components/ui/BorderGlow";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/lib/getAuthToken";
import { toast } from "sonner";
import type { Client } from "@/hooks/useClients";
import type { ScriptLine } from "@/hooks/useScripts";
import { VIRAL_HOOK_FORMULAS, HOOK_CATEGORY_META, type HookFormula, type HookCategory } from "@/data/viralHookFormulas";

// ==================== VAULT TEMPLATE TYPE ====================
type VaultTemplate = {
  id: string;
  name: string;
  template_lines: Array<{ line_type: string; section: string; text: string }>;
  structure_analysis?: Record<string, any>;
  source_url?: string | null;
};

// ==================== REMIX HELPERS ====================
type FormatDetection = {
  format: "TALKING_HEAD" | "VOICEOVER" | "TEXT_STORY" | "CAPTION_VIDEO_MUSIC";
  confidence: number;
  wizard_config: {
    suggested_format?: string;
    prompt_hint?: string;
    use_transcript_as_template?: boolean;
  };
};

type RemixVideo = {
  id: string;
  url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  channel_username: string;
  platform: string;
  formatDetection?: FormatDetection | null;
};

// Icon map for hook categories — maps string names from HOOK_CATEGORY_META to Lucide components
const HOOK_ICON_MAP: Record<string, any> = {
  BookOpen, ArrowLeftRight, ShieldX, BookText, Shuffle, Crown, Camera,
};

// ==================== SCRIPT FORMATS ====================
const SCRIPT_FORMATS = [
  {
    id: "talking_head",
    icon: Mic,
    label: "TALKING HEAD",
    description: { en: "Direct-to-camera monologue", es: "Monólogo directo a cámara" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)]",
    iconColor: "text-[#22d3ee]",
  },
  {
    id: "broll_caption",
    icon: Video,
    label: "B-ROLL CAPTION",
    description: { en: "Voiceover with B-roll footage", es: "Voz en off con imágenes de apoyo" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)]",
    iconColor: "text-[#22d3ee]",
  },
  {
    id: "entrevista",
    icon: Users,
    label: "ENTREVISTA",
    description: { en: "Interview / Q&A format", es: "Formato de entrevista / Q&A" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)]",
    iconColor: "text-[#22d3ee]",
  },
  {
    id: "variado",
    icon: Grid3X3,
    label: "VARIADO",
    description: { en: "Mixed format & transitions", es: "Formato mixto con transiciones" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)]",
    iconColor: "text-[#22d3ee]",
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
  initialTemplateVideo?: RemixVideo;
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
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function viralityColor(score: number) {
  if (score >= 8) return "text-green-400";
  if (score >= 6) return "text-cyan-400";
  return "text-red-400";
}

function viralityBg(score: number) {
  if (score >= 8) return "bg-green-500/20 border-green-500/30";
  if (score >= 6) return "bg-cyan-400/20 border-cyan-400/30";
  return "bg-red-500/20 border-red-500/30";
}

// ==================== MAIN COMPONENT ====================
export function AIScriptWizard({ selectedClient, onComplete, onCancel, initialTemplateVideo }: AIScriptWizardProps) {
  const { language } = useLanguage();
  const { showOutOfCreditsModal } = useOutOfCredits();

  // Navigation
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);

  // Step 1 — Topic
  const [topic, setTopic] = useState("");

  // Step 2 — Research
  const [facts, setFacts] = useState<Fact[]>([]);
  const [selectedFacts, setSelectedFacts] = useState<number[]>([]);

  // Step 3 — Hook (AI suggestions from 984 viral hooks)
  const [suggestedHooks, setSuggestedHooks] = useState<HookFormula[]>([]);
  const [hookLoading, setHookLoading] = useState(false);
  const [selectedHook, setSelectedHook] = useState<HookFormula | null>(null);
  const [shownHookIds, setShownHookIds] = useState<string[]>([]);
  const [showBrowseAll, setShowBrowseAll] = useState(false);

  // Step 4 — Style/Format
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [scriptLength, setScriptLength] = useState(1);
  const [scriptLanguage, setScriptLanguage] = useState<"en" | "es">("en");

  // Step 4 — Vault Templates
  const [vaultTemplates, setVaultTemplates] = useState<VaultTemplate[]>([]);
  const [vaultTemplatesLoading, setVaultTemplatesLoading] = useState(false);
  const [selectedVaultTemplateId, setSelectedVaultTemplateId] = useState<string | null>(null);
  const [structureMode, setStructureMode] = useState<"default" | "vault">("default");
  const [remixVaultMatch, setRemixVaultMatch] = useState<VaultTemplate | null>(null);
  const [useRemixHook, setUseRemixHook] = useState(!!initialTemplateVideo?.url);
  const [useRemixStructure, setUseRemixStructure] = useState(!!initialTemplateVideo?.url);

  // Step 5 — Script
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [streamingLines, setStreamingLines] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [refining, setRefining] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  // Inline line editing
  const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingLineType, setEditingLineType] = useState<string>("");

  // ── Dual flow: Caption Video vs Talking Head ──
  const [videoType, setVideoType] = useState<"caption_video_music" | "talking_head" | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [captionVideoAnalysis, setCaptionVideoAnalysis] = useState<any>(null);
  // Visual breakdown segments (with embedded frame images) — shown before wizard steps when remixing
  const [videoVisualSegments, setVideoVisualSegments] = useState<Array<{
    start: number; end: number; description: string;
    frame_base64?: string; frame_type?: string; notes?: string;
  }>>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribePhase, setTranscribePhase] = useState<0 | 1 | 2 | 3>(0); // 0=idle,1=transcribing,2=analyzing,3=categorizing
  const [typeConfirmed, setTypeConfirmed] = useState(false);
  // ── Storytelling sub-path (for talking_head personal narrative videos) ──
  const [isStorytellingMode, setIsStorytellingMode] = useState(false);
  const [storyText, setStoryText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [extractingStory, setExtractingStory] = useState(false);
  const recognitionRef = useRef<any>(null);
  // Store multimodal analysis for talking-head remix (independent of vault match)
  const remixVideoAnalysisRef = useRef<any>(null);
  // Vault auto-save in progress flag (stays true until analyze-template finishes)
  const [vaultSaving, setVaultSaving] = useState(!!initialTemplateVideo?.url);
  // Leave confirmation dialog
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Bulk-edit facts state
  const [editingFactsBulk, setEditingFactsBulk] = useState(false);
  const [bulkFactsText, setBulkFactsText] = useState("");
  // Caption-specific state
  const [captionTopic, setCaptionTopic] = useState("");
  const [pacingStyle, setPacingStyle] = useState<"one_screen" | "two_beats" | "one_beat" | null>(null);
  const [captionGenerating, setCaptionGenerating] = useState(false);


  const lengthLabels = [
    tr({ en: "Short (30s)", es: "Corto (30s)" }, language),
    tr({ en: "Medium (45s)", es: "Medio (45s)" }, language),
    tr({ en: "Long (60s)", es: "Largo (60s)" }, language),
  ];

  // ==================== LEAVE CONFIRMATION (browser back/refresh) ====================
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleLeaveRequest = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  const confirmLeave = useCallback(() => {
    setShowLeaveConfirm(false);
    onCancel();
  }, [onCancel]);

  // ==================== AUTO-SELECT FORMAT FROM DETECTION ====================
  useEffect(() => {
    const suggestedFormat = initialTemplateVideo?.formatDetection?.wizard_config?.suggested_format;
    if (suggestedFormat && !selectedFormat) {
      // Map display label to format key used internally
      const labelToKey: Record<string, string> = {
        "TALKING HEAD": "talking_head",
        "B-ROLL CAPTION": "broll_caption",
        "ENTREVISTA": "entrevista",
        "VARIADO": "variado",
      };
      const key = labelToKey[suggestedFormat.toUpperCase()] || "talking_head";
      setSelectedFormat(key);
    }
  }, [initialTemplateVideo?.formatDetection]);

  // ==================== AUTO-TRANSCRIBE ON REMIX OPEN ====================
  useEffect(() => {
    if (!initialTemplateVideo?.url || transcribing || transcription !== null) return;

    // Pre-seed from format detection while transcription is in flight
    const detected = initialTemplateVideo.formatDetection;
    const preDetectedType = detected?.format === "CAPTION_VIDEO_MUSIC"
      ? "caption_video_music"
      : "talking_head";
    setVideoType(preDetectedType);

    setTranscribing(true);
    setTranscribePhase(1);
    (async () => {
      try {
        // ── Step 1: Transcribe video ──
        const token = await getAuthToken();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-video`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ url: initialTemplateVideo.url }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.insufficient_credits) {
            showOutOfCreditsModal();
            throw new Error("insufficient_credits");
          }
          throw new Error(err.error || `Transcription error ${res.status}`);
        }
        const result = await res.json();
        if (!result.transcription) return;

        setTranscription(result.transcription);
        setTranscribePhase(2);

        // ── Step 2: Verify video type AND run multimodal analysis in parallel ──
        let verifiedType: "caption_video_music" | "talking_head" = preDetectedType as any;
        let isStorytellingDetected = false;
        let videoAnalysis: any = null;

        const tokenForAnalysis = await getAuthToken();
        const [verifyResult, multimodalResult] = await Promise.allSettled([
          callAIBuild({
            step: "verify-video-type",
            transcription: result.transcription,
          }),
          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-video-multimodal`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenForAnalysis}` },
              body: JSON.stringify({ url: initialTemplateVideo.url, transcript: result.transcription }),
            }
          ).then(r => r.ok ? r.json() : Promise.reject(new Error(`Multimodal error ${r.status}`))),
        ]);

        if (verifyResult.status === "fulfilled") {
          const verifyData = verifyResult.value;
          verifiedType = verifyData.type as "caption_video_music" | "talking_head";
          setVideoType(verifiedType);
          if (verifiedType === "talking_head" && verifyData.is_storytelling === true) {
            setIsStorytellingMode(true);
            isStorytellingDetected = true;
          }
        }
        // Keep pre-detected type on verify failure

        if (multimodalResult.status === "fulfilled") {
          videoAnalysis = multimodalResult.value;
          console.log("[AIScriptWizard] Multimodal analysis:", videoAnalysis?.analysis_version, `${videoAnalysis?.visual_segments?.length} segments, energy=${videoAnalysis?.audio?.energy}`);
        } else {
          console.warn("[AIScriptWizard] Multimodal analysis failed:", (multimodalResult as any).reason?.message);
        }

        // ── Refinement pass: if verify confidence was low and we have multimodal data, re-classify ──
        const verifyConfidence = verifyResult.status === "fulfilled" ? verifyResult.value.confidence : 0;
        if (verifyConfidence < 0.75 && videoAnalysis) {
          console.log(`[AIScriptWizard] Low verify confidence (${verifyConfidence}) — running multimodal refinement`);
          try {
            const refined = await callAIBuild({
              step: "verify-video-type",
              transcription: result.transcription,
              audio_hint: videoAnalysis.audio
                ? { energy: videoAnalysis.audio.energy, speech_density: videoAnalysis.audio.speech_density, has_music: videoAnalysis.audio.has_music }
                : undefined,
              visual_hint: videoAnalysis.visual_segments?.slice(0, 3).map((s: any) => s.description),
            });
            if (refined?.type) {
              console.log(`[AIScriptWizard] Refined type: ${refined.type} (was ${verifiedType})`);
              verifiedType = refined.type as "caption_video_music" | "talking_head";
              setVideoType(verifiedType);
              if (verifiedType === "talking_head" && refined.is_storytelling === true) {
                setIsStorytellingMode(true);
                isStorytellingDetected = true;
              } else if (verifiedType !== "talking_head") {
                setIsStorytellingMode(false);
                isStorytellingDetected = false;
              }
            }
          } catch (e) {
            console.warn("[AIScriptWizard] Multimodal refinement failed:", e);
          }
        }

        // Store multimodal analysis for caption flow (used by handleGenerateCaptionScript)
        if (verifiedType === "caption_video_music" && videoAnalysis) {
          setCaptionVideoAnalysis(videoAnalysis);
        }
        // Store for remix talking-head flow (independent of vault match)
        if (videoAnalysis) {
          remixVideoAnalysisRef.current = videoAnalysis;
        }

        // Populate visual breakdown for all video types
        if (videoAnalysis?.visual_segments?.length) {
          setVideoVisualSegments(videoAnalysis.visual_segments.map((s: any) => ({ ...s, notes: "" })));
        }

        // ── Step 3: For talking head — analyze + save to vault (sequential, not fire-and-forget) ──
        setTranscribePhase(3);
        if (verifiedType === "talking_head" && initialTemplateVideo?.url) {
          const videoUrl = initialTemplateVideo.url;
          const channelName = (initialTemplateVideo as any).channel_username;
          // Auto-set topic for storytelling from channel name
          if (isStorytellingDetected) {
            setTopic(channelName ? `@${channelName} — My Story` : "My Story");
          }
          try {
            const analysisData = await callAIBuild({
              step: "analyze-template",
              transcription: result.transcription,
              ...(videoAnalysis ? { video_analysis: videoAnalysis } : {}),
            });

            // Find existing template for this video (no unique constraint exists, so manual check)
            const { data: existing } = await supabase
              .from("vault_templates")
              .select("id")
              .eq("client_id", selectedClient.id)
              .eq("source_url", videoUrl)
              .maybeSingle();

            let saved: VaultTemplate | null = null;
            const payload = {
              name: analysisData.suggested_name || (channelName ? `@${channelName}` : "Video Template"),
              template_lines: analysisData.template_lines,
              // Embed video_analysis inside structure_analysis so it's available when re-loading the template
              structure_analysis: videoAnalysis
                ? { ...analysisData.structure_analysis, video_analysis: videoAnalysis }
                : analysisData.structure_analysis,
            };

            if (existing?.id) {
              // Update existing
              const { data } = await supabase
                .from("vault_templates")
                .update(payload)
                .eq("id", existing.id)
                .select("id, name, template_lines, structure_analysis, source_url")
                .single();
              saved = data as VaultTemplate | null;
            } else {
              // Insert new
              const { data } = await supabase
                .from("vault_templates")
                .insert({ client_id: selectedClient.id, source_url: videoUrl, ...payload })
                .select("id, name, template_lines, structure_analysis, source_url")
                .single();
              saved = data as VaultTemplate | null;
            }

            if (saved) {
              setVaultTemplates(prev => [saved!, ...prev.filter(t => t.source_url !== videoUrl)]);
              setRemixVaultMatch(saved);
              // NOTE: Do NOT set structureMode="vault" here — that would route generation through
              // templatize-script which ignores the user's researched facts. The vault template is
              // used only as a hook/structure GUIDE passed to generate-script via useRemixHook/useRemixStructure.
              setUseRemixStructure(true);
              const hookType = (saved.structure_analysis as any)?.hook_type;
              // Always activate remix hook for all talking-head remixes — fallback to educational if no hookType
              setUseRemixHook(true);
            }
          } catch (e) {
            console.warn("Vault template save failed — using transcription fallback:", e);
            // FALLBACK: Save raw transcription as vault template so structure is always available
            try {
              const transcLines = result.transcription
                .split(/(?<=[.!?])\s+/)
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 8)
                .slice(0, 20);
              const totalLines = transcLines.length;
              const fallbackTemplateLines = transcLines.map((text: string, i: number) => ({
                line_type: "actor",
                section: i === 0 ? "hook" : i >= totalLines - 2 ? "cta" : "body",
                text,
              }));
              const fallbackAnalysis = {
                hook_type: "talking_head_direct_opener",
                body_pattern: "personal_story_arc",
                section_sequence: ["hook", "body", "cta"],
                from_transcription: true,
              };
              const { data: existingFallback } = await supabase
                .from("vault_templates")
                .select("id")
                .eq("client_id", selectedClient.id)
                .eq("source_url", videoUrl)
                .maybeSingle();
              const fallbackPayload = {
                name: channelName ? `@${channelName} (transcript)` : "Video Transcript",
                template_lines: fallbackTemplateLines,
                structure_analysis: fallbackAnalysis,
              };
              let fallbackSaved: VaultTemplate | null = null;
              if (existingFallback?.id) {
                const { data } = await supabase
                  .from("vault_templates")
                  .update(fallbackPayload)
                  .eq("id", existingFallback.id)
                  .select("id, name, template_lines, structure_analysis, source_url")
                  .single();
                fallbackSaved = data as VaultTemplate | null;
              } else {
                const { data } = await supabase
                  .from("vault_templates")
                  .insert({ client_id: selectedClient.id, source_url: videoUrl, ...fallbackPayload })
                  .select("id, name, template_lines, structure_analysis, source_url")
                  .single();
                fallbackSaved = data as VaultTemplate | null;
              }
              if (fallbackSaved) {
                setVaultTemplates(prev => [fallbackSaved!, ...prev.filter(t => t.source_url !== videoUrl)]);
                setRemixVaultMatch(fallbackSaved);
                setUseRemixStructure(true);
                setUseRemixHook(true);
              }
            } catch (fallbackErr) {
              console.warn("Fallback transcript vault save also failed:", fallbackErr);
            }
          }

        }
        // Caption videos don't need vault templates
        setVaultSaving(false);
      } catch (e: any) {
        console.warn("Auto-transcription failed:", e.message);
        setVaultSaving(false);
      } finally {
        setTranscribing(false);
        setTranscribePhase(0);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ==================== FETCH VAULT TEMPLATES ====================
  const fetchVaultTemplates = useCallback((applyRemixMatch = false) => {
    if (vaultTemplatesLoading) return;
    setVaultTemplatesLoading(true);
    supabase
      .from("vault_templates")
      .select("id, name, template_lines, structure_analysis, source_url")
      .eq("client_id", selectedClient.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          const templates = data as VaultTemplate[];
          setVaultTemplates(templates);
          if (applyRemixMatch && initialTemplateVideo?.url) {
            const match = templates.find((t) => t.source_url === initialTemplateVideo.url);
            if (match) {
              setRemixVaultMatch(match);
              // Do NOT set structureMode="vault" — generate-script should use user's facts
              setUseRemixStructure(true);
              const hookType = (match.structure_analysis as any)?.hook_type;
              // Always activate remix hook — fallback to educational if no hookType
              setUseRemixHook(true);
            }
          }
        }
        setVaultTemplatesLoading(false);
      });
  }, [selectedClient.id, initialTemplateVideo?.url, vaultTemplatesLoading]);

  // Early fetch on mount if remixing (to pre-select hook + structure)
  useEffect(() => {
    if (initialTemplateVideo?.url) {
      fetchVaultTemplates(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch on step 4 — always re-fetch when remixing to pick up auto-saved template
  useEffect(() => {
    if (currentStep === 4 && !vaultTemplatesLoading) {
      if (initialTemplateVideo?.url || vaultTemplates.length === 0) {
        fetchVaultTemplates(!!initialTemplateVideo?.url);
      }
    }
  }, [currentStep, vaultTemplates.length, vaultTemplatesLoading, fetchVaultTemplates, initialTemplateVideo?.url]);

  // ==================== HOOK SUGGESTION FETCH ====================
  const hasFetchedForTopic = useRef<string | null>(null);

  const fetchSuggestedHooks = useCallback(async (excludeIds: string[] = []) => {
    if (!topic || !selectedClient?.id) return;
    setHookLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-hooks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            topic: topic.trim().toLowerCase(),
            client_id: selectedClient.id,
            exclude_ids: excludeIds,
          }),
        }
      );
      const data = await res.json();
      if (data.hooks) {
        setSuggestedHooks(data.hooks);
        setShownHookIds(prev => [...prev, ...data.hooks.map((h: HookFormula) => h.id)]);
        if (data.reset) {
          toast.info(tr({ en: "All hooks cycled — fresh selection!", es: "Todos los hooks usados — seleccion fresca!" }, language));
        }
      }
    } catch (e) {
      console.error("Failed to fetch hook suggestions:", e);
      toast.error(tr({ en: "Could not load hook suggestions", es: "No se pudieron cargar las sugerencias de hooks" }, language));
    } finally {
      setHookLoading(false);
    }
  }, [topic, selectedClient?.id, language]);

  useEffect(() => {
    const normalizedTopic = topic?.trim().toLowerCase() ?? null;
    if (currentStep === 3 && normalizedTopic && hasFetchedForTopic.current !== normalizedTopic) {
      hasFetchedForTopic.current = normalizedTopic;
      setShownHookIds([]);
      setSelectedHook(null);
      setSuggestedHooks([]);
      fetchSuggestedHooks();
    }
  }, [currentStep, topic, fetchSuggestedHooks]);

  // ==================== API HELPER ====================
  async function callAIBuild(payload: any) {
    const token = await getAuthToken();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-build-script`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      if (err.insufficient_credits) {
        showOutOfCreditsModal();
        throw new Error("insufficient_credits");
      }
      throw new Error(err.error || `Error ${res.status}`);
    }
    return await res.json();
  }

  // ==================== STREAMING SCRIPT HELPER ====================
  async function callAIBuildStream(payload: any, onLine: (line: any) => void): Promise<any> {
    const token = await getAuthToken();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-build-script`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, step: "generate-script-stream" }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Streaming error ${res.status}: ${err}`);
    }
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let jsonBuffer = "";
    const seenLines = new Set<number>();

    // Regex to extract complete script line objects as they stream
    const linePattern = /\{"line_type"\s*:\s*"[^"]+"\s*,\s*"section"\s*:\s*"[^"]+"\s*,\s*"text"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
            jsonBuffer += event.delta.partial_json ?? "";
            // Try to extract complete line objects progressively
            let match: RegExpExecArray | null;
            linePattern.lastIndex = 0;
            while ((match = linePattern.exec(jsonBuffer)) !== null) {
              try {
                const obj = JSON.parse(match[0]);
                const key = seenLines.size;
                if (!seenLines.has(key)) {
                  seenLines.add(key);
                  onLine(obj);
                }
              } catch { /* incomplete */ }
            }
          }
        } catch { /* non-JSON line */ }
      }
    }

    // Parse the complete JSON at the end
    try {
      return JSON.parse(jsonBuffer);
    } catch {
      throw new Error("Failed to parse streamed script JSON");
    }
  }

  // ==================== HANDLERS ====================
  const runResearch = useCallback(async (topicText: string) => {
    if (!topicText.trim()) return;
    setLoading(true);
    try {
      const data = await callAIBuild({ step: "research", topic: topicText.trim() });
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
  }, [advanceTo, callAIBuild, language]);

  const handleResearch = async () => runResearch(topic);


  const handleAssistantAction = useCallback((action: { type: string; payload: any }) => {
    switch (action.type) {
      case "complete_step_1": {
        const t = action.payload.topic ?? "";
        setTopic(t);
        toast.success("Topic set — running research...");
        runResearch(t);
        break;
      }
      case "set_topic":
        setTopic(action.payload.value ?? "");
        toast.success("Topic updated by AI assistant");
        break;
      case "set_facts": {
        const newFacts = ((action.payload.facts as string[]) || []).slice(0, 5).map((f: string, i: number) => ({
          fact: f,
          impact_score: 5 - i,
        }));
        setFacts(newFacts);
        setSelectedFacts(newFacts.map((_, i) => i).slice(0, 3));
        toast.success("Research facts updated by AI assistant");
        break;
      }
      case "select_hook": {
        // AI assistant selected a hook — find matching hook from the data or create a synthetic one
        const aiCategory = action.payload.category ?? "educational";
        const aiTemplate = action.payload.template ?? "";
        const matchedHook = VIRAL_HOOK_FORMULAS.find(h => h.category === aiCategory && h.template === aiTemplate)
          || { id: `ai-${Date.now()}`, category: aiCategory as HookCategory, template: aiTemplate };
        setSelectedHook(matchedHook);
        setUseRemixHook(false);
        toast.success("Hook selected by AI assistant");
        break;
      }
      case "advance_step": {
        const s = Number(action.payload.step);
        if (s >= 1 && s <= 5) advanceTo(s as Step);
        break;
      }
      case "select_format":
        setSelectedFormat(action.payload.format ?? null);
        toast.success("Script format selected by AI assistant");
        break;
      case "edit_line":
        setGeneratedScript((prev: any) => {
          if (!prev?.lines) return prev;
          const newLines = [...prev.lines];
          const idx = action.payload.line_index;
          if (newLines[idx]) {
            newLines[idx] = { ...newLines[idx], text: action.payload.text };
          }
          return { ...prev, lines: newLines };
        });
        toast.success("Script line updated by AI assistant");
        break;
      case "generate_script":
        advanceTo(5);
        break;
      case "set_script_options":
        if (action.payload.format) setSelectedFormat(action.payload.format);
        if (action.payload.length !== undefined) setScriptLength(action.payload.length as 0 | 1 | 2);
        if (action.payload.language) setScriptLanguage(action.payload.language);
        toast.success("Script options updated by AI assistant");
        break;
    }
  }, [advanceTo, runResearch]);

  const handleExtractStoryFacts = async () => {
    if (!storyText.trim() || extractingStory) return;
    setExtractingStory(true);
    try {
      const data = await callAIBuild({ step: "extract-story-facts", story: storyText.trim() });
      const factsArr: Fact[] = (data.facts || []).slice(0, 5);
      setFacts(factsArr);
      const top3 = factsArr
        .map((f, i) => ({ score: f.impact_score, i }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.i);
      setSelectedFacts(top3);
      // Auto-set topic from first sentence of story if not already set
      if (!topic.trim()) {
        const firstSentence = storyText.trim().split(/[.!?]/)[0].trim();
        setTopic(firstSentence.slice(0, 80) || "My Story");
      }
      // Advance to Step 2 to review extracted moments
      advanceTo(2);
    } catch (e: any) {
      toast.error(e.message || tr({ en: "Error extracting story key points", es: "Error al extraer puntos clave de la historia" }, language));
    } finally {
      setExtractingStory(false);
    }
  };

  const handleStartRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error(tr({ en: "Voice input is not supported in this browser. Please type your story.", es: "La entrada de voz no está disponible en este navegador. Por favor escribe tu historia." }, language));
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language === "es" ? "es-419" : "en-US";
    recognition.onresult = (e: any) => {
      const text = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      setStoryText(prev => prev ? prev + " " + text : text);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => { setIsRecording(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsRecording(false);
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

    // Default mode — require hook (either remix or manual selection)
    const remixHookType = (remixVaultMatch?.structure_analysis as any)?.hook_type;
    // When remix is active, always have fallbacks so generation is never blocked
    const effectiveHookCategory = useRemixHook
      ? (remixHookType || selectedHook?.category || "educational")
      : selectedHook?.category;
    const effectiveHookTemplate = useRemixHook
      ? (remixHookType || selectedHook?.template || "hook_from_remix")
      : selectedHook?.template;

    if (!useRemixHook && (!effectiveHookCategory || !effectiveHookTemplate)) {
      toast.error(tr({ en: "Please select a hook template first.", es: "Selecciona una plantilla de hook primero." }, language));
      return;
    }
    setLoading(true);
    setStreamingLines([]);
    setIsStreaming(true);
    try {
      const lengthMap = ["short", "medium", "long"];
      const chosenFacts = selectedFacts.map((i) => facts[i]).filter(Boolean);
      const payload = {
        topic,
        selectedFacts: chosenFacts,
        hookCategory: effectiveHookCategory,
        hookTemplate: effectiveHookTemplate,
        structure: "Hook → Story → CTA",
        formato: selectedFormat || "talking_head",
        length: lengthMap[scriptLength],
        language: scriptLanguage,
        video_format_hint: initialTemplateVideo?.formatDetection?.wizard_config?.prompt_hint ?? undefined,
        ...(initialTemplateVideo?.url ? {
          structure_guide: {
            hook_type: (remixVaultMatch?.structure_analysis as any)?.hook_type || "talking_head_direct_opener",
            body_pattern: (remixVaultMatch?.structure_analysis as any)?.body_pattern || "personal_story_arc",
            section_sequence: (remixVaultMatch?.structure_analysis as any)?.section_sequence || ["hook", "body", "cta"],
          },
          ...(transcription ? { remix_transcription: transcription } : {}),
        } : {}),
        ...((  (remixVaultMatch?.structure_analysis as any)?.video_analysis || remixVideoAnalysisRef.current) ? {
          video_analysis: (remixVaultMatch?.structure_analysis as any)?.video_analysis || remixVideoAnalysisRef.current,
        } : {}),
      };
      const data = await callAIBuildStream(payload, (line) => {
        setStreamingLines((prev) => [...prev, line]);
      });
      setIsStreaming(false);
      setGeneratedScript(data);
      advanceTo(5);
      // Record hook usage for anti-repetition
      if (selectedHook && selectedClient?.id) {
        supabase.from("hook_usage").upsert({
          client_id: selectedClient.id,
          topic: topic.trim().toLowerCase(),
          hook_id: selectedHook.id,
        }, { onConflict: "client_id,topic,hook_id" }).then(() => {}).catch(() => {});
      }
    } catch (e: any) {
      setIsStreaming(false);
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
          hookCategory: selectedHook?.category || "educational",
          hookTemplate: selectedHook?.template || "",
          structure: "Hook → Story → CTA",
          formato: selectedFormat || "talking_head",
          length: lengthMap[scriptLength],
          language: scriptLanguage,
          video_format_hint: initialTemplateVideo?.formatDetection?.wizard_config?.prompt_hint ?? undefined,
          ...((remixVaultMatch?.structure_analysis as any)?.video_analysis ? {
            video_analysis: (remixVaultMatch.structure_analysis as any).video_analysis,
          } : {}),
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
      const validLineTypes = ["filming", "actor", "editor", "text_on_screen"] as const;
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
      }, initialTemplateVideo?.url ?? undefined);

      // Auto-save vault template when transcription is available from a remix
      if (initialTemplateVideo?.url && transcription) {
        try {
          const analysisData = await callAIBuild({
            step: "analyze-template",
            transcription,
          });
          await supabase.from("vault_templates").upsert({
            client_id: selectedClient.id,
            name: analysisData.suggested_name || `@${initialTemplateVideo.channel_username}`,
            source_url: initialTemplateVideo.url,
            template_lines: analysisData.template_lines,
            structure_analysis: analysisData.structure_analysis,
          }, { onConflict: "source_url,client_id", ignoreDuplicates: false });
        } catch (vaultErr: any) {
          console.warn("[AIScriptWizard] vault auto-save failed (non-blocking):", vaultErr?.message);
        }
      }
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

  // ==================== INLINE LINE EDITING ====================
  const startEditLine = (globalIdx: number) => {
    if (!generatedScript?.lines?.[globalIdx]) return;
    const line = generatedScript.lines[globalIdx];
    setEditingLineIdx(globalIdx);
    setEditingText(line.text);
    setEditingLineType(line.line_type);
  };

  const saveLineEdit = () => {
    if (editingLineIdx === null || !generatedScript) return;
    const newLines = [...generatedScript.lines];
    newLines[editingLineIdx] = {
      ...newLines[editingLineIdx],
      text: editingText.trim() || newLines[editingLineIdx].text,
      line_type: editingLineType,
    };
    setGeneratedScript({ ...generatedScript, lines: newLines });
    setEditingLineIdx(null);
  };

  const cancelLineEdit = () => {
    setEditingLineIdx(null);
    setEditingText("");
    setEditingLineType("");
  };

  // ==================== CAPTION SCRIPT HANDLER ====================
  const handleGenerateCaptionScript = async () => {
    if (!captionTopic.trim() || captionGenerating) return;
    setCaptionGenerating(true);
    try {
      // Infer how many scene-caption pairs the original video had
      const segmentCount = captionVideoAnalysis?.visual_segments?.length;
      const lineCount = transcription ? transcription.split("\n").filter((l: string) => l.trim()).length : 0;
      const target_pairs = segmentCount || (lineCount > 0 ? lineCount : undefined);

      const data = await callAIBuild({
        step: "generate-caption-script",
        topic: captionTopic.trim(),
        template_transcription: transcription || undefined,
        ...(target_pairs ? { target_pairs } : {}),
        ...(captionVideoAnalysis ? { video_analysis: captionVideoAnalysis } : {}),
      });
      setGeneratedScript(data);
      advanceTo(2); // Caption mode only has 2 steps — setup → script
    } catch (e: any) {
      toast.error(e.message || tr({ en: "Error generating caption script", es: "Error al generar el script de captions" }, language));
    } finally {
      setCaptionGenerating(false);
    }
  };

  const toggleFact = (idx: number) => {
    setSelectedFacts((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => { if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; } };
  }, []);

  const restart = () => {
    setCurrentStep(1);
    setMaxUnlockedStep(1);
    setTopic("");
    setFacts([]);
    setSelectedFacts([]);
    setSelectedHook(null);
    setSuggestedHooks([]);
    setShownHookIds([]);
    hasFetchedForTopic.current = null;
    setSelectedFormat(null);
    setSelectedVaultTemplateId(null);
    setStructureMode("default");
    setGeneratedScript(null);
    setFeedbackText("");
    // Caption mode reset
    setCaptionTopic("");
    setPacingStyle(null);
    setTypeConfirmed(false);
    // Storytelling mode reset
    setIsStorytellingMode(false);
    setStoryText("");
    setIsRecording(false);
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
  };

  // ==================== STEP CONTENT ====================
  const renderStep1 = () => {
    const detection = initialTemplateVideo?.formatDetection;
    const formatCfg: Record<string, { icon: any; label: string; color: string; bg: string; border: string; hint: string }> = {
      TALKING_HEAD: {
        icon: Mic,
        label: tr({ en: "Talking Head", es: "Talking Head" }, language),
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-blue-500/25",
        hint: tr({ en: "This video features a person speaking to camera. A spoken-word script will work well.", es: "Este video tiene a una persona hablando a cámara. Un guión hablado funcionará bien." }, language),
      },
      VOICEOVER: {
        icon: Film,
        label: tr({ en: "Voiceover / B-Roll", es: "Voiceover / B-Roll" }, language),
        color: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-purple-500/25",
        hint: tr({ en: "This video uses narration over footage. Your script will be structured as voiceover lines.", es: "Este video usa narración sobre imágenes. Tu guión se estructurará como líneas de voiceover." }, language),
      },
      TEXT_STORY: {
        icon: AlignLeft,
        label: tr({ en: "Text Story", es: "Historia de Texto" }, language),
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/25",
        hint: tr({ en: "This video tells its story through on-screen text with minimal spoken audio. Your script will be structured as punchy text card beats.", es: "Este video cuenta su historia con texto en pantalla y poco audio. Tu guión se estructurará como tarjetas de texto impactantes." }, language),
      },
      STORYTELLING: {
        icon: MessageSquare,
        label: tr({ en: "Storytelling Video", es: "Video de Storytelling" }, language),
        color: "text-rose-400",
        bg: "bg-rose-500/10",
        border: "border-rose-500/25",
        hint: tr({ en: "This video tells a personal story. Instead of AI research, you'll share your own story and we'll extract the key moments to build your script.", es: "Este video cuenta una historia personal. En lugar de investigar hechos, compartirás tu historia y extraeremos los momentos clave para crear tu guión." }, language),
      },
    };
    const fc = (isStorytellingMode && detection?.format === "TALKING_HEAD")
      ? formatCfg["STORYTELLING"]
      : detection ? (formatCfg[detection.format] || null) : null;

    return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Format detection banner */}
      {fc && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${fc.bg} ${fc.border}`}>
          <fc.icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${fc.color}`} />
          <div className="space-y-0.5">
            <p className={`text-sm font-semibold ${fc.color}`}>
              {fc.label}{" "}
              <span className="font-normal text-muted-foreground text-xs">
                ({Math.round(detection!.confidence * 100)}% confidence)
              </span>
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{fc.hint}</p>
          </div>
        </div>
      )}

      {/* ── STORYTELLING: Story input in Step 1 ── */}
      {isStorytellingMode ? (
        <div className="space-y-4">
          <div className="text-center space-y-2 pb-2">
            <h2 className="text-2xl font-bold text-foreground">
              {tr({ en: "Tell Your Story", es: "Cuenta Tu Historia" }, language)}
            </h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              {tr({ en: "Write or speak your story — AI will organize the most impactful moments into your script.", es: "Escribe o narra tu historia — la IA organizará los momentos más impactantes en tu guión." }, language)}
            </p>
          </div>

          {/* Vault structure hint (if remixing) */}
          {remixVaultMatch?.structure_analysis && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-cyan-400/8 border border-cyan-400/20">
              <MessageSquare className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-0.5">
                  {tr({ en: "Viral hook structure detected from video", es: "Estructura de hook viral detectada del video" }, language)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(remixVaultMatch.structure_analysis as any)?.hook_type} — {(remixVaultMatch.structure_analysis as any)?.body_pattern}
                </p>
              </div>
            </div>
          )}

          {/* Story textarea + mic */}
          <div className="relative">
            <Textarea
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder={tr({
                en: "e.g. I started my business 3 years ago with $500 and a dream. At the time I was working two jobs and barely making rent...",
                es: "ej. Empecé mi negocio hace 3 años con $500 y un sueño. En ese momento tenía dos trabajos y apenas podía pagar el alquiler...",
              }, language)}
              className="min-h-[200px] text-sm bg-card border-border/60 focus:border-primary/60 rounded-xl resize-none pr-14 leading-relaxed"
            />
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className={`absolute bottom-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isRecording
                  ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                  : "bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/20"
              }`}
            >
              {isRecording ? <X className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-medium">
                {tr({ en: "Recording… speak now.", es: "Grabando… habla ahora." }, language)}
              </span>
            </div>
          )}

          {/* Word count + Extract button */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {storyText.split(/\s+/).filter(Boolean).length > 0 && `${storyText.split(/\s+/).filter(Boolean).length} ${tr({ en: "words", es: "palabras" }, language)}`}
            </span>
            <Button
              onClick={handleExtractStoryFacts}
              disabled={extractingStory || storyText.trim().length < 50}
              className="gap-2 bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-400 border border-cyan-400/40 rounded-xl px-5 h-11"
            >
              {extractingStory ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{tr({ en: "Extracting moments…", es: "Extrayendo momentos…" }, language)}</>
              ) : (
                <><Sparkles className="w-4 h-4" />{tr({ en: "Extract Key Moments", es: "Extraer Momentos Clave" }, language)}<ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
          {storyText.trim().length > 0 && storyText.trim().length < 50 && (
            <p className="text-xs text-muted-foreground/60 text-center">
              {tr({ en: "Write at least a few sentences to extract meaningful moments.", es: "Escribe al menos algunas oraciones para extraer momentos significativos." }, language)}
            </p>
          )}
        </div>
      ) : (
        /* ── STANDARD: Topic input ── */
        <div className="space-y-3">
          <div className="text-center space-y-2 pb-2">
            <h2 className="text-2xl font-bold text-foreground">
              {tr({ en: "What's your video topic?", es: "¿Cuál es el tema de tu video?" }, language)}
            </h2>
            <p className="text-muted-foreground text-sm">
              {tr({ en: "Enter a topic and AI will research 5 viral facts for you.", es: "Ingresa un tema y la IA investigará 5 datos virales para ti." }, language)}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" />
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={tr({ en: "e.g. Benefits of cold showers, How to grow on TikTok...", es: "ej. Beneficios de las duchas frías, Cómo crecer en TikTok..." }, language)}
              className="pl-12 pr-4 py-4 text-base bg-card border-border/60 focus:border-primary/60 rounded-xl h-14"
              onKeyDown={(e) => { if (e.key === "Enter") handleResearch(); }}
            />
          </div>
          <Button
            onClick={handleResearch}
            disabled={loading || !topic.trim()}
            className="w-full h-12 text-base font-semibold rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-400 border border-cyan-400/40 gap-3 transition-all"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" />{tr({ en: "Researching...", es: "Investigando..." }, language)}</>
            ) : (
              <><Sparkles className="w-5 h-5" />{tr({ en: "Research Facts", es: "Investigar" }, language)}<ArrowRight className="w-5 h-5 ml-auto" /></>
            )}
          </Button>
          {loading && (
            <div className="bg-card/50 border border-cyan-400/25 rounded-2xl p-6 text-center space-y-3">
              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-cyan-400/60 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {tr({ en: "AI is scanning for viral data...", es: "La IA está buscando datos virales..." }, language)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
    );
  };

  // ── Bulk-edit helpers ──
  const openBulkEdit = () => {
    setBulkFactsText(facts.map((f, i) => `${i + 1}. ${f.fact}`).join("\n\n"));
    setEditingFactsBulk(true);
  };
  const saveBulkEdit = () => {
    const lines = bulkFactsText
      .split("\n")
      .map(l => l.replace(/^\d+\.\s*/, "").trim())
      .filter(l => l.length > 0);
    const newFacts: Fact[] = lines.map((fact, i) => ({
      fact,
      impact_score: facts[i]?.impact_score ?? 8,
    }));
    setFacts(newFacts);
    setSelectedFacts(newFacts.map((_, i) => i).slice(0, 3));
    setEditingFactsBulk(false);
  };

  // ── Shared fact list renderer (used in both storytelling and standard paths) ──
  const renderFactList = (labelKey: { en: string; es: string }, nextLabel: { en: string; es: string }, onNextOverride?: () => void) => (
    <div className="space-y-3">
      {/* Header row: label + Edit All button */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
          {tr(labelKey, language)}
        </p>
        {facts.length > 0 && (
          <button
            onClick={editingFactsBulk ? saveBulkEdit : openBulkEdit}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              editingFactsBulk
                ? "bg-cyan-400 text-white border-cyan-400"
                : "bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-cyan-400/40"
            }`}
          >
            {editingFactsBulk ? <><Check className="w-3 h-3" />{tr({ en: "Save edits", es: "Guardar" }, language)}</> : <>{tr({ en: "✏️ Edit all", es: "✏️ Editar todo" }, language)}</>}
          </button>
        )}
      </div>

      {/* Bulk-edit textarea */}
      {editingFactsBulk ? (
        <div className="space-y-2">
          <Textarea
            value={bulkFactsText}
            onChange={(e) => setBulkFactsText(e.target.value)}
            className="min-h-[220px] text-sm bg-card border-border/60 focus:border-primary/60 rounded-xl resize-none leading-relaxed font-mono"
            placeholder="1. Your first fact or story moment&#10;&#10;2. Your second fact or story moment&#10;&#10;3. Your third fact or story moment"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {tr({ en: "Edit freely — one entry per line. Remove the numbers if you like.", es: "Edita libremente — una entrada por línea. Puedes quitar los números." }, language)}
            </p>
            <button
              onClick={() => setEditingFactsBulk(false)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              {tr({ en: "Cancel", es: "Cancelar" }, language)}
            </button>
          </div>
        </div>
      ) : (
        /* Individual fact cards */
        <div className="space-y-3">
          {facts.map((f, i) => {
            const isSelected = selectedFacts.includes(i);
            return (
              <button
                key={i}
                onClick={() => toggleFact(i)}
                className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                  isSelected
                    ? "bg-primary/10 border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                    : "bg-card border-border/60 hover:border-primary/30 hover:bg-card/80"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isSelected ? "bg-cyan-400 text-white" : "bg-muted text-muted-foreground border border-border"
                  }`}>
                    {isSelected ? <Check className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-relaxed ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                      {f.fact}
                    </p>
                  </div>
                  <div className={`flex-shrink-0 flex flex-col items-center gap-0.5 ${
                    f.impact_score >= 9 ? "text-rose-400" : f.impact_score >= 8 ? "text-cyan-400" : "text-muted-foreground"
                  }`}>
                    <span className="text-lg font-bold leading-none">{f.impact_score}</span>
                    <span className="text-[10px] font-medium opacity-70">/ 10</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer: selection count + Next */}
      {!editingFactsBulk && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {selectedFacts.length} {tr({ en: "selected", es: "seleccionados" }, language)}
          </span>
          <Button
            onClick={() => onNextOverride ? onNextOverride() : advanceTo(3)}
            disabled={selectedFacts.length === 0 || (!!onNextOverride && (loading || vaultSaving))}
            className="gap-2 bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-400 border border-cyan-400/40 rounded-xl px-6"
          >
            {!!onNextOverride && loading
              ? tr({ en: "Generating…", es: "Generando…" }, language)
              : tr(nextLabel, language)
            }
            {!(!!onNextOverride && loading) && <ArrowRight className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => {
    const isRemixTalkingHead = !!(useRemixHook && useRemixStructure && initialTemplateVideo);
    const remixHookLabelGlobal = (remixVaultMatch?.structure_analysis as any)?.hook_type;
    const remixBodyLabelGlobal = (remixVaultMatch?.structure_analysis as any)?.body_pattern;

    // ── STORYTELLING PATH ──
    if (isStorytellingMode) {
      return (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2 pb-2">
            <h2 className="text-2xl font-bold text-foreground">
              {tr({ en: "Your Story Moments", es: "Momentos de Tu Historia" }, language)}
            </h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              {tr(
                isRemixTalkingHead
                  ? { en: "AI organized your story into key moments. Select what to include, then generate.", es: "La IA organizó tu historia en momentos clave. Selecciona qué incluir y genera." }
                  : { en: "AI organized your story into key moments. Review, edit if needed, then pick your hook.", es: "La IA organizó tu historia en momentos clave. Revísalos, edítalos si es necesario y elige tu hook." },
                language
              )}
            </p>
          </div>

          {/* Remix auto-structure notice for storytelling mode */}
          {isRemixTalkingHead && (
            <div className="flex flex-col gap-1 p-3 rounded-xl bg-cyan-400/10 border border-cyan-400/25 text-sm">
              <span className="font-semibold text-cyan-400 text-xs uppercase tracking-wide">
                {tr({ en: "Auto-detected from original video", es: "Auto-detectado del video original" }, language)}
              </span>
              {remixHookLabelGlobal && (
                <span className="text-foreground/80">
                  <span className="text-muted-foreground">{tr({ en: "Hook format:", es: "Formato del hook:" }, language)}</span>{" "}
                  {remixHookLabelGlobal}
                </span>
              )}
              {remixBodyLabelGlobal && (
                <span className="text-foreground/80">
                  <span className="text-muted-foreground">{tr({ en: "Body structure:", es: "Estructura del cuerpo:" }, language)}</span>{" "}
                  {remixBodyLabelGlobal}
                </span>
              )}
            </div>
          )}

          {facts.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-muted-foreground text-sm">
                {tr({ en: "No moments extracted yet. Go back to Step 1 and enter your story.", es: "Aún no hay momentos extraídos. Regresa al Paso 1 e ingresa tu historia." }, language)}
              </p>
              <Button variant="outline" onClick={() => jumpTo(1)} className="gap-2">
                <ArrowRight className="w-4 h-4 rotate-180" />
                {tr({ en: "Back to Step 1", es: "Volver al Paso 1" }, language)}
              </Button>
            </div>
          ) : (
            renderFactList(
              { en: "Key moments from your story — select the ones to include:", es: "Momentos clave de tu historia — selecciona los que incluir:" },
              isRemixTalkingHead
                ? { en: "Generate My Script", es: "Generar Mi Script" }
                : { en: "Next: Choose Hook", es: "Siguiente: Elegir Hook" },
              isRemixTalkingHead ? handleGenerateScript : undefined
            )
          )}
        </div>
      );
    }

    // ── STANDARD RESEARCH PATH ──
    const remixHookLabel = remixHookLabelGlobal;
    const remixBodyLabel = remixBodyLabelGlobal;

    return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2 pb-2">
        <h2 className="text-2xl font-bold text-foreground">
          {tr({ en: "Select your best facts", es: "Selecciona tus mejores datos" }, language)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr({ en: "Top 3 selected by impact score. Toggle any to include/exclude.", es: "Los 3 mejores seleccionados por impacto. Activa/desactiva para incluir/excluir." }, language)}
        </p>
      </div>

      {/* Topic recap */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-400/8 border border-cyan-400/25">
        <Search className="w-4 h-4 text-cyan-400 flex-shrink-0" />
        <span className="text-sm text-foreground font-medium">{topic}</span>
        <button
          onClick={() => { setCurrentStep(1); }}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          {tr({ en: "Change", es: "Cambiar" }, language)}
        </button>
      </div>

      {/* Remix auto-structure notice */}
      {isRemixTalkingHead && (
        <div className="flex flex-col gap-1 p-3 rounded-xl bg-cyan-400/10 border border-cyan-400/25 text-sm">
          <span className="font-semibold text-cyan-400 text-xs uppercase tracking-wide">
            {tr({ en: "Auto-detected from original video", es: "Auto-detectado del video original" }, language)}
          </span>
          {remixHookLabel && (
            <span className="text-foreground/80">
              <span className="text-muted-foreground">{tr({ en: "Hook format:", es: "Formato del hook:" }, language)}</span>{" "}
              {remixHookLabel}
            </span>
          )}
          {remixBodyLabel && (
            <span className="text-foreground/80">
              <span className="text-muted-foreground">{tr({ en: "Body structure:", es: "Estructura del cuerpo:" }, language)}</span>{" "}
              {remixBodyLabel}
            </span>
          )}
          <span className="text-xs text-muted-foreground mt-0.5">
            {tr({ en: "Your topic and research below will be the actual content — this is your original script.", es: "Tu tema e investigación a continuación serán el contenido real — este es tu script original." }, language)}
          </span>
        </div>
      )}

      {renderFactList(
        { en: "Facts researched — select the ones to use:", es: "Datos investigados — selecciona los que usarás:" },
        isRemixTalkingHead
          ? { en: "Generate My Script", es: "Generar Mi Script" }
          : { en: "Next: Choose Hook", es: "Siguiente: Elegir Hook" },
        isRemixTalkingHead ? handleGenerateScript : undefined
      )}
    </div>
    );
  };

  const renderStep3 = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2 pb-2">
        <h2 className="text-2xl font-bold text-foreground">
          {tr({ en: "Pick your hook style", es: "Elige el estilo de tu hook" }, language)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr({ en: "AI picks the best hooks for your topic. Choose one.", es: "La IA elige los mejores hooks para tu tema. Elige uno." }, language)}
        </p>
      </div>

      {/* Remix hook option — unchanged */}
      {initialTemplateVideo && (
        <button
          onClick={() => {
            if (!remixVaultMatch) return;
            setUseRemixHook(true);
            setSelectedHook(null);
          }}
          disabled={vaultSaving && !remixVaultMatch}
          className={`w-full text-left p-4 rounded-2xl border transition-all ${
            useRemixHook
              ? "border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/20"
              : remixVaultMatch
                ? "border-border/60 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                : vaultSaving
                  ? "border-cyan-400/25 bg-cyan-400/5 cursor-wait"
                  : "border-border/60 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              useRemixHook ? "bg-cyan-400 text-white" : vaultSaving && !remixVaultMatch ? "bg-cyan-400/10 text-cyan-400" : "bg-muted text-muted-foreground"
            }`}>
              {useRemixHook ? <Check className="w-4 h-4" /> : vaultSaving && !remixVaultMatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {tr({ en: "Use hook from remix video", es: "Usar hook del video remixeado" }, language)}
                </p>
                {useRemixHook && (
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/15 border border-cyan-400/25 px-2 py-0.5 rounded-full">REMIX</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                {remixVaultMatch
                  ? (remixVaultMatch.structure_analysis as any)?.hook_type || tr({ en: "Hook detected from video", es: "Hook detectado del video" }, language)
                  : vaultSaving
                    ? <><Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />{tr({ en: "Analyzing video hook...", es: "Analizando hook del video..." }, language)}</>
                    : tr({ en: "Hook style from original video", es: "Estilo de hook del video original" }, language)
                }
              </p>
            </div>
          </div>
        </button>
      )}

      {/* AI Suggestions header */}
      <div className="flex items-center gap-2 pt-2">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-medium text-cyan-400">
          {tr({ en: "Best hooks for", es: "Mejores hooks para" }, language)} &quot;{topic}&quot;
        </span>
      </div>

      {/* Loading skeleton */}
      {hookLoading && (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="rounded-2xl border border-border/40 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hook suggestion cards */}
      {!hookLoading && suggestedHooks.length > 0 && (
        <div className="space-y-3">
          {suggestedHooks.map((hook, i) => {
            const isSelected = selectedHook?.id === hook.id;
            const meta = HOOK_CATEGORY_META[hook.category as HookCategory];
            const IconComp = meta ? HOOK_ICON_MAP[meta.icon] : BookOpen;

            return (
              <button
                key={hook.id}
                onClick={() => {
                  setSelectedHook(hook);
                  setUseRemixHook(false);
                }}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? "border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/20"
                    : "border-border/40 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold ${
                    isSelected ? "bg-cyan-400 text-black" : "bg-muted text-muted-foreground"
                  }`}>
                    {isSelected ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground italic leading-relaxed">&quot;{hook.template}&quot;</p>
                    {meta && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {IconComp && <IconComp className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {tr(meta.label, language)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => fetchSuggestedHooks(shownHookIds)}
              disabled={hookLoading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/10 text-cyan-400 text-sm transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${hookLoading ? "animate-spin" : ""}`} />
              {tr({ en: "Show 5 More", es: "Mostrar 5 Mas" }, language)}
            </button>
            <button
              onClick={() => setShowBrowseAll(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/40 bg-card/50 hover:bg-card text-muted-foreground hover:text-foreground text-sm transition-all"
            >
              <List className="w-3.5 h-3.5" />
              {tr({ en: "Browse All", es: "Ver Todos" }, language)}
            </button>
          </div>
        </div>
      )}

      {/* Selection summary + next */}
      {(useRemixHook || selectedHook) && (
        <div className="sticky bottom-4 bg-card/95 backdrop-blur border border-cyan-400/25 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              {useRemixHook ? (
                <>
                  <p className="text-xs text-cyan-400 font-semibold flex items-center gap-1">
                    <span className="text-[10px] bg-cyan-400/15 border border-cyan-400/25 px-1.5 py-0.5 rounded-full">REMIX</span>
                    {tr({ en: "Hook from video", es: "Hook del video" }, language)}
                  </p>
                  <p className="text-sm text-foreground italic truncate">
                    &quot;{(remixVaultMatch?.structure_analysis as any)?.hook_type || "Video hook"}&quot;
                  </p>
                </>
              ) : selectedHook && (
                <>
                  <p className="text-xs text-muted-foreground font-medium">
                    {tr(HOOK_CATEGORY_META[selectedHook.category as HookCategory]?.label || { en: selectedHook.category, es: selectedHook.category }, language)}
                  </p>
                  <p className="text-sm text-foreground italic truncate">&quot;{selectedHook.template}&quot;</p>
                </>
              )}
            </div>
          </div>
          <Button
            onClick={() => advanceTo(4)}
            className="w-full gap-2 bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-400 border border-cyan-400/40 rounded-xl"
          >
            {tr({ en: "Next: Choose Style", es: "Siguiente: Elegir Estilo" }, language)}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {!hookLoading && suggestedHooks.length === 0 && !useRemixHook && (
        <p className="text-center text-xs text-muted-foreground">
          {tr({ en: "Loading hook suggestions...", es: "Cargando sugerencias de hooks..." }, language)}
        </p>
      )}

      {/* Browse All Modal */}
      <Dialog open={showBrowseAll} onOpenChange={(v) => !v && setShowBrowseAll(false)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{tr({ en: "Browse All Hooks", es: "Ver Todos los Hooks" }, language)}</DialogTitle>
          </DialogHeader>
          <BrowseAllContent
            language={language}
            onSelect={(hook) => {
              setSelectedHook(hook);
              setUseRemixHook(false);
              setShowBrowseAll(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderStep4 = () => {
    // ── REMIX MODE: Skip format cards entirely — always use original video's structure ──
    if (initialTemplateVideo?.url) {
      const remixHookType = (remixVaultMatch?.structure_analysis as any)?.hook_type;
      const remixBodyPattern = (remixVaultMatch?.structure_analysis as any)?.body_pattern;
      const isAnalyzing = vaultSaving && !remixVaultMatch;

      return (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2 pb-2">
            <h2 className="text-2xl font-bold text-foreground">
              {tr({ en: "Style & Length", es: "Estilo y Duración" }, language)}
            </h2>
            <p className="text-muted-foreground text-sm">
              {tr({ en: "Structure is taken from the original video — no need to pick a format.", es: "La estructura viene del video original — no necesitas elegir un formato." }, language)}
            </p>
          </div>

          {/* Remix structure confirmation */}
          <div className={`p-4 rounded-2xl border transition-all ${isAnalyzing ? "border-cyan-400/30 bg-cyan-400/5" : "border-cyan-400/40 bg-cyan-400/10"}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center flex-shrink-0">
                {isAnalyzing
                  ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  : <Check className="w-4 h-4 text-cyan-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-cyan-400">
                    {tr({ en: "Using original video's structure", es: "Usando estructura del video original" }, language)}
                  </p>
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded-full">REMIX</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAnalyzing
                    ? tr({ en: "Extracting structure from video…", es: "Extrayendo estructura del video…" }, language)
                    : remixHookType
                      ? `${remixHookType}${remixBodyPattern ? ` · ${remixBodyPattern}` : ""}`
                      : tr({ en: "Structure extracted from transcript", es: "Estructura extraída del transcript" }, language)
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Language + Length controls */}
          <div className="space-y-4 p-4 rounded-2xl bg-card/50 border border-border/60">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Languages className="w-4 h-4 text-cyan-400" />
                {tr({ en: "Script Language", es: "Idioma del Script" }, language)}
              </label>
              <div className="flex gap-2">
                {(["en", "es"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setScriptLanguage(lang)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      scriptLanguage === lang
                        ? "bg-cyan-400 text-white border-cyan-400"
                        : "border-border text-muted-foreground hover:border-cyan-400/40 bg-card"
                    }`}
                  >
                    {lang === "en" ? "English" : "Español"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center justify-between">
                <span>{tr({ en: "Script Length", es: "Duración del Script" }, language)}</span>
                <span className="text-cyan-400 text-xs font-semibold">{lengthLabels[scriptLength]}</span>
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

          {/* Generate button */}
          <BorderGlow borderRadius={12} backgroundColor="#141416" glowColor="187 80 70" colors={['#06B6D4', '#22d3ee', '#84CC16']} edgeSensitivity={25} glowRadius={50} coneSpread={10} fillOpacity={0}>
            <Button
              onClick={handleGenerateScript}
              disabled={loading || vaultSaving}
              className="w-full h-14 text-base font-semibold rounded-xl gap-3 transition-all bg-transparent border-0 hover:bg-white/5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {tr({ en: "Generating script...", es: "Generando script..." }, language)}
                </>
              ) : vaultSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {tr({ en: "Analyzing video structure...", es: "Analizando estructura del video..." }, language)}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  {tr({ en: "Generate Script", es: "Generar Script" }, language)}
                  <ArrowRight className="w-5 h-5 ml-auto" />
                </>
              )}
            </Button>
          </BorderGlow>

          {loading && (
            <div className="bg-card/50 border border-cyan-400/25 rounded-2xl p-6 text-center space-y-4">
              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-cyan-400/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {tr({ en: "Building your script...", es: "Construyendo tu script..." }, language)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tr({ en: "Applying your facts and original video structure", es: "Aplicando tus datos y la estructura del video original" }, language)}
                </p>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── Normal (non-remix) flow ──
    const isDefaultMode = structureMode === "default";
    const isVaultMode = structureMode === "vault";
    const selectedVaultTemplate = vaultTemplates.find((t) => t.id === selectedVaultTemplateId) || null;

    // For default mode: require a format. For vault mode: require a vault template selection.
    const canGenerate = isVaultMode ? !!selectedVaultTemplateId : !!selectedFormat;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2 pb-2">
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
                ? "bg-cyan-400 text-white shadow-sm"
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
                ? "bg-cyan-400 text-white shadow-sm"
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
                      <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-medium">
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
            <div className="flex items-center gap-2 text-sm font-medium text-cyan-400">
              <Archive className="w-4 h-4" />
              {tr({ en: "Select a Vault Template", es: "Selecciona una Plantilla del Vault" }, language)}
            </div>

            {/* Remix structure option */}
            {initialTemplateVideo && (
              <button
                onClick={() => {
                  if (!remixVaultMatch) return;
                  setUseRemixStructure(true);
                  setSelectedVaultTemplateId(remixVaultMatch.id);
                }}
                disabled={vaultSaving && !remixVaultMatch}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  useRemixStructure
                    ? "border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/20"
                    : remixVaultMatch
                      ? "border-border/60 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                      : vaultSaving
                        ? "border-cyan-400/20 bg-cyan-400/5 cursor-wait"
                        : "border-border/60 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    useRemixStructure ? "bg-cyan-400 text-white" : vaultSaving && !remixVaultMatch ? "bg-cyan-400/10 text-cyan-400" : "bg-muted text-muted-foreground"
                  }`}>
                    {useRemixStructure ? <Check className="w-4 h-4" /> : vaultSaving && !remixVaultMatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {tr({ en: "Use structure from remix video", es: "Usar estructura del video remixeado" }, language)}
                      </p>
                      {useRemixStructure && (
                        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded-full">REMIX</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      {remixVaultMatch
                        ? remixVaultMatch.name
                        : vaultSaving
                          ? <><Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />{tr({ en: "Saving video template to vault…", es: "Guardando plantilla al vault…" }, language)}</>
                          : tr({ en: "Structure from original video", es: "Estructura del video original" }, language)
                      }
                    </p>
                  </div>
                </div>
              </button>
            )}


            {vaultTemplatesLoading ? (
              <div className="flex items-center justify-center gap-3 p-8 rounded-2xl border border-border/60 bg-card/50">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {tr({ en: "Loading vault templates...", es: "Cargando plantillas del vault..." }, language)}
                </span>
              </div>
            ) : vaultTemplates.length === 0 ? (
              <div className="p-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 text-center space-y-2">
                <Archive className="w-8 h-8 text-cyan-400/50 mx-auto" />
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
                      onClick={() => {
                        setSelectedVaultTemplateId(isSelected ? null : tpl.id);
                        if (tpl.id !== remixVaultMatch?.id) setUseRemixStructure(false);
                        else setUseRemixStructure(true);
                      }}
                      className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                        isSelected
                          ? "bg-cyan-400/15 border-cyan-400/50 shadow-[0_0_0_1px_rgba(254,243,199,0.2)]"
                          : "bg-card border-border/60 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          isSelected ? "bg-cyan-400 text-white" : "bg-muted text-muted-foreground border border-border"
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
              <div className="p-3 rounded-xl bg-cyan-400/10 border border-cyan-400/20 text-xs text-cyan-400">
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
                <Languages className="w-4 h-4 text-cyan-400" />
                {tr({ en: "Script Language", es: "Idioma del Script" }, language)}
              </label>
              <div className="flex gap-2">
                {(["en", "es"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setScriptLanguage(lang)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      scriptLanguage === lang
                        ? "bg-cyan-400 text-white border-cyan-400"
                        : "border-border text-muted-foreground hover:border-cyan-400/40 bg-card"
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
                <span className="text-cyan-400 text-xs font-semibold">{lengthLabels[scriptLength]}</span>
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
                <Languages className="w-4 h-4 text-cyan-400" />
                {tr({ en: "Script Language", es: "Idioma del Script" }, language)}
              </label>
              <div className="flex gap-2">
                {(["en", "es"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setScriptLanguage(lang)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      scriptLanguage === lang
                        ? "bg-cyan-400 text-white border-cyan-400"
                        : "border-border text-muted-foreground hover:border-cyan-400/40 bg-card"
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
          className="w-full h-14 text-base font-semibold rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-400 border border-cyan-400/40 gap-3 transition-all"
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
          <div className="bg-card/50 border border-cyan-400/25 rounded-2xl p-6 text-center space-y-4">
            <div className="flex justify-center gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-cyan-400/60 animate-bounce"
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
      text_on_screen: {
        label: tr({ en: "TEXT ON SCREEN", es: "TEXTO EN PANTALLA" }, language),
        icon: MonitorPlay,
        bg: "bg-gradient-to-br from-zinc-500/15 to-zinc-900/5",
        border: "border-zinc-500/30",
        badge: "bg-zinc-500/20 text-zinc-400",
        iconColor: "text-zinc-400",
      },
    };

    const sectionBadge: Record<string, string> = {
      hook: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      body: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      cta: "bg-green-500/20 text-green-400 border-green-500/30",
    };

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
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
          // Build section lines with their global index preserved
          const sectionEntries = (generatedScript.lines || [])
            .map((l: any, globalIdx: number) => ({ line: l, globalIdx }))
            .filter(({ line }: { line: any }) => line.section === section);
          if (sectionEntries.length === 0) return null;
          const sectionLabels: Record<string, { en: string; es: string }> = {
            hook: { en: "HOOK", es: "HOOK" },
            body: { en: "BODY", es: "CUERPO" },
            cta: { en: "CALL TO ACTION", es: "LLAMADO A LA ACCIÓN" },
          };
          const editableLineTypes = [
            { key: "filming",        label: tr({ en: "FILMING", es: "FILMACIÓN" }, language),       icon: Film,        color: "text-red-400",     active: "bg-red-500/20 border-red-400/60" },
            { key: "actor",          label: tr({ en: "VOICEOVER", es: "VOICEOVER" }, language),    icon: Mic,         color: "text-purple-400",  active: "bg-purple-500/20 border-purple-400/60" },
            { key: "editor",         label: tr({ en: "EDITOR", es: "EDITOR" }, language),          icon: Scissors,    color: "text-emerald-400", active: "bg-emerald-500/20 border-emerald-400/60" },
            { key: "text_on_screen", label: tr({ en: "TEXT", es: "TEXTO" }, language),             icon: MonitorPlay, color: "text-zinc-400",    active: "bg-zinc-500/20 border-zinc-400/60" },
          ];
          return (
            <div key={section} className="space-y-2">
              <div className="flex items-center gap-3">
                <div className={`inline-flex items-center gap-2 text-xs font-bold tracking-widest px-3 py-1 rounded-full border ${sectionBadge[section]}`}>
                  {tr(sectionLabels[section], language)}
                </div>
                <span className="text-[10px] text-muted-foreground/50 italic">
                  {tr({ en: "double-click to edit", es: "doble clic para editar" }, language)}
                </span>
              </div>
              <div className="space-y-2">
                {sectionEntries.map(({ line, globalIdx }: { line: any; globalIdx: number }) => {
                  const cfg = lineTypeConfig[line.line_type] || lineTypeConfig.actor;
                  const Icon = cfg.icon;
                  const isEditing = editingLineIdx === globalIdx;

                  if (isEditing) {
                    // ── Edit mode ──
                    const activeEditCfg = lineTypeConfig[editingLineType] || lineTypeConfig.actor;
                    return (
                      <div
                        key={globalIdx}
                        className={`rounded-2xl border-2 border-cyan-400/40 bg-card/80 backdrop-blur-sm overflow-hidden shadow-lg shadow-cyan-400/5`}
                      >
                        {/* Line type selector */}
                        <div className="flex gap-1 p-3 border-b border-border/40 flex-wrap">
                          {editableLineTypes.map((lt) => {
                            const LtIcon = lt.icon;
                            const isActive = editingLineType === lt.key;
                            return (
                              <button
                                key={lt.key}
                                onClick={() => setEditingLineType(lt.key)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                  isActive
                                    ? `${lt.active} ${lt.color}`
                                    : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                                }`}
                              >
                                <LtIcon className="w-3 h-3" />
                                {lt.label}
                              </button>
                            );
                          })}
                        </div>
                        {/* Text editor */}
                        <div className="p-3 space-y-3">
                          <Textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full text-sm bg-transparent border-border/60 focus:border-primary/60 rounded-xl resize-none min-h-[80px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Escape") cancelLineEdit();
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveLineEdit();
                            }}
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-[10px] text-muted-foreground/50 mr-auto">
                              {tr({ en: "⌘↵ save · Esc cancel", es: "⌘↵ guardar · Esc cancelar" }, language)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelLineEdit}
                              className="h-7 px-3 text-xs rounded-lg text-muted-foreground"
                            >
                              {tr({ en: "Cancel", es: "Cancelar" }, language)}
                            </Button>
                            <Button
                              size="sm"
                              onClick={saveLineEdit}
                              className="h-7 px-3 text-xs rounded-lg bg-cyan-400 text-white gap-1"
                            >
                              <Check className="w-3 h-3" />
                              {tr({ en: "Save", es: "Guardar" }, language)}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // ── Display mode ──
                  return (
                    <div
                      key={globalIdx}
                      onDoubleClick={() => startEditLine(globalIdx)}
                      title={tr({ en: "Double-click to edit", es: "Doble clic para editar" }, language)}
                      className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all hover:brightness-110 hover:shadow-sm group ${cfg.bg} ${cfg.border}`}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center mt-0.5">
                        <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <p className="text-sm text-foreground leading-relaxed mt-1.5">{line.text}</p>
                      </div>
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center">
                          <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </div>
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
              <span className="text-xs text-cyan-400 font-bold whitespace-nowrap">{lengthLabels[scriptLength]}</span>
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
                      ? "bg-cyan-400/20 border-cyan-400/40 text-cyan-400"
                      : "border-border text-muted-foreground hover:border-cyan-400/30 hover:text-foreground bg-card"
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
              className="w-full h-11 text-sm font-semibold rounded-xl bg-cyan-400 hover:bg-cyan-500 text-white gap-2"
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

  // ==================== CAPTION MODE CONFIG ====================
  const isCaptionMode = videoType === "caption_video_music" && typeConfirmed;

  const CAPTION_STEPS = [
    { num: 1 as Step, icon: Film,      label: { en: "Setup",  es: "Configuración" } },
    { num: 2 as Step, icon: AlignLeft, label: { en: "Script", es: "Script" } },
  ];

  const activeSteps = isCaptionMode
    ? CAPTION_STEPS
    : isStorytellingMode
      ? STEPS.map(s => {
          if (s.num === 1) return { ...s, label: { en: "Tell Your Story", es: "Cuenta Tu Historia" } };
          if (s.num === 2) return { ...s, label: { en: "Story Moments", es: "Momentos de la Historia" } };
          return s;
        })
      : STEPS;

  // ==================== TYPE DETECTION PANEL ====================
  const renderTypeDetectionPanel = () => (
    <div className="px-4 sm:px-6 py-4 max-w-3xl mx-auto">
      <div className="rounded-2xl border border-cyan-400/25 bg-card/50 backdrop-blur-sm overflow-hidden">
        {/* Panel header */}
        <div className="px-5 py-4 border-b border-border/30">
          <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-0.5">
            {tr({ en: "Detecting video type...", es: "Detectando tipo de video..." }, language)}
          </p>
          {!transcribing && (
            <p className="text-sm text-muted-foreground">
              {tr({ en: "Choose the type that matches this video, then confirm to start.", es: "Elige el tipo que coincide con este video y confirma para comenzar." }, language)}
            </p>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Transcribing glass progress bar — single bar */}
          {transcribing && (() => {
            const phases = [
              { phase: 1, en: "Transcribing…", es: "Transcribiendo…", pct: 15 },
              { phase: 2, en: "Analyzing…",    es: "Analizando…",      pct: 55 },
              { phase: 3, en: "Categorizing…", es: "Categorizando…",   pct: 80 },
            ] as const;
            const current = phases.find(p => p.phase === transcribePhase) ?? phases[0];
            return (
              <div className="relative h-9 rounded-full overflow-hidden border border-cyan-400/40 bg-transparent">
                {/* Fill — cream at 5% opacity */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${current.pct}%`,
                    background: "rgba(255, 248, 220, 0.05)",
                  }}
                />
                {/* Label + pct centered over the bar */}
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  <span className="text-xs font-semibold text-cyan-400/80">
                    {tr({ en: current.en, es: current.es }, language)}
                  </span>
                  <span className="text-xs font-mono text-cyan-400/60">
                    {current.pct}%
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Type toggle buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Caption Video + Music */}
            <button
              onClick={() => { setVideoType("caption_video_music"); setIsStorytellingMode(false); }}
              className={`text-left p-5 rounded-2xl border transition-all duration-200 ${
                videoType === "caption_video_music"
                  ? "bg-gradient-to-br from-cyan-400/25 to-cyan-400/15 border-cyan-400/60 ring-1 ring-cyan-400/30"
                  : "bg-card border-border/60 hover:border-cyan-400/40 hover:bg-cyan-400/5"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-cyan-400/20 flex items-center justify-center">
                    <Music className="w-5 h-5 text-cyan-400" />
                  </div>
                  {videoType === "caption_video_music" && (
                    <span className="text-[10px] font-bold bg-cyan-400/20 text-cyan-400 border border-cyan-400/30 px-2 py-0.5 rounded-full">
                      {tr({ en: "Selected", es: "Seleccionado" }, language)}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">
                    {tr({ en: "Caption Video + Music", es: "Video Caption + Música" }, language)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {tr({ en: "Story told through short text overlays synced to a beat. Minimal speech.", es: "Historia a través de texto corto sincronizado con un beat. Mínimo habla." }, language)}
                  </p>
                </div>
              </div>
            </button>

            {/* Talking Head / Voiceover */}
            <button
              onClick={() => setVideoType("talking_head")}
              className={`text-left p-5 rounded-2xl border transition-all duration-200 ${
                videoType === "talking_head"
                  ? "bg-gradient-to-br from-cyan-400/25 to-cyan-400/15 border-cyan-400/60 ring-1 ring-cyan-400/30"
                  : "bg-card border-border/60 hover:border-cyan-400/40 hover:bg-cyan-400/5"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-cyan-400/20 flex items-center justify-center">
                    <Mic className="w-5 h-5 text-cyan-400" />
                  </div>
                  {videoType === "talking_head" && (
                    <span className="text-[10px] font-bold bg-cyan-400/20 text-cyan-400 border border-cyan-400/30 px-2 py-0.5 rounded-full">
                      {tr({ en: "Selected", es: "Seleccionado" }, language)}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">
                    {tr({ en: "Talking Head / Voiceover", es: "Talking Head / Voz en Off" }, language)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {tr({ en: "Person speaking to camera, or narration over footage with natural speech.", es: "Persona hablando a cámara o narración sobre imágenes." }, language)}
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Sub-toggle: shown when Talking Head is selected — Standard vs Storytelling */}
          {videoType === "talking_head" && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                {tr({ en: "Content style — toggle to switch:", es: "Estilo de contenido — toca para cambiar:" }, language)}
                {isStorytellingMode && (
                  <span className="ml-2 text-cyan-400 normal-case font-normal">
                    {tr({ en: "✨ detected from transcript", es: "✨ detectado del transcripto" }, language)}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {/* Standard talking head */}
                <button
                  onClick={(e) => { e.stopPropagation(); setIsStorytellingMode(false); }}
                  className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                    !isStorytellingMode
                      ? "bg-cyan-400/15 border-cyan-400/50 ring-1 ring-cyan-400/20"
                      : "bg-muted/20 border-border/40 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Search className={`w-4 h-4 mt-0.5 flex-shrink-0 ${!isStorytellingMode ? "text-cyan-400" : "text-muted-foreground"}`} />
                    <div>
                      <p className={`text-xs font-semibold ${!isStorytellingMode ? "text-foreground" : "text-muted-foreground"}`}>
                        {tr({ en: "Standard", es: "Estándar" }, language)}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {tr({ en: "AI researches facts about your topic", es: "La IA investiga datos sobre tu tema" }, language)}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Storytelling */}
                <button
                  onClick={(e) => { e.stopPropagation(); setIsStorytellingMode(true); }}
                  className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                    isStorytellingMode
                      ? "bg-cyan-400/15 border-cyan-400/50 ring-1 ring-cyan-400/20"
                      : "bg-muted/20 border-border/40 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isStorytellingMode ? "text-cyan-400" : "text-muted-foreground"}`} />
                    <div>
                      <p className={`text-xs font-semibold ${isStorytellingMode ? "text-foreground" : "text-muted-foreground"}`}>
                        {tr({ en: "Storytelling", es: "Storytelling" }, language)}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {tr({ en: "You share your story, AI extracts key moments", es: "Tú cuentas tu historia, la IA extrae momentos clave" }, language)}
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Transcription snippet (collapsed) */}
          {transcription && (
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {tr({ en: "Transcription detected", es: "Transcripción detectada" }, language)}
              </p>
              <p className="text-xs text-muted-foreground/80 italic line-clamp-2">
                "{transcription.slice(0, 120)}{transcription.length > 120 ? "…" : ""}"
              </p>
            </div>
          )}

          {/* Confirm button */}
          <Button
            onClick={() => {
              if (!videoType) return;
              setTypeConfirmed(true);
              // Step 1 is now "Tell Your Story" for storytelling — no skip needed
            }}
            disabled={!videoType || transcribing}
            className="w-full h-12 text-base font-semibold rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-400 border border-cyan-400/40 gap-3"
          >
            <Check className="w-5 h-5" />
            {videoType === "caption_video_music"
              ? tr({ en: "Confirm: Caption Video Flow →", es: "Confirmar: Flujo Caption Video →" }, language)
              : isStorytellingMode
                ? tr({ en: "Confirm: Storytelling Flow →", es: "Confirmar: Flujo Storytelling →" }, language)
                : tr({ en: "Confirm: Talking Head Flow →", es: "Confirmar: Flujo Talking Head →" }, language)
            }
          </Button>
        </div>
      </div>
    </div>
  );

  // ==================== CAPTION STEP 1: TOPIC ====================
  const renderCaptionStep1 = () => {
    const canGenerate = captionTopic.trim().length > 0;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2 pb-2">
          <h2 className="text-2xl font-bold text-foreground">
            {tr({ en: "What do you want to talk about?", es: "¿De qué quieres hablar?" }, language)}
          </h2>
          <p className="text-muted-foreground text-sm">
            {tr({
              en: "Describe your topic — AI will generate a full visual storyboard with clip instructions and captions.",
              es: "Describe tu tema — la IA generará un storyboard visual completo con instrucciones de clips y captions.",
            }, language)}
          </p>
        </div>

        {/* Topic input */}
        <div className="space-y-2">
          <div className="relative">
            <Music className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" />
            <Input
              value={captionTopic}
              onChange={(e) => setCaptionTopic(e.target.value)}
              placeholder={tr({
                en: "e.g. How I went from broke to $10K/month in 6 months...",
                es: "ej. Cómo pasé de cero a $10K/mes en 6 meses...",
              }, language)}
              className="pl-12 pr-4 py-4 text-base bg-card border-border/60 focus:border-primary/60 rounded-xl h-14"
              onKeyDown={(e) => { if (e.key === "Enter" && canGenerate) handleGenerateCaptionScript(); }}
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground px-1">
            {tr({
              en: "The AI will create interleaved clip directions + on-screen captions (hook → body → cta).",
              es: "La IA creará instrucciones de clips + captions entrelazados (hook → body → cta).",
            }, language)}
          </p>
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerateCaptionScript}
          disabled={!canGenerate || captionGenerating}
          className="w-full h-14 text-base font-semibold rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-400 border border-cyan-400/40 gap-3"
        >
          {captionGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {tr({ en: "Writing visual script…", es: "Escribiendo script visual…" }, language)}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              {tr({ en: "Generate Visual Script", es: "Generar Script Visual" }, language)}
              <ArrowRight className="w-5 h-5 ml-auto" />
            </>
          )}
        </Button>
      </div>
    );
  };

  // ==================== CAPTION STEP 2: SCRIPT OUTPUT ====================
  const renderCaptionStep2 = () => renderStep5();

  // ==================== MAIN RENDER ====================
  return (
    <div className="flex gap-4 items-start min-h-screen">
    {/* ── Wizard steps (takes remaining width) ── */}
    <div className="flex-1 min-w-0">
    <div className="min-h-screen">
      {/* Close / Back button */}
      <div className="px-4 sm:px-6 pt-4 pb-0 max-w-3xl mx-auto flex justify-end">
        <button
          onClick={handleLeaveRequest}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border/60 hover:border-border bg-card/50"
        >
          <X className="w-3.5 h-3.5" />
          {tr({ en: "Exit Wizard", es: "Salir del Wizard" }, language)}
        </button>
      </div>
      {/* Remix Banner */}
      {initialTemplateVideo && (
        <div className="px-4 sm:px-6 pt-4 pb-0">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-400/10 border border-cyan-400/25 max-w-3xl mx-auto">
            {initialTemplateVideo.thumbnail_url && (
              <img
                src={`https://wsrv.nl/?url=${encodeURIComponent(initialTemplateVideo.thumbnail_url)}&w=80&output=webp`}
                className="w-10 h-14 rounded-lg object-cover flex-shrink-0"
                alt=""
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-0.5">
                {tr({ en: "Remixing from viral video", es: "Remixeando video viral" }, language)}
              </p>
              <p className="text-sm text-foreground font-semibold truncate">
                @{initialTemplateVideo.channel_username}
              </p>
              {initialTemplateVideo.caption && (
                <p className="text-xs text-muted-foreground truncate">{initialTemplateVideo.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visual Breakdown — shown when remixing, as soon as segments arrive */}
      {initialTemplateVideo && (transcribing || videoVisualSegments.length > 0) && (
        <div className="px-4 sm:px-6 pt-4">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-foreground">Visual Breakdown</span>
              {transcribing && videoVisualSegments.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analyzing video...
                </div>
              )}
              {videoVisualSegments.length > 0 && (
                <span className="text-xs text-muted-foreground">{videoVisualSegments.length} segments</span>
              )}
            </div>

            {/* Horizontal scroll strip */}
            <div className="visual-breakdown-scroll flex gap-2.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
              {transcribing && videoVisualSegments.length === 0
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-36 rounded-xl bg-muted/40 border border-border animate-pulse"
                      style={{ height: 290 }}
                    />
                  ))
                : videoVisualSegments.map((seg, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-36 rounded-xl overflow-hidden bg-card border border-border shadow-sm flex flex-col"
                    >
                      {/* Description text */}
                      <div className="p-2.5 min-h-[52px] flex items-start">
                        <p className="text-[11px] text-foreground/90 leading-snug">{seg.description}</p>
                      </div>

                      {/* Frame / thumbnail */}
                      <div className="relative bg-black flex-shrink-0" style={{ aspectRatio: "9/16" }}>
                        {seg.frame_base64 ? (
                          <img
                            src={`data:${seg.frame_type || "image/jpeg"};base64,${seg.frame_base64}`}
                            className="w-full h-full object-cover"
                            alt={seg.description}
                          />
                        ) : initialTemplateVideo.thumbnail_url ? (
                          <img
                            src={`https://wsrv.nl/?url=${encodeURIComponent(initialTemplateVideo.thumbnail_url)}&w=200&output=webp`}
                            className="w-full h-full object-cover opacity-60"
                            alt=""
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Film className="w-8 h-8 text-muted-foreground/40" />
                          </div>
                        )}
                        {/* Timestamp */}
                        <div className="absolute bottom-1.5 inset-x-0 flex justify-center">
                          <span className="text-[10px] font-mono text-white bg-black/70 rounded px-1.5 py-0.5">
                            {formatTime(seg.start)} – {formatTime(seg.end)}
                          </span>
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="p-2">
                        <textarea
                          placeholder="Type notes..."
                          value={seg.notes || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVideoVisualSegments((prev) =>
                              prev.map((s, idx) => (idx === i ? { ...s, notes: val } : s))
                            );
                          }}
                          className="w-full text-[11px] bg-transparent border border-border/60 rounded-lg p-1.5 text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}

      {/* Type Detection Panel (shown when remixing before type is confirmed) */}
      {initialTemplateVideo && !typeConfirmed && renderTypeDetectionPanel()}

      {/* Vertical Steps (shown after type confirmed, or when not remixing) */}
      {(!initialTemplateVideo || typeConfirmed) && (
        <div className="px-4 sm:px-6 py-4 max-w-3xl mx-auto space-y-3">
          {activeSteps.map(({ num, icon: Icon, label }) => {
            const isActive = currentStep === num;
            const isLocked = num > maxUnlockedStep;
            const isComplete = !isActive && !isLocked; // unlocked + not current = completed

            return (
              <div
                key={num}
                className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                  isActive
                    ? "glass-card glass-card-cyan shadow-md shadow-[rgba(8,145,178,0.08)]"
                    : isComplete
                      ? "glass-card"
                      : "glass-card opacity-40 pointer-events-none"
                }`}
              >
                {/* Step header row */}
                <button
                  onClick={() => !isLocked && jumpTo(num as Step)}
                  disabled={isLocked}
                  className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${
                    isComplete && !isActive ? "hover:bg-white/5 cursor-pointer" : "cursor-default"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                    isComplete
                      ? "bg-[#0891B2] text-white"
                      : isActive
                        ? "bg-[rgba(8,145,178,0.15)] text-[#22d3ee] border-2 border-[rgba(34,211,238,0.6)]"
                        : "bg-muted/50 text-muted-foreground/40"
                  }`}>
                    {isComplete ? <Check className="w-3.5 h-3.5" /> : num}
                  </div>
                  <span className={`font-semibold text-sm flex-1 ${
                    isActive ? "text-foreground" : isComplete ? "text-foreground/70" : "text-muted-foreground/40"
                  }`}>
                    {tr(label, language)}
                  </span>
                  {isComplete && (
                    <span className="text-[11px] text-[#22d3ee]/70 font-medium">
                      {tr({ en: "Done — tap to revisit", es: "Listo — toca para revisar" }, language)}
                    </span>
                  )}
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse flex-shrink-0" />}
                </button>

                {/* Step content */}
                {isActive && (
                  <div className="border-t border-border/30 px-5 pt-5 pb-6">
                    {/* Return banner — shown when revisiting a completed step */}
                    {currentStep < maxUnlockedStep && (
                      <div className="mb-4 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-cyan-400/8 border border-cyan-400/25">
                        <span className="text-xs text-muted-foreground leading-snug">
                          {tr({ en: "Revisiting — your later progress is saved", es: "Revisando — tu progreso posterior está guardado" }, language)}
                        </span>
                        <button
                          onClick={() => jumpTo(maxUnlockedStep as Step)}
                          className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold text-cyan-400 hover:text-cyan-400 transition-colors"
                        >
                          {tr({ en: "Back to Step", es: "Ir al Paso" }, language)} {maxUnlockedStep}
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {isCaptionMode ? (
                      <>
                        {num === 1 && renderCaptionStep1()}
                        {num === 2 && renderCaptionStep2()}
                      </>
                    ) : (
                      <>
                        {num === 1 && renderStep1()}
                        {num === 2 && renderStep2()}
                        {num === 3 && renderStep3()}
                        {num === 4 && renderStep4()}
                        {num === 5 && renderStep5()}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>{/* end wizard flex-1 */}


    {/* Leave Confirmation Dialog */}
    <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr({ en: "Leave Script Wizard?", es: "¿Salir del Wizard de Script?" }, language)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {tr({ en: "Your progress won't be saved. Are you sure you want to leave?", es: "Tu progreso no se guardará. ¿Seguro que deseas salir?" }, language)}
        </p>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setShowLeaveConfirm(false)}>
            {tr({ en: "Stay", es: "Quedarme" }, language)}
          </Button>
          <Button variant="destructive" onClick={confirmLeave}>
            {tr({ en: "Leave", es: "Salir" }, language)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
  );
}

// ==================== Browse All Hooks Content ====================
function BrowseAllContent({ language, onSelect }: { language: "en" | "es"; onSelect: (hook: HookFormula) => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  const toggleCategory = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const filteredHooks = VIRAL_HOOK_FORMULAS.filter(h => {
    if (activeCategories.size > 0 && !activeCategories.has(h.category)) return false;
    if (debouncedSearch && !h.template.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={tr({ en: "Search hooks...", es: "Buscar hooks..." }, language)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(HOOK_CATEGORY_META) as [HookCategory, typeof HOOK_CATEGORY_META[HookCategory]][]).map(([key, meta]) => {
          const IconComp = HOOK_ICON_MAP[meta.icon];
          const isActive = activeCategories.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleCategory(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                isActive
                  ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-400"
                  : "bg-card border-border/40 text-muted-foreground hover:border-border"
              }`}
            >
              {IconComp && <IconComp className="w-3 h-3" />}
              {tr(meta.label, language)}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{ maxHeight: "50vh" }}>
        {filteredHooks.map(hook => {
          const meta = HOOK_CATEGORY_META[hook.category as HookCategory];
          const IconComp = meta ? HOOK_ICON_MAP[meta.icon] : BookOpen;
          return (
            <button
              key={hook.id}
              onClick={() => onSelect(hook)}
              className="w-full text-left p-3 rounded-xl border border-border/40 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all"
            >
              <p className="text-xs text-foreground italic leading-relaxed">&quot;{hook.template}&quot;</p>
              <div className="flex items-center gap-2 mt-1.5">
                {IconComp && <IconComp className="w-3 h-3 text-muted-foreground" />}
                <span className="text-[10px] text-muted-foreground">{tr(meta?.label || { en: hook.category, es: hook.category }, language)}</span>
              </div>
            </button>
          );
        })}
        {filteredHooks.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            {tr({ en: "No hooks match your search", es: "No hay hooks que coincidan" }, language)}
          </p>
        )}
      </div>
    </>
  );
}

// Default export for backward compatibility
export default AIScriptWizard;
