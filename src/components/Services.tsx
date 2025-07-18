import { Card, CardContent } from "@/components/ui/card";
import { Zap, Target, Bot, TrendingUp, Users, DollarSign } from "lucide-react";
import servicesBg from "@/assets/services-bg.jpg";

const Services = () => {
  const services = [
    {
      icon: TrendingUp,
      title: "Contenido Viral",
      description: "Estrategias de contenido que capturan atención y generan engagement masivo en todas las plataformas."
    },
    {
      icon: Target,
      title: "Ads Optimizados",
      description: "Campañas optimizadas en Meta, TikTok y YouTube que convierten audiencia en clientes pagantes."
    },
    {
      icon: Bot,
      title: "Automatización IA",
      description: "Sistemas inteligentes que califican leads y automatizan conversaciones 24/7 con herramientas como n8n."
    },
    {
      icon: Users,
      title: "Manejo de Redes",
      description: "Gestión completa de tu presencia digital con enfoque en construcción de comunidad."
    },
    {
      icon: Zap,
      title: "Embudos de Conversión",
      description: "Sistemas automatizados que guían a tu audiencia desde el primer contacto hasta la venta."
    },
    {
      icon: DollarSign,
      title: "Resultados Medibles",
      description: "Tracking completo de ROI y métricas que importan para el crecimiento de tu negocio."
    }
  ];

  return (
    <section className="py-24 relative overflow-hidden" id="servicios">
      {/* Background */}
      <div className="absolute inset-0">
        <img 
          src={servicesBg} 
          alt="Services Background" 
          className="w-full h-full object-cover opacity-10"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 glass-card px-6 py-3 rounded-full mb-6">
            <Zap className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Lo que hacemos</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-foreground">Servicios que </span>
            <span className="gradient-hero bg-clip-text text-transparent">generan resultados</span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            No solo creamos visibilidad, la convertimos en ingresos reales y automatizados
            para marcas personales y pequeños negocios.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <Card 
              key={service.title}
              className="group hover:shadow-glow transition-smooth border-0 shadow-card glass-card backdrop-blur-subtle animate-fade-in"
              style={{animationDelay: `${index * 0.1}s`}}
            >
              <CardContent className="p-8">
                <div className="mb-6">
                  <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center mb-4 group-hover:scale-110 transition-bounce">
                    <service.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    {service.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {service.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <div className="glass-blue p-8 rounded-3xl max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-white mb-4">
              ¿Listo para ver resultados reales?
            </h3>
            <p className="text-white/90 mb-6">
              Combinamos creatividad, tecnología y estrategia para hacer crecer tu marca de forma exponencial.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">45K → 650K</div>
                <div className="text-white/80 text-sm">Seguidores en 9 meses</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Services;