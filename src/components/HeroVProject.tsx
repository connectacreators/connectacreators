import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import signatureImg from "@/assets/roberto-signature.png";

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
          
          {/* VSL Video */}
          <motion.div 
            className="w-full max-w-3xl mx-auto py-4 md:py-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-primary/20" style={{ padding: '56.25% 0 0 0', position: 'relative' }}>
              <iframe 
                src="https://player.vimeo.com/video/1151090377?badge=0&autopause=0&player_id=0&app_id=58479" 
                frameBorder="0" 
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" 
                referrerPolicy="strict-origin-when-cross-origin" 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                title="Connecta VSL"
              />
            </div>
          </motion.div>

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
    </section>
  );
};

export default HeroVProject;
