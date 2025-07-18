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

        {/* Main testimonial */}
        <Card className="max-w-6xl mx-auto border-0 shadow-card glass-card overflow-hidden animate-scale-in">
          <CardContent className="p-0">
            <div className="grid lg:grid-cols-2 gap-0">
              {/* Image side */}
              <div className="relative">
                <img 
                  src={lawyerSuccess} 
                  alt="Abogado de inmigración - Cliente exitoso" 
                  className="w-full h-full object-cover min-h-[400px]"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent" />
                
                {/* Stats overlay */}
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="glass-card p-4 rounded-xl">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-primary">45K → 650K</div>
                        <div className="text-sm text-foreground/80">Seguidores</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-primary">9 meses</div>
                        <div className="text-sm text-foreground/80">Tiempo</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content side */}
              <div className="p-8 lg:p-12 flex flex-col justify-center">
                <Quote className="w-12 h-12 text-primary mb-6" />
                
                <blockquote className="text-xl lg:text-2xl leading-relaxed text-foreground mb-8">
                  "Connecta transformó completamente mi práctica legal. En menos de 9 meses, 
                  pasé de 45,000 a más de 650,000 seguidores. Pero lo más impresionante es que 
                  ahora genero <strong className="text-primary">leads calificados automáticamente</strong> 
                  mientras duermo. Mi facturación se multiplicó por 10."
                </blockquote>
                
                <div className="mb-8">
                  <div className="font-bold text-lg text-foreground">Dr. Carlos Mendoza</div>
                  <div className="text-muted-foreground">Abogado de Inmigración</div>
                  <div className="flex items-center gap-1 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                    ))}
                  </div>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground">1400%</div>
                      <div className="text-sm text-muted-foreground">Crecimiento</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground">600K+</div>
                      <div className="text-sm text-muted-foreground">Nuevos seguidores</div>
                    </div>
                  </div>
                </div>

                <Button variant="cta" size="lg" className="self-start group">
                  Ver más casos de éxito
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional success metrics */}
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          {[
            { metric: "10x", description: "Aumento promedio en facturación" },
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