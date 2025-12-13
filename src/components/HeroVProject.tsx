import { Button } from "@/components/ui/button";
import ziguaImg from "@/assets/zigua.png";
import abfoImg from "@/assets/abfo.png";
import drCalvinImg from "@/assets/dr-calvin.png";

const HeroVProject = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-12 pb-16 px-6">
      {/* Elegant dark background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Main content */}
      <div className="relative z-10 text-center max-w-5xl mx-auto">
        <div className="animate-fade-in space-y-6 md:space-y-8">
          {/* Main headline with elegant typography */}
          <h1 className="text-[1.6rem] md:text-5xl lg:text-6xl font-playfair font-bold leading-snug md:leading-tight tracking-tight">
            <span className="whitespace-nowrap">
              <span className="text-foreground">The </span>
              <span className="italic text-foreground/90">step-by-step system</span>
              <span className="text-foreground"> to</span>
            </span>
            <br />
            <span className="text-primary font-bold">make +$10,000 / month</span>
            <br />
            <span className="text-foreground">with your brand in </span>
            <span className="italic text-foreground/90">90 days</span>
          </h1>
          <p className="font-sans font-black text-xl md:text-4xl lg:text-5xl leading-snug">
            with your Instagram account recording videos with your phone
          </p>
          
          {/* 3 Profile Images Pop-up */}
          <div className="flex items-center justify-center gap-2 md:gap-6 my-8 md:my-12">
            <div className="relative animate-fade-in transform -rotate-6 hover:rotate-0 hover:scale-110 transition-all duration-300" style={{animationDelay: '0.2s'}}>
              <div className="w-24 md:w-56 rounded-xl md:rounded-2xl overflow-hidden shadow-2xl border-2 border-primary/30 hover:border-primary transition-colors">
                <img src={ziguaImg} alt="Zigurat Sofía" className="w-full h-auto" />
              </div>
            </div>
            <div className="relative animate-fade-in transform scale-105 hover:scale-115 transition-all duration-300 z-10" style={{animationDelay: '0.4s'}}>
              <div className="w-28 md:w-64 rounded-xl md:rounded-2xl overflow-hidden shadow-2xl border-2 border-primary hover:border-primary-light transition-colors">
                <img src={abfoImg} alt="Jonathan Shaw" className="w-full h-auto" />
              </div>
            </div>
            <div className="relative animate-fade-in transform rotate-6 hover:rotate-0 hover:scale-110 transition-all duration-300" style={{animationDelay: '0.6s'}}>
              <div className="w-24 md:w-56 rounded-xl md:rounded-2xl overflow-hidden shadow-2xl border-2 border-primary/30 hover:border-primary transition-colors">
                <img src={drCalvinImg} alt="Dr. Calvin's Clinic" className="w-full h-auto" />
              </div>
            </div>
          </div>

          {/* Urgency text */}
          <p className="text-foreground/60 text-base md:text-lg animate-fade-in" style={{animationDelay: '0.3s'}}>
            Book your 15-minute call to see how it would look in your case
          </p>

          {/* CTA Button */}
          <div className="animate-fade-in" style={{animationDelay: '0.5s'}}>
            <a href="https://calendly.com/robertogaunaj/demo-presentation" target="_blank" rel="noopener noreferrer">
              <Button 
                size="lg"
                className="bg-primary hover:bg-primary-light text-white font-semibold text-sm md:text-lg px-8 md:px-12 py-4 md:py-6 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                Start now
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroVProject;
