import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { motion } from "framer-motion";
import Autoplay from "embla-carousel-autoplay";
import ziguaImg from "@/assets/zigua.png";
import abfoImg from "@/assets/abfo.png";
import drCalvinImg from "@/assets/dr-calvin-new.webp";
import signatureImg from "@/assets/roberto-signature.png";

const profileImages = [
  { src: ziguaImg, alt: "Zigurat Sofía", followers: "+17,200 Followers" },
  { src: abfoImg, alt: "Jonathan Shaw", followers: "+750K Followers" },
  { src: drCalvinImg, alt: "Dr. Calvin's Clinic", followers: "+6,700 Followers" },
];

const HeroVProject = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-8 md:py-16 px-4 md:px-6">
      {/* Elegant dark background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      
      {/* Animated floating orbs */}
      <motion.div
        className="absolute w-96 h-96 rounded-full bg-primary/20 blur-3xl -top-48 -left-48"
        animate={{
          y: [0, 30, 0],
          x: [0, -20, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-64 h-64 rounded-full bg-primary/15 blur-3xl bottom-20 right-10"
        animate={{
          y: [0, -40, 0],
          x: [0, 20, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      
      {/* Signature background - very subtle */}
      <motion.div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, delay: 0.5 }}
      >
        <img 
          src={signatureImg} 
          alt="" 
          className="w-[80%] md:w-[60%] max-w-3xl opacity-[0.03]"
        />
      </motion.div>
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Main content */}
      <div className="relative z-10 text-center max-w-5xl mx-auto">
        <div className="space-y-4 md:space-y-8">
          {/* Main headline with elegant typography */}
          <motion.h1 
            className="text-2xl md:text-5xl lg:text-6xl font-playfair font-bold leading-tight tracking-tight px-2"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="text-foreground">The </span>
            <span className="italic text-foreground/90">step-by-step system</span>
            <span className="text-foreground"> to</span>
            <br />
            <motion.span 
              className="text-primary font-bold inline-block"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.6, type: "spring" }}
            >
              make +$10,000 / month
            </motion.span>
            <br />
            <span className="text-foreground">with your brand in </span>
            <span className="italic text-foreground/90">90 days</span>
          </motion.h1>
          
          <motion.p 
            className="font-sans font-medium text-sm md:text-xl lg:text-2xl leading-tight text-foreground/70 px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            with your Instagram account recording videos with your phone
          </motion.p>
          
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
                    <motion.div 
                      className="flex flex-col items-center gap-3"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                    >
                      <div className="w-56 rounded-xl overflow-hidden shadow-xl border-2 border-primary">
                        <img src={image.src} alt={image.alt} className="w-full h-auto" />
                      </div>
                      <p className="text-primary font-bold text-lg">{image.followers}</p>
                    </motion.div>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>

          {/* Desktop Images */}
          <div className="hidden md:flex items-center justify-center gap-6 py-8">
            <motion.div 
              className="relative transform -rotate-3 hover:rotate-0 hover:scale-110 transition-all duration-300"
              initial={{ opacity: 0, x: -50, rotate: -10 }}
              animate={{ opacity: 1, x: 0, rotate: -3 }}
              transition={{ delay: 0.6, duration: 0.8, type: "spring" }}
              whileHover={{ y: -10, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}
            >
              <div className="w-56 rounded-2xl overflow-hidden shadow-xl border border-primary/20 hover:border-primary transition-colors">
                <img src={ziguaImg} alt="Zigurat Sofía" className="w-full h-auto" />
              </div>
            </motion.div>
            <motion.div 
              className="relative transform hover:scale-110 transition-all duration-300 z-10"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.8, type: "spring" }}
              whileHover={{ y: -15, boxShadow: "0 25px 50px rgba(0,0,0,0.4)" }}
            >
              <div className="w-64 rounded-2xl overflow-hidden shadow-xl border-2 border-primary hover:border-primary-light transition-colors">
                <img src={abfoImg} alt="Jonathan Shaw" className="w-full h-auto" />
              </div>
            </motion.div>
            <motion.div 
              className="relative transform rotate-3 hover:rotate-0 hover:scale-110 transition-all duration-300"
              initial={{ opacity: 0, x: 50, rotate: 10 }}
              animate={{ opacity: 1, x: 0, rotate: 3 }}
              transition={{ delay: 1, duration: 0.8, type: "spring" }}
              whileHover={{ y: -10, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}
            >
              <div className="w-56 rounded-2xl overflow-hidden shadow-xl border border-primary/20 hover:border-primary transition-colors">
                <img src={drCalvinImg} alt="Dr. Calvin's Clinic" className="w-full h-auto" />
              </div>
            </motion.div>
          </div>

          {/* Urgency text */}
          <motion.p 
            className="text-foreground/50 text-[10px] md:text-sm px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            Book your 15-minute call to see how it would look in your case
          </motion.p>

          {/* CTA Button */}
          <motion.div 
            className="pt-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.6 }}
          >
            <motion.a 
              href="https://calendly.com/robertogaunaj/demo-presentation" 
              target="_blank" 
              rel="noopener noreferrer"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button 
                size="lg"
                className="bg-primary hover:bg-primary-light text-white font-semibold text-sm md:text-lg px-6 md:px-12 py-3 md:py-6 rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300"
              >
                Start now
              </Button>
            </motion.a>
          </motion.div>
        </div>
      </div>
      
      {/* Scroll indicator */}
      <motion.div 
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 0.6 }}
      >
        <motion.div
          className="w-6 h-10 rounded-full border-2 border-foreground/20 flex items-start justify-center p-2"
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <motion.div
            className="w-1 h-2 rounded-full bg-primary"
            animate={{ y: [0, 8, 0], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
};

export default HeroVProject;
