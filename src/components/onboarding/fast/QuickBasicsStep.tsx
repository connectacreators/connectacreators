import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { OnboardingData } from "@/lib/onboarding/types";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY",
];

interface QuickBasicsStepProps {
  formData: OnboardingData;
  onChange: (field: keyof OnboardingData, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Compact, single-column structured fields for FAST mode (typed, not voice). */
export default function QuickBasicsStep({ formData, onChange, onNext, onBack }: QuickBasicsStepProps) {
  const canContinue = formData.clientName.trim() && formData.email.trim();

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-md flex-col px-5 pt-6">
      <div className="mb-5 shrink-0">
        <h2 className="text-xl font-bold text-foreground">A few quick details</h2>
        <p className="mt-1 text-sm text-muted-foreground">Last step — these are faster to type.</p>
      </div>

      <div className="flex-1 space-y-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="q-name">Your name *</Label>
          <Input id="q-name" placeholder="e.g., John Smith" value={formData.clientName} onChange={(e) => onChange("clientName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-email">Email *</Label>
          <Input id="q-email" type="email" placeholder="your@email.com" value={formData.email} onChange={(e) => onChange("email", e.target.value)} />
        </div>

        <div className="pt-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Social accounts</p>
          <div className="space-y-3">
            {([
              ["instagram", "Instagram"],
              ["tiktok", "TikTok"],
              ["youtube", "YouTube"],
              ["facebook", "Facebook"],
            ] as const).map(([key, label]) => (
              <div key={key} className="grid grid-cols-2 gap-2">
                <Input placeholder={`${label} @handle`} value={formData[key]} onChange={(e) => onChange(key, e.target.value)} />
                <Input placeholder="Password" value={formData[`${key}Password` as keyof OnboardingData] as string} onChange={(e) => onChange(`${key}Password` as keyof OnboardingData, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="q-package">Package</Label>
            <Select value={formData.package} onValueChange={(v) => onChange("package", v)}>
              <SelectTrigger id="q-package"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-budget">Ad budget / mo</Label>
            <Input id="q-budget" placeholder="$5,000" value={formData.adBudget} onChange={(e) => onChange("adBudget", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-industry">Industry</Label>
            <Select value={formData.industry} onValueChange={(v) => onChange("industry", v)}>
              <SelectTrigger id="q-industry"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="fitness">Fitness</SelectItem>
                <SelectItem value="realestate">Real Estate</SelectItem>
                <SelectItem value="services">Services</SelectItem>
                <SelectItem value="coaching">Coaching</SelectItem>
                <SelectItem value="saas">SaaS</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-state">State</Label>
            <Select value={formData.state} onValueChange={(v) => onChange("state", v)}>
              <SelectTrigger id="q-state"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {formData.industry === "other" && (
          <Input placeholder="Please specify the industry" value={formData.industryOther} onChange={(e) => onChange("industryOther", e.target.value)} />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="q-call">Link to your call/calendar</Label>
          <Input id="q-call" placeholder="https://calendly.com/..." value={formData.callLink} onChange={(e) => onChange("callLink", e.target.value)} />
        </div>
      </div>

      {/* Bottom nav */}
      <div
        className="sticky bottom-0 -mx-5 flex items-center gap-3 border-t border-border/50 bg-background/95 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Review
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
