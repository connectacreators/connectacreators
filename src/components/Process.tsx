import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, Megaphone, Bot, ArrowRight } from "lucide-react";

const Process = () => {
  const steps = [
    {
      number: "01",
      icon: Lightbulb,
      title: "Viralidad",
      description: "Creamos contenido que captura atención masiva y construye una audiencia comprometida en todas las plataformas.",
      color: "from-primary to-primary-light"
    },
    {
      number: "02", 
      icon: Megaphone,
      title: "Ads Optimizados",
      description: "Lanzamos campañas publicitarias inteligentes que convierten tu audiencia viral en leads calificados.",
      color: "from-primary-light to-primary"
    },
    {
      number: "03",
      icon: Bot,
      title: "Automatización",
      description: "Implementamos sistemas de IA que nutren leads, califican prospectos y cierran ventas automáticamente 24/7.",
      color: "from-primary to-primary-dark"
    }
  ];

  return (
    <section className="py-24 bg-muted/30" id="proceso">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 glass-card px-6 py-3 rounded-full mb-6">
            <Bot className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Cómo lo logramos</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-foreground">Nuestro sistema </span>
            <span className="gradient-hero bg-clip-text text-transparent">probado</span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Un proceso de 3 pasos que transforma tu presencia digital en una máquina de generar ingresos.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, index) => (
            <div key={step.number} className="relative group">
              <Card className="h-full border-0 shadow-card hover:shadow-glow transition-smooth glass-card animate-slide-up" style={{animationDelay: `${index * 0.2}s`}}>
                <CardContent className="p-8 text-center">
                  {/* Step number */}
                  <div className="text-6xl font-bold text-primary/20 mb-4">
                    {step.number}
                  </div>
                  
                  {/* Icon */}
                  <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${step.color} flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-bounce`}>
                    <step.icon className="w-10 h-10 text-white" />
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-2xl font-bold text-foreground mb-4">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
              
              {/* Arrow connector */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-6 transform -translate-y-1/2 z-10">
                  <ArrowRight className="w-6 h-6 text-primary animate-glow" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Results showcase */}
        <div className="mt-20 text-center">
          <div className="glass-blue p-10 rounded-3xl max-w-5xl mx-auto">
            <h3 className="text-3xl font-bold text-white mb-6">
              El resultado: Crecimiento exponencial y automatizado
            </h3>
            <div className="grid md:grid-cols-3 gap-8 text-white">
              <div>
                <div className="text-4xl font-bold mb-2">1000%+</div>
                <div className="text-white/80">Aumento promedio en ingresos</div>
              </div>
              <div>
                <div className="text-4xl font-bold mb-2">24/7</div>
                <div className="text-white/80">Automatización funcionando</div>
              </div>
              <div>
                <div className="text-4xl font-bold mb-2">90%</div>
                <div className="text-white/80">Menos tiempo en tareas manuales</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Process;