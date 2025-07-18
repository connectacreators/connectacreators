import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    nombre: "",
    cuentaRedes: "",
    industria: "",
    objetivo: "",
    informacionExtra: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    // Here you would typically submit the form data
    console.log("Form submitted:", formData);
    setCurrentStep(5); // Success step
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.nombre.trim() !== "";
      case 2:
        return formData.cuentaRedes.trim() !== "";
      case 3:
        return formData.industria !== "";
      case 4:
        return formData.objetivo !== "";
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">¡Hola! 👋</h2>
              <p className="text-muted-foreground">Comencemos conociendo tu nombre</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre" className="text-foreground">¿Cómo te llamas?</Label>
              <Input
                id="nombre"
                type="text"
                placeholder="Tu nombre completo"
                value={formData.nombre}
                onChange={(e) => handleInputChange("nombre", e.target.value)}
                className="text-lg py-6"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">Perfecto, {formData.nombre}! 🚀</h2>
              <p className="text-muted-foreground">Ahora queremos conocer tu presencia en redes</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuentaRedes" className="text-foreground">¿Cuál es tu cuenta principal?</Label>
              <Input
                id="cuentaRedes"
                type="text"
                placeholder="@tu_usuario o enlace a tu perfil"
                value={formData.cuentaRedes}
                onChange={(e) => handleInputChange("cuentaRedes", e.target.value)}
                className="text-lg py-6"
              />
              <p className="text-sm text-muted-foreground">
                Puede ser de Instagram, TikTok, LinkedIn o cualquier red social
              </p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">¿A qué te dedicas? 💼</h2>
              <p className="text-muted-foreground">Esto nos ayuda a personalizar nuestra estrategia</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="industria" className="text-foreground">Selecciona tu industria</Label>
              <Select value={formData.industria} onValueChange={(value) => handleInputChange("industria", value)}>
                <SelectTrigger className="text-lg py-6">
                  <SelectValue placeholder="Elige una opción" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="law-firm">Law Firm</SelectItem>
                  <SelectItem value="fitness-coach">Fitness Coach</SelectItem>
                  <SelectItem value="real-estate">Real Estate</SelectItem>
                  <SelectItem value="small-business">Small Business</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">¿Cuál es tu objetivo? 🎯</h2>
              <p className="text-muted-foreground">Queremos enfocar nuestros esfuerzos en lo que más necesitas</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="objetivo" className="text-foreground">¿Qué quieres lograr principalmente?</Label>
                <Select value={formData.objetivo} onValueChange={(value) => handleInputChange("objetivo", value)}>
                  <SelectTrigger className="text-lg py-6">
                    <SelectValue placeholder="Selecciona tu objetivo principal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crecimiento-redes">Crecimiento de redes</SelectItem>
                    <SelectItem value="anuncios">Anuncios</SelectItem>
                    <SelectItem value="generacion-leads">Generación de leads</SelectItem>
                    <SelectItem value="automatizacion">Automatización</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="informacionExtra" className="text-foreground">Información adicional (opcional)</Label>
                <Textarea
                  id="informacionExtra"
                  placeholder="Cuéntanos más detalles sobre tu situación actual, metas específicas, o cualquier información que consideres relevante..."
                  value={formData.informacionExtra}
                  onChange={(e) => handleInputChange("informacionExtra", e.target.value)}
                  className="min-h-[120px]"
                />
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
              <h2 className="text-3xl font-bold text-foreground mb-4">¡Perfecto, {formData.nombre}! 🎉</h2>
              <p className="text-xl text-muted-foreground mb-6">
                Hemos recibido tu información. Nuestro equipo revisará tu perfil y te contactará en las próximas 24 horas.
              </p>
              <div className="glass-card p-6 rounded-2xl">
                <h3 className="text-lg font-bold text-foreground mb-3">Próximos pasos:</h3>
                <div className="space-y-2 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <span className="text-muted-foreground">Análisis de tu perfil actual</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <span className="text-muted-foreground">Estrategia personalizada</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <span className="text-muted-foreground">Llamada de diagnóstico gratuita</span>
                  </div>
                </div>
              </div>
            </div>
            <Link to="/">
              <Button variant="cta" size="lg">
                Volver al inicio
              </Button>
            </Link>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen gradient-dark flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6 text-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
            Volver al inicio
          </Link>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold gradient-hero bg-clip-text text-transparent">
              Connecta
            </span>
          </div>
          {currentStep < 5 && (
            <div className="flex justify-center space-x-2 mb-6">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full ${
                    step <= currentStep ? "bg-primary" : "bg-muted"
                  } transition-colors`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Form Card */}
        <Card className="border-0 shadow-card glass-card">
          <CardHeader className="text-center pb-6">
            {currentStep < 5 && (
              <CardTitle className="text-sm text-muted-foreground">
                Paso {currentStep} de 4
              </CardTitle>
            )}
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {renderStep()}

            {/* Navigation Buttons */}
            {currentStep < 5 && (
              <div className="flex justify-between pt-8">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={currentStep === 1}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Anterior
                </Button>
                
                {currentStep === 4 ? (
                  <Button
                    variant="cta"
                    onClick={handleSubmit}
                    disabled={!isStepValid()}
                  >
                    Enviar información
                  </Button>
                ) : (
                  <Button
                    variant="cta"
                    onClick={handleNext}
                    disabled={!isStepValid()}
                  >
                    Siguiente
                  </Button>
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