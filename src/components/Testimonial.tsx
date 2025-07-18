import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Quote, Star, TrendingUp, Users, ArrowRight } from "lucide-react";
import lawyerSuccess from "@/assets/lawyer-success.jpg";

const Testimonial = () => {
  return (
    <section className="py-24 relative overflow-hidden" id="casos">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-bg opacity-50" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 glass-card px-6 py-3 rounded-full mb-6">
            <Star className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Casos de Éxito</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-foreground">Resultados que </span>
            <span className="gradient-hero bg-clip-text text-transparent">hablan por sí solos</span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Conoce cómo transformamos marcas personales en negocios prósperos y automatizados.
          </p>
        </div>

        {/* Success Cases */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Case 1: Lawyer */}
          <Card className="border-0 shadow-card glass-card overflow-hidden animate-scale-in">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">@elabogado Jonathan</h3>
                <div className="text-2xl font-bold text-primary mb-1">+650k Seguidores</div>
                <div className="text-muted-foreground">Abogado de Inmigración</div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-foreground">Crecimiento:</span>
                  <span className="font-bold text-primary">45K → 650K</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground">Tiempo:</span>
                  <span className="font-bold text-primary">9 meses</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground">ROI:</span>
                  <span className="font-bold text-primary">1400%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Case 2: Fitness Coach */}
          <Card className="border-0 shadow-card glass-card overflow-hidden animate-scale-in">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">@zigufit</h3>
                <div className="text-2xl font-bold text-primary mb-1">+10k Seguidores</div>
                <div className="text-muted-foreground">Fitness Coach</div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-foreground">Embudo de ventas:</span>
                  <span className="font-bold text-primary">Activo</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground">Automatización:</span>
                  <span className="font-bold text-primary">24/7</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground">Conversión:</span>
                  <span className="font-bold text-primary">Optimizada</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional success metrics */}
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          {[
            { metric: "100k+", description: "Seguidores promedio" },
            { metric: "90%", description: "Automatización de procesos" },
            { metric: "24/7", description: "Generación de leads" }
          ].map((item, index) => (
            <div key={index} className="text-center animate-fade-in" style={{animationDelay: `${index * 0.2}s`}}>
              <div className="glass-card p-6 rounded-2xl">
                <div className="text-4xl font-bold text-primary mb-2">{item.metric}</div>
                <div className="text-muted-foreground">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonial;