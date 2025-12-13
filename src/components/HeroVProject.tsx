import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import ziguaImg from "@/assets/zigua.png";
import abfoImg from "@/assets/abfo.png";
import drCalvinImg from "@/assets/dr-calvin.png";
import signatureImg from "@/assets/roberto-signature.png";

const profileImages = [
  { src: ziguaImg, alt: "Zigurat Sofía", followers: "+17,200 Followers" },
  { src: abfoImg, alt: "Jonathan Shaw", followers: "+750K Followers" },
  { src: drCalvinImg, alt: "Dr. Calvin's Clinic", followers: "+4,200 Followers" },
];

const HeroVProject = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-8 md:py-16 px-4 md:px-6">
      {/* Elegant dark background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      
      {/* Signature background - very subtle */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <img 
          src={signatureImg} 
          alt="" 
          className="w-[80%] md:w-[60%] max-w-3xl opacity-[0.03]"
        />
      </div>
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Main content */}
      <div className="relative z-10 text-center max-w-5xl mx-auto">
        <div className="animate-fade-in space-y-4 md:space-y-8">
          {/* Main headline with elegant typography */}
          <h1 className="text-2xl md:text-5xl lg:text-6xl font-playfair font-bold leading-tight tracking-tight px-2">
            <span className="text-foreground">The </span>
            <span className="italic text-foreground/90">step-by-step system</span>
            <span className="text-foreground"> to</span>
            <br />
            <span className="text-primary font-bold">make +$10,000 / month</span>
            <br />
            <span className="text-foreground">with your brand in </span>
            <span className="italic text-foreground/90">90 days</span>
          </h1>
          
          <p className="font-sans font-bold text-base md:text-3xl lg:text-4xl leading-tight text-foreground/80 px-4">
            with your Instagram account recording videos with your phone
          </p>
          
          {/* Mobile Carousel */}
          <div className="md:hidden py-4">
            <Carousel 
              className="w-full max-w-sm mx-auto"
              opts={{
                align: "center",
                loop: true,
              }}
              plugins={[
                Autoplay({
                  delay: 3000,
                  stopOnInteraction: false,
                }),
              ]}
            >
              <CarouselContent>
                {profileImages.map((image, index) => (
                  <CarouselItem key={index}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-56 rounded-xl overflow-hidden shadow-xl border-2 border-primary">
                        <img src={image.src} alt={image.alt} className="w-full h-auto" />
                      </div>
                      <p className="text-primary font-bold text-lg">{image.followers}</p>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>

          {/* Desktop Images */}
          <div className="hidden md:flex items-center justify-center gap-6 py-8">
            <div className="relative animate-fade-in transform -rotate-3 hover:rotate-0 hover:scale-110 transition-all duration-300" style={{animationDelay: '0.2s'}}>
              <div className="w-56 rounded-2xl overflow-hidden shadow-xl border border-primary/20 hover:border-primary transition-colors">
                <img src={ziguaImg} alt="Zigurat Sofía" className="w-full h-auto" />
              </div>
            </div>
            <div className="relative animate-fade-in transform hover:scale-110 transition-all duration-300 z-10" style={{animationDelay: '0.4s'}}>
              <div className="w-64 rounded-2xl overflow-hidden shadow-xl border-2 border-primary hover:border-primary-light transition-colors">
                <img src={abfoImg} alt="Jonathan Shaw" className="w-full h-auto" />
              </div>
            </div>
            <div className="relative animate-fade-in transform rotate-3 hover:rotate-0 hover:scale-110 transition-all duration-300" style={{animationDelay: '0.6s'}}>
              <div className="w-56 rounded-2xl overflow-hidden shadow-xl border border-primary/20 hover:border-primary transition-colors">
                <img src={drCalvinImg} alt="Dr. Calvin's Clinic" className="w-full h-auto" />
              </div>
            </div>
          </div>

          {/* Urgency text */}
          <p className="text-foreground/50 text-xs md:text-base animate-fade-in px-6" style={{animationDelay: '0.3s'}}>
            Book your 15-minute call to see how it would look in your case
          </p>

          {/* CTA Button */}
          <div className="animate-fade-in pt-2" style={{animationDelay: '0.5s'}}>
            <a href="https://calendly.com/robertogaunaj/demo-presentation" target="_blank" rel="noopener noreferrer">
              <Button 
                size="lg"
                className="bg-primary hover:bg-primary-light text-white font-semibold text-sm md:text-lg px-6 md:px-12 py-3 md:py-6 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
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
