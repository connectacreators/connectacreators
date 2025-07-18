import { Card, CardContent } from "@/components/ui/card";
import { Shield, Zap, Target, Users } from "lucide-react";

const About = () => {
  const values = [
    {
      icon: Zap,
      title: "Innovación Constante",
      description: "Siempre a la vanguardia de las últimas tecnologías y tendencias digitales."
    },
    {
      icon: Target,
      title: "Resultados Medibles",
      description: "Cada estrategia está diseñada para generar ROI tangible y crecimiento sostenible."
    },
    {
      icon: Shield,
      title: "Confianza Total",
      description: "Transparencia completa en procesos, métricas y resultados obtenidos."
    },
    {
      icon: Users,
      title: "Enfoque Humano",
      description: "Detrás de cada marca hay personas. Entendemos sus sueños y desafíos únicos."
    }
  ];

  return (
    <section className="py-24 bg-muted/20" id="nosotros">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 glass-card px-6 py-3 rounded-full mb-6">
              <Users className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Quiénes somos</span>
            </div>
            
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="text-foreground">La agencia que </span>
              <span className="gradient-hero bg-clip-text text-transparent">revoluciona</span>
              <span className="text-foreground"> el marketing digital</span>
            </h2>
            
            <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">Connecta nació de una visión clara:</strong> combinar 
                el poder viral de las redes sociales con la eficiencia de la inteligencia artificial 
                para crear máquinas de generar ingresos automatizadas.
              </p>
              
              <p>
                Nos especializamos en <strong className="text-primary">marcas personales y pequeños negocios</strong> 
                porque creemos que cada emprendedor merece tener acceso a las mismas herramientas y estrategias 
                que utilizan las grandes corporaciones.
              </p>
              
              <p>
                Nuestro enfoque innovador no se limita a generar seguidores o likes. 
                <strong className="text-foreground"> Creamos sistemas completos</strong> que transforman 
                audiencia en ingresos reales, utilizando automatización inteligente y estrategias 
                de contenido que realmente conectan.
              </p>
            </div>

            {/* Key differentiator */}
            <div className="mt-8 glass-blue p-6 rounded-2xl">
              <h3 className="text-xl font-bold text-white mb-3">
                Nuestro diferencial único
              </h3>
              <p className="text-white/90">
                Mientras otras agencias se enfocan solo en vanity metrics, nosotros construimos 
                <strong className="text-white"> sistemas de automatización con IA</strong> que 
                trabajan 24/7 para convertir tu audiencia en clientes pagantes.
              </p>
            </div>
          </div>

          {/* Values grid */}
          <div className="grid sm:grid-cols-2 gap-6">
            {values.map((value, index) => (
              <Card 
                key={value.title}
                className="border-0 shadow-card glass-card hover:shadow-glow transition-smooth animate-fade-in"
                style={{animationDelay: `${index * 0.1}s`}}
              >
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-4`}>
                    <value.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-3">
                    {value.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Mission statement */}
        <div className="mt-20 text-center">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-3xl font-bold text-foreground mb-6">
              Nuestra misión
            </h3>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Democratizar el acceso a herramientas de marketing digital de clase mundial, 
              combinando creatividad humana con inteligencia artificial para que cada 
              emprendedor pueda <strong className="text-primary">escalar su negocio sin límites</strong>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;