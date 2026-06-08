import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RichTextField from "./RichTextField";
import ProfilesField from "./ProfilesField";
import type { OnboardingData } from "@/lib/onboarding/types";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY",
];

interface OnboardingFormBodyProps {
  formData: OnboardingData;
  onChange: (field: keyof OnboardingData, value: string | string[]) => void;
  /** "self" = the client filling their own form ("your"); "thirdParty" = admin ("their"). */
  perspective: "self" | "thirdParty";
}

function SectionHeader({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-foreground md:mb-6 md:text-xl">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold">
        {n}
      </span>
      {children}
    </h2>
  );
}

export default function OnboardingFormBody({ formData, onChange, perspective }: OnboardingFormBodyProps) {
  const self = perspective === "self";
  const you = self ? "you" : "they"; // subject, lowercase
  const Subj = self ? "You" : "They"; // subject, capitalized
  const your = self ? "your" : "their"; // possessive, lowercase
  const Your = self ? "Your" : "Their"; // possessive, capitalized

  return (
    <div className="space-y-8 md:space-y-12">
      {/* 1 — Basic Information */}
      <div>
        <SectionHeader n={1}>Basic Information</SectionHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div className="space-y-2">
            <Label htmlFor="clientName">{self ? "Your Name" : "Client Name"} *</Label>
            <Input
              id="clientName"
              placeholder="e.g., John Smith"
              value={formData.clientName}
              onChange={(e) => onChange("clientName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder={self ? "your@email.com" : "client@example.com"}
              value={formData.email}
              onChange={(e) => onChange("email", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2 — Social Media Accounts */}
      <div className="border-t border-border/50 pt-8 md:pt-12">
        <SectionHeader n={2}>Social Media Accounts</SectionHeader>
        <div className="space-y-4 md:space-y-6">
          {([
            ["instagram", "Instagram"],
            ["tiktok", "TikTok"],
            ["youtube", "YouTube"],
            ["facebook", "Facebook"],
          ] as const).map(([key, label]) => (
            <div key={key} className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <div className="space-y-2">
                <Label htmlFor={key}>{label} Handle</Label>
                <Input
                  id={key}
                  placeholder="@username"
                  value={formData[key]}
                  onChange={(e) => onChange(key, e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${key}Password`}>{label} Password</Label>
                <Input
                  id={`${key}Password`}
                  type="text"
                  placeholder="Password"
                  value={formData[`${key}Password` as keyof OnboardingData] as string}
                  onChange={(e) => onChange(`${key}Password` as keyof OnboardingData, e.target.value)}
                />
              </div>
            </div>
          ))}

          {/* Profiles to emulate — sits right behind the socials */}
          <div className="space-y-2 pt-2">
            <Label>Profiles {Subj} Want to Emulate</Label>
            <p className="text-xs text-muted-foreground">
              Add the accounts {you} admire — handles or links. Use “Add another” for more.
            </p>
            <ProfilesField
              value={formData.top3Profiles}
              onChange={(next) => onChange("top3Profiles", next)}
            />
          </div>
        </div>
      </div>

      {/* 3 — Business Details */}
      <div className="border-t border-border/50 pt-8 md:pt-12">
        <SectionHeader n={3}>Business Details</SectionHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div className="space-y-2">
            <Label htmlFor="package">Package</Label>
            <Select value={formData.package} onValueChange={(v) => onChange("package", v)}>
              <SelectTrigger id="package">
                <SelectValue placeholder="Select package" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adBudget">Monthly Ad Budget</Label>
            <Input
              id="adBudget"
              placeholder="$5,000"
              value={formData.adBudget}
              onChange={(e) => onChange("adBudget", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Select value={formData.industry} onValueChange={(v) => onChange("industry", v)}>
              <SelectTrigger id="industry">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
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
            {formData.industry === "other" && (
              <Input
                id="industryOther"
                placeholder="Please specify the industry"
                value={formData.industryOther}
                onChange={(e) => onChange("industryOther", e.target.value)}
                className="mt-2"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Select value={formData.state} onValueChange={(v) => onChange("state", v)}>
              <SelectTrigger id="state">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 4 — Brand & Messaging (rich text) */}
      <div className="border-t border-border/50 pt-8 md:pt-12">
        <SectionHeader n={4}>Brand &amp; Messaging</SectionHeader>
        <div className="space-y-5 md:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="uniqueOffer">What is {your} unique offer?</Label>
            <RichTextField
              id="uniqueOffer"
              value={formData.uniqueOffer}
              onChange={(html) => onChange("uniqueOffer", html)}
              placeholder={`Describe ${your} unique value proposition…`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uniqueValues">Top 5 Unique Values {Subj} Can Teach</Label>
            <RichTextField
              id="uniqueValues"
              value={formData.uniqueValues}
              onChange={(html) => onChange("uniqueValues", html)}
              placeholder={`List 5 things ${you} can confidently teach`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="competition">What Differentiates {self ? "You" : "Them"} From Competition?</Label>
            <RichTextField
              id="competition"
              value={formData.competition}
              onChange={(html) => onChange("competition", html)}
              placeholder={`What makes ${you} different from competitors…`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="story">{Your} Story</Label>
            <RichTextField
              id="story"
              value={formData.story}
              onChange={(html) => onChange("story", html)}
              placeholder={`What's ${your} background and journey?`}
            />
          </div>
        </div>
      </div>

      {/* 5 — Market & Goals */}
      <div className="border-t border-border/50 pt-8 md:pt-12">
        <SectionHeader n={5}>Market &amp; Goals</SectionHeader>
        <div className="space-y-5 md:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="targetClient">Who is {Your} Target Client?</Label>
            <RichTextField
              id="targetClient"
              value={formData.targetClient}
              onChange={(html) => onChange("targetClient", html)}
              placeholder={`Describe ${your} ideal customer…`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="callLink">Link to {Your} Call/Calendar</Label>
            <Input
              id="callLink"
              placeholder="https://calendly.com/... or https://zoom.us/..."
              value={formData.callLink}
              onChange={(e) => onChange("callLink", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="additionalNotes">Additional Notes</Label>
            <RichTextField
              id="additionalNotes"
              value={formData.additionalNotes}
              onChange={(html) => onChange("additionalNotes", html)}
              placeholder="Any other important details…"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
