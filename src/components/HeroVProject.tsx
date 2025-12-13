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
          
          {/* 3 Profile Images Pop-up */}
          <div className="flex items-center justify-center gap-4 md:gap-6 my-12">
            <div className="relative animate-fade-in transform -rotate-6 hover:rotate-0 hover:scale-110 transition-all duration-300" style={{animationDelay: '0.2s'}}>
              <div className="w-48 md:w-56 rounded-2xl overflow-hidden shadow-2xl border-2 border-primary/30 hover:border-primary transition-colors">
                <img src="/src/assets/tiktok-profile-1.png" alt="Cliente exitoso 1" className="w-full h-auto" />
              </div>
            </div>
            <div className="relative animate-fade-in transform scale-105 hover:scale-115 transition-all duration-300 z-10" style={{animationDelay: '0.4s'}}>
              <div className="w-52 md:w-64 rounded-2xl overflow-hidden shadow-2xl border-2 border-primary hover:border-primary-light transition-colors">
                <img src="/src/assets/tiktok-profile-2.png" alt="Cliente exitoso 2" className="w-full h-auto" />
              </div>
            </div>
            <div className="relative animate-fade-in transform rotate-6 hover:rotate-0 hover:scale-110 transition-all duration-300" style={{animationDelay: '0.6s'}}>
              <div className="w-48 md:w-56 rounded-2xl overflow-hidden shadow-2xl border-2 border-primary/30 hover:border-primary transition-colors">
                <img src="/src/assets/tiktok-profile-3.png" alt="Cliente exitoso 3" className="w-full h-auto" />
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
