import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const HeroVProject = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-16 px-6">
      {/* Elegant dark background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Main content */}
      <div className="relative z-10 text-center max-w-5xl mx-auto">
        <div className="animate-fade-in space-y-8">
          {/* Main headline with elegant typography */}
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-playfair font-bold leading-tight tracking-tight">
            <span className="text-foreground">El </span>
            <span className="italic text-foreground/90">sistema paso a paso</span>
            <span className="text-foreground"> para</span>
            <br />
            <span className="text-primary font-bold">facturar +€10.000 / mes</span>
            <br />
            <span className="text-foreground">con tu marca en </span>
            <span className="italic text-foreground/90">90 días</span>
            <br />
            <span className="font-sans font-black text-2xl md:text-4xl lg:text-5xl">con tu cuenta de Instagram en 90 días grabando vídeos con tu teléfono</span>
          </h1>
          
          {/* Video/Image placeholder */}
          <div className="max-w-3xl mx-auto my-12 rounded-2xl overflow-hidden shadow-2xl">
            <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
              <div className="text-center space-y-4 p-8">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto border-2 border-primary/40">
                  <div className="w-0 h-0 border-l-[12px] border-l-primary border-y-[8px] border-y-transparent ml-1" />
                </div>
                <p className="text-foreground/60 text-sm">Video placeholder</p>
              </div>
            </div>
          </div>

          {/* Urgency text */}
          <p className="text-foreground/60 text-base md:text-lg animate-fade-in" style={{animationDelay: '0.3s'}}>
            Esta oferta estará disponible hasta el 30 de Diciembre
          </p>

          {/* CTA Button */}
          <div className="animate-fade-in" style={{animationDelay: '0.5s'}}>
            <Link to="/onboarding">
              <Button 
                size="lg"
                className="bg-primary hover:bg-primary-light text-white font-semibold text-lg px-12 py-6 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                Empezar ahora con Connecta
              </Button>
            </Link>
          </div>
        </div>

        {/* Trust indicators - "Me has visto por aquí" */}
        <div className="mt-24 animate-fade-in" style={{animationDelay: '0.7s'}}>
          <h2 className="text-xl md:text-2xl font-playfair text-foreground/80 mb-8">
            Me has visto por aquí
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            <div className="text-foreground/60 font-bold text-xl">Forbes</div>
            <div className="text-foreground/60 font-bold text-xl">El País</div>
            <div className="text-foreground/60 font-bold text-xl">La Vanguardia</div>
            <div className="text-foreground/60 font-bold text-xl">Entrepreneur</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroVProject;
