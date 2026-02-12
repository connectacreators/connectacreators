import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, CheckCircle } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { Link } from "react-router-dom";

const Onboarding = () => {
  const { language } = useLanguage();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    nombre: "",
    cuentaRedes: "",
    industria: "",
    objetivo: "",
    informacionExtra: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => { if (currentStep < 4) setCurrentStep(currentStep + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };
  const handleSubmit = () => { console.log("Form submitted:", formData); setCurrentStep(5); };

  const isStepValid = () => {
    switch (currentStep) {
      case 1: return formData.nombre.trim() !== "";
      case 2: return formData.cuentaRedes.trim() !== "";
      case 3: return formData.industria !== "";
      case 4: return formData.objetivo !== "";
      default: return false;
    }
  };

  const o = t.onboarding;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">{tr(o.step1Title, language)}</h2>
              <p className="text-muted-foreground">{tr(o.step1Desc, language)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre" className="text-foreground">{tr(o.step1Label, language)}</Label>
              <Input id="nombre" type="text" placeholder={tr(o.step1Placeholder, language)} value={formData.nombre} onChange={(e) => handleInputChange("nombre", e.target.value)} className="text-lg py-6" />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">{language === "en" ? `Perfect, ${formData.nombre}! 🚀` : `Perfecto, ${formData.nombre}! 🚀`}</h2>
              <p className="text-muted-foreground">{tr(o.step2Desc, language)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuentaRedes" className="text-foreground">{tr(o.step2Label, language)}</Label>
              <Input id="cuentaRedes" type="text" placeholder={tr(o.step2Placeholder, language)} value={formData.cuentaRedes} onChange={(e) => handleInputChange("cuentaRedes", e.target.value)} className="text-lg py-6" />
              <p className="text-sm text-muted-foreground">{tr(o.step2Hint, language)}</p>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">{tr(o.step3Title, language)}</h2>
              <p className="text-muted-foreground">{tr(o.step3Desc, language)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="industria" className="text-foreground">{tr(o.step3Label, language)}</Label>
              <Select value={formData.industria} onValueChange={(value) => handleInputChange("industria", value)}>
                <SelectTrigger className="text-lg py-6"><SelectValue placeholder={tr(o.step3Placeholder, language)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="law-firm">Law Firm</SelectItem>
                  <SelectItem value="fitness-coach">Fitness Coach</SelectItem>
                  <SelectItem value="real-estate">Real Estate</SelectItem>
                  <SelectItem value="small-business">Small Business</SelectItem>
                  <SelectItem value="otro">{tr(o.step3Other, language)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">{tr(o.step4Title, language)}</h2>
              <p className="text-muted-foreground">{tr(o.step4Desc, language)}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="objetivo" className="text-foreground">{tr(o.step4Label, language)}</Label>
                <Select value={formData.objetivo} onValueChange={(value) => handleInputChange("objetivo", value)}>
                  <SelectTrigger className="text-lg py-6"><SelectValue placeholder={tr(o.step4Placeholder, language)} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crecimiento-redes">{tr(o.step4Growth, language)}</SelectItem>
                    <SelectItem value="anuncios">{tr(o.step4Ads, language)}</SelectItem>
                    <SelectItem value="generacion-leads">{tr(o.step4Leads, language)}</SelectItem>
                    <SelectItem value="automatizacion">{tr(o.step4Auto, language)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="informacionExtra" className="text-foreground">{tr(o.step4ExtraLabel, language)}</Label>
                <Textarea id="informacionExtra" placeholder={tr(o.step4ExtraPlaceholder, language)} value={formData.informacionExtra} onChange={(e) => handleInputChange("informacionExtra", e.target.value)} className="min-h-[120px]" />
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-4">{tr(o.successTitle, language)}, {formData.nombre}! 🎉</h2>
              <p className="text-xl text-muted-foreground mb-6">{tr(o.successDesc, language)}</p>
              <div className="glass-card p-6 rounded-2xl">
                <h3 className="text-lg font-bold text-foreground mb-3">{tr(o.nextSteps, language)}</h3>
                <div className="space-y-2 text-left">
                  <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-primary"></div><span className="text-muted-foreground">{tr(o.nextStep1, language)}</span></div>
                  <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-primary"></div><span className="text-muted-foreground">{tr(o.nextStep2, language)}</span></div>
                  <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-primary"></div><span className="text-muted-foreground">{tr(o.nextStep3, language)}</span></div>
                </div>
              </div>
            </div>
            <Link to="/"><Button variant="cta" size="lg">{tr(o.backToHome, language)}</Button></Link>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen gradient-dark flex items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6 text-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
            {tr(o.backHome, language)}
          </Link>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold gradient-hero bg-clip-text text-transparent">Connecta</span>
          </div>
          {currentStep < 5 && (
            <div className="flex justify-center space-x-2 mb-6">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className={`w-3 h-3 rounded-full ${step <= currentStep ? "bg-primary" : "bg-muted"} transition-colors`} />
              ))}
            </div>
          )}
        </div>

        <Card className="border-0 shadow-card glass-card">
          <CardHeader className="text-center pb-6">
            {currentStep < 5 && (
              <CardTitle className="text-sm text-muted-foreground">
                {tr(o.step, language)} {currentStep} {tr(o.of, language)} 4
              </CardTitle>
            )}
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {renderStep()}
            {currentStep < 5 && (
              <div className="flex justify-between pt-8">
                <Button variant="ghost" onClick={handleBack} disabled={currentStep === 1} className="text-muted-foreground hover:text-foreground">
                  {tr(o.previous, language)}
                </Button>
                {currentStep === 4 ? (
                  <Button variant="cta" onClick={handleSubmit} disabled={!isStepValid()}>{tr(o.submit, language)}</Button>
                ) : (
                  <Button variant="cta" onClick={handleNext} disabled={!isStepValid()}>{tr(o.next, language)}</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Onboarding;
