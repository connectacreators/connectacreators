import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, FileDown } from "lucide-react";
import VoiceAnswerCard from "./VoiceAnswerCard";
import QuickBasicsStep from "./QuickBasicsStep";
import ReviewStep, { type ReviewItem } from "./ReviewStep";
import { parseSpokenList, profilesToText, stripHtml } from "@/lib/onboarding/richText";
import { exportOnboardingPdf } from "@/lib/onboarding/exportPdf";
import { toast } from "sonner";
import type { OnboardingData } from "@/lib/onboarding/types";

interface FastOnboardingFlowProps {
  formData: OnboardingData;
  onChange: (field: keyof OnboardingData, value: string | string[]) => void;
  onAutosave: () => void;
  onSubmit: () => Promise<boolean>;
  saving: boolean;
  onSwitchToStandard: () => void;
  /** Live AI follow-up questions while recording (admin-gated). */
  aiCoach?: boolean;
}

type VoiceQ = { key: keyof OnboardingData; question: string; helper?: string; optional?: boolean; isProfiles?: boolean; coach?: boolean };

const VOICE_QS: VoiceQ[] = [
  { key: "uniqueOffer", question: "What's your unique offer?", helper: "What do you do, and who is it for?", coach: true },
  { key: "uniqueValues", question: "What are 5 things you can explain really well?", helper: "5 teachings or values you're great at breaking down.", coach: true },
  { key: "competition", question: "What makes you different?", helper: "Why you, over a competitor?", coach: true },
  { key: "contrarianBeliefs", question: "What are your contrarian beliefs?", helper: "Where do you disagree with other experts in your space?", coach: true },
  { key: "story", question: "Tell us your story — take your time.", helper: "Where you started, the turning point, the struggles, the wins, and why you do this. The more detail, the better.", coach: true },
  { key: "targetClient", question: "Who's your ideal client?", helper: "Describe the person you want to reach.", coach: true },
  { key: "top3Profiles", question: "Which creators do you admire?", helper: "Say a few names — e.g. “Gary Vee, Alex Hormozi.”", isProfiles: true },
  { key: "additionalNotes", question: "Anything else we should know?", helper: "Optional — anything we missed.", optional: true },
];

const N = VOICE_QS.length;
const BASICS = N; // position of the basics step
const REVIEW = N + 1;
const TOTAL = N + 2;

export default function FastOnboardingFlow({
  formData,
  onChange,
  onAutosave,
  onSubmit,
  saving,
  onSwitchToStandard,
  aiCoach,
}: FastOnboardingFlowProps) {
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const go = (next: number) => {
    setDir(next > pos ? 1 : -1);
    setPos(Math.max(0, Math.min(REVIEW, next)));
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  // Debounced autosave whenever answers change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onAutosave(), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const valueFor = (q: VoiceQ): string =>
    q.isProfiles ? profilesToText(formData.top3Profiles, ", ") : stripHtml(formData[q.key]);

  const changeFor = (q: VoiceQ) => (text: string) => {
    if (q.isProfiles) onChange("top3Profiles", parseSpokenList(text));
    else onChange(q.key, text);
  };

  const reviewItems: ReviewItem[] = useMemo(() => {
    const voiceItems = VOICE_QS.map((q, i) => ({
      label: q.question,
      value: valueFor(q),
      onEdit: () => go(i),
    }));
    const basicsSummary = [
      formData.clientName && `Name: ${formData.clientName}`,
      formData.email && `Email: ${formData.email}`,
      formData.instagram && `IG: ${formData.instagram}`,
      formData.package && `Package: ${formData.package}`,
    ]
      .filter(Boolean)
      .join("  ·  ");
    return [
      ...voiceItems,
      { label: "Your details", value: basicsSummary, onEdit: () => go(BASICS) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const handleSubmit = async () => {
    const ok = await onSubmit();
    if (ok) setSubmitted(true);
  };

  const handleExportPdf = () => {
    try {
      exportOnboardingPdf(formData, { name: formData.clientName });
    } catch {
      toast.error("Allow pop-ups to export the PDF.");
    }
  };

  // Progress (hidden on the success screen).
  const progress = Math.round(((pos + 1) / TOTAL) * 100);

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
          <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">All done — thank you!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your answers are saved. Our team will take it from here.
        </p>
        <button
          type="button"
          onClick={handleExportPdf}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <FileDown className="h-4 w-4" />
          Export answers (PDF)
        </button>
      </div>
    );
  }

  const renderStep = () => {
    if (pos < N) {
      const q = VOICE_QS[pos];
      return (
        <VoiceAnswerCard
          question={q.question}
          helper={q.helper}
          value={valueFor(q)}
          onChange={changeFor(q)}
          onNext={() => go(pos + 1)}
          onBack={() => go(pos - 1)}
          canBack={pos > 0}
          optional={q.optional}
          onSkip={() => go(pos + 1)}
          isLast={pos === N - 1}
          coachEnabled={!!aiCoach && !!q.coach}
        />
      );
    }
    if (pos === BASICS) {
      return (
        <QuickBasicsStep
          formData={formData}
          onChange={(field, value) => onChange(field, value)}
          onNext={() => go(REVIEW)}
          onBack={() => go(N - 1)}
        />
      );
    }
    return <ReviewStep items={reviewItems} onBack={() => go(BASICS)} onSubmit={handleSubmit} saving={saving} onExportPdf={handleExportPdf} />;
  };

  return (
    <div className="relative">
      {/* Sticky progress + switch-to-typing */}
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/90 px-5 pt-3 pb-2 backdrop-blur" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <button
          type="button"
          onClick={onSwitchToStandard}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Keyboard className="h-3.5 w-3.5" />
          Type
        </button>
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={pos}
          custom={dir}
          initial={{ opacity: 0, x: dir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -40 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          // Swipe only on the voice cards — basics/review have inputs + scroll.
          drag={pos < N ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={(_, info) => {
            if (info.offset.x < -80 && pos < N) go(pos + 1);
            else if (info.offset.x > 80 && pos > 0) go(pos - 1);
          }}
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
