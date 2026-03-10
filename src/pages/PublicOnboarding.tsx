import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, CheckCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY"
];

const PublicOnboarding = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    clientName: "",
    email: "",
    instagram: "",
    instagramPassword: "",
    tiktok: "",
    tiktokPassword: "",
    youtube: "",
    youtubePassword: "",
    facebook: "",
    facebookPassword: "",
    package: "",
    adBudget: "",
    top3Profiles: "",
    targetClient: "",
    industry: "",
    industryOther: "",
    state: "",
    uniqueOffer: "",
    uniqueValues: "",
    competition: "",
    story: "",
    callLink: "",
    additionalNotes: ""
  });

  // Load client data on mount
  useEffect(() => {
    if (!clientId) {
      toast.error("No client ID provided");
      setLoading(false);
      return;
    }

    const fetchClientData = async () => {
      try {
        const { data, error } = await supabase
          .from("clients")
          .select("name, email, onboarding_data")
          .eq("id", clientId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setClientName(data.name || "");

          const existing = data.onboarding_data || {};
          setFormData(prev => ({
            ...prev,
            clientName: existing.clientName || data.name || "",
            email: existing.email || data.email || "",
            ...existing
          }));
        } else {
          toast.error("Client not found");
        }
      } catch (error) {
        console.error("Error loading client:", error);
        toast.error("Error loading client information");
      } finally {
        setLoading(false);
      }
    };

    fetchClientData();
  }, [clientId]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!clientId) {
      toast.error("No client ID provided");
      return;
    }

    if (!formData.clientName.trim() || !formData.email.trim()) {
      toast.error("Client name and email are required");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ onboarding_data: formData })
        .eq("id", clientId);

      if (error) {
        toast.error("Error saving form");
        console.error("Save error:", error);
      } else {
        toast.success("Thank you! Your information has been saved.");
        setSubmitted(true);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen gradient-dark flex items-center justify-center p-6">
        <Card className="border-0 shadow-card glass-card max-w-lg w-full">
          <CardContent className="p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">Thank You!</h1>
            <p className="text-muted-foreground mb-6">
              Your onboarding information has been successfully saved. Our team will review your details and get back to you soon.
            </p>
            <div className="text-sm text-muted-foreground">
              <p className="font-semibold text-foreground mb-2">What's Next?</p>
              <p>We'll use this information to create customized content strategies and help you reach your goals.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-dark p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-primary">ConnectaCreators</span>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold gradient-hero bg-clip-text text-transparent">
              {clientName ? `Welcome, ${clientName}!` : "Complete Your Onboarding"}
            </h1>
          </div>
          <p className="text-muted-foreground">Fill out your brand information below</p>
        </div>

        <Card className="border-0 shadow-card glass-card">
          <CardContent className="p-8">
            <div className="space-y-12">
              {/* Basic Information */}
              <div>
                <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">1</span>
                  Basic Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="clientName">Your Name *</Label>
                    <Input
                      id="clientName"
                      placeholder="e.g., John Smith"
                      value={formData.clientName}
                      onChange={(e) => handleInputChange("clientName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Social Media Accounts */}
              <div className="border-t border-border/50 pt-12">
                <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">2</span>
                  Social Media Accounts
                </h2>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="instagram">Instagram Handle</Label>
                      <Input
                        id="instagram"
                        placeholder="@username"
                        value={formData.instagram}
                        onChange={(e) => handleInputChange("instagram", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="instagramPassword">Instagram Password</Label>
                      <Input
                        id="instagramPassword"
                        type="password"
                        placeholder="Password"
                        value={formData.instagramPassword}
                        onChange={(e) => handleInputChange("instagramPassword", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="tiktok">TikTok Handle</Label>
                      <Input
                        id="tiktok"
                        placeholder="@username"
                        value={formData.tiktok}
                        onChange={(e) => handleInputChange("tiktok", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tiktokPassword">TikTok Password</Label>
                      <Input
                        id="tiktokPassword"
                        type="password"
                        placeholder="Password"
                        value={formData.tiktokPassword}
                        onChange={(e) => handleInputChange("tiktokPassword", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="youtube">YouTube Handle</Label>
                      <Input
                        id="youtube"
                        placeholder="@username"
                        value={formData.youtube}
                        onChange={(e) => handleInputChange("youtube", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="youtubePassword">YouTube Password</Label>
                      <Input
                        id="youtubePassword"
                        type="password"
                        placeholder="Password"
                        value={formData.youtubePassword}
                        onChange={(e) => handleInputChange("youtubePassword", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="facebook">Facebook Handle</Label>
                      <Input
                        id="facebook"
                        placeholder="@username"
                        value={formData.facebook}
                        onChange={(e) => handleInputChange("facebook", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="facebookPassword">Facebook Password</Label>
                      <Input
                        id="facebookPassword"
                        type="password"
                        placeholder="Password"
                        value={formData.facebookPassword}
                        onChange={(e) => handleInputChange("facebookPassword", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Details */}
              <div className="border-t border-border/50 pt-12">
                <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">3</span>
                  Business Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="package">Package</Label>
                    <Select value={formData.package} onValueChange={(value) => handleInputChange("package", value)}>
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
                      onChange={(e) => handleInputChange("adBudget", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select value={formData.industry} onValueChange={(value) => handleInputChange("industry", value)}>
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
                        onChange={(e) => handleInputChange("industryOther", e.target.value)}
                        className="mt-2"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Select value={formData.state} onValueChange={(value) => handleInputChange("state", value)}>
                      <SelectTrigger id="state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Brand & Messaging */}
              <div className="border-t border-border/50 pt-12">
                <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">4</span>
                  Brand & Messaging
                </h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="uniqueOffer">What is your unique offer?</Label>
                    <Textarea
                      id="uniqueOffer"
                      placeholder="Describe your unique value proposition..."
                      value={formData.uniqueOffer}
                      onChange={(e) => handleInputChange("uniqueOffer", e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uniqueValues">Top 5 Unique Values You Can Teach</Label>
                    <Textarea
                      id="uniqueValues"
                      placeholder="List 5 things you can confidently teach (one per line)"
                      value={formData.uniqueValues}
                      onChange={(e) => handleInputChange("uniqueValues", e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="competition">What Differentiates You From Competition?</Label>
                    <Textarea
                      id="competition"
                      placeholder="What makes you different from competitors..."
                      value={formData.competition}
                      onChange={(e) => handleInputChange("competition", e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="story">Your Story</Label>
                    <Textarea
                      id="story"
                      placeholder="What's your background and journey?"
                      value={formData.story}
                      onChange={(e) => handleInputChange("story", e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                </div>
              </div>

              {/* Market & Goals */}
              <div className="border-t border-border/50 pt-12">
                <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">5</span>
                  Market & Goals
                </h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="targetClient">Who is Your Target Client?</Label>
                    <Textarea
                      id="targetClient"
                      placeholder="Describe your ideal customer..."
                      value={formData.targetClient}
                      onChange={(e) => handleInputChange("targetClient", e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="top3Profiles">Top 3 Profiles You Want to Emulate</Label>
                    <Textarea
                      id="top3Profiles"
                      placeholder="List 3 profiles/competitors you admire (one per line)"
                      value={formData.top3Profiles}
                      onChange={(e) => handleInputChange("top3Profiles", e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="callLink">Link to Your Call/Calendar</Label>
                    <Input
                      id="callLink"
                      placeholder="https://calendly.com/... or https://zoom.us/..."
                      value={formData.callLink}
                      onChange={(e) => handleInputChange("callLink", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="additionalNotes">Additional Notes</Label>
                    <Textarea
                      id="additionalNotes"
                      placeholder="Any other important details..."
                      value={formData.additionalNotes}
                      onChange={(e) => handleInputChange("additionalNotes", e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="border-t border-border/50 pt-8">
                <Button
                  variant="default"
                  onClick={handleSave}
                  disabled={saving || !formData.clientName || !formData.email}
                  className="w-full"
                  size="lg"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & Submit"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicOnboarding;
