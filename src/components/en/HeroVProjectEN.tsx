import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";
import signatureImg from "@/assets/roberto-signature.png";

const HeroVProjectEN = () => {
  const [isMuted, setIsMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const toggleMute = () => {
    if (iframeRef.current) {
      const message = isMuted ? '{"method":"setVolume","value":1}' : '{"method":"setVolume","value":0}';
      iframeRef.current.contentWindow?.postMessage(message, '*');
      setIsMuted(!isMuted);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-8 md:py-16 px-4 md:px-6">
      {/* Elegant dark background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      
      {/* Static floating orbs - no animation on mobile for performance */}
      <div className="absolute w-96 h-96 rounded-full bg-primary/20 blur-3xl -top-48 -left-48 hidden md:block" />
      <div className="absolute w-64 h-64 rounded-full bg-primary/15 blur-3xl bottom-20 right-10 hidden md:block" />
      
      {/* Signature background - static for performance */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <img 
          src={signatureImg} 
          alt="" 
          className="w-[80%] md:w-[60%] max-w-3xl opacity-[0.03]"
          loading="lazy"
        />
      </div>
      
      {/* Subtle grid pattern - hidden on mobile */}
      <div className="absolute inset-0 opacity-5 hidden md:block" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Main content */}
      <div className="relative z-10 text-center max-w-5xl mx-auto">
        <div className="space-y-4 md:space-y-8">
          {/* Main headline with elegant typography */}
          <motion.h1 
            className="text-3xl md:text-5xl lg:text-6xl font-playfair font-bold leading-tight tracking-tight px-2"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="text-2xl md:text-4xl lg:text-5xl">
              <span className="text-foreground">The </span>
              <span className="italic text-foreground/90">step-by-step system</span>
              <span className="text-foreground"> to</span>
            </span>
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
            className="font-sans font-medium text-base md:text-xl lg:text-2xl leading-tight text-foreground/70 px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            with your Instagram account recording videos on your phone
          </motion.p>
          
          {/* VSL Video */}
          <motion.div 
            className="w-full max-w-3xl mx-auto py-4 md:py-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-primary/20" style={{ padding: '56.25% 0 0 0', position: 'relative' }}>
              <iframe 
                ref={iframeRef}
                src="https://player.vimeo.com/video/1151104978?autoplay=1&muted=1&loop=1&badge=0&autopause=0&player_id=0&app_id=58479&title=0&byline=0&portrait=0"
                frameBorder="0" 
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" 
                referrerPolicy="strict-origin-when-cross-origin" 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                title="Connecta VSL"
              />
              {/* Unmute button */}
              <motion.button
                onClick={toggleMute}
                className="absolute bottom-4 right-4 z-20 bg-background/80 backdrop-blur-sm border border-primary/30 rounded-full p-3 text-foreground hover:bg-primary hover:text-white transition-all duration-300 shadow-lg"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 0.4 }}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </motion.button>
            </div>
          </motion.div>

          {/* Urgency text */}
          <motion.p 
            className="text-foreground/50 text-[10px] md:text-sm px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            Book your 15-minute call to see how this would work for you
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
                Get Started Now
              </Button>
            </motion.a>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroVProjectEN;
