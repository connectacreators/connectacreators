import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background with blur effects */}
      <div className="absolute inset-0">
        <img 
          src={heroBg} 
          alt="Connecta Hero Background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 gradient-bg" />
      </div>

      {/* Floating glass cards for visual interest */}
      <div className="absolute top-20 left-10 glass-card p-4 rounded-xl animate-fade-in opacity-80">
        <TrendingUp className="w-6 h-6 text-primary" />
      </div>
      <div className="absolute bottom-32 right-20 glass-blue p-4 rounded-xl animate-fade-in opacity-80" style={{animationDelay: '0.5s'}}>
        <Sparkles className="w-6 h-6 text-white" />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center max-w-5xl mx-auto px-6">
        <div className="animate-slide-up">
          <div className="inline-flex items-center gap-2 glass-card px-6 py-3 rounded-full mb-8">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Connecta | AI + Social Media</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="text-white">Haz crecer tu marca con</span>
            <br />
            <span className="gradient-hero bg-clip-text text-transparent">IA + Social Media</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto leading-relaxed">
            Convertimos tu presencia digital en <strong className="text-primary">ingresos reales</strong> y automatizados.
            De la viralidad a las ventas, todo en un solo lugar.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button variant="hero" size="xl" className="group">
              Factura miles con Connecta
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button variant="glass" size="xl">
              Ver casos de éxito
            </Button>
          </div>
        </div>

        {/* Social proof */}
        <div className="glass-card p-6 rounded-2xl max-w-2xl mx-auto animate-scale-in" style={{animationDelay: '1s'}}>
          <div className="flex items-center justify-center gap-8 text-white/80">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">650K+</div>
              <div className="text-sm">Seguidores Generados</div>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">9</div>
              <div className="text-sm">Meses de Crecimiento</div>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">1000%+</div>
              <div className="text-sm">ROI Promedio</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;