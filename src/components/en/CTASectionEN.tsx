import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FloatingOrb } from "../ui/FloatingElements";
import { ArrowRight, Sparkles } from "lucide-react";

const CTASectionEN = () => {
  return (
    <section className="relative py-24 md:py-40 bg-card overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-[500px] h-[500px] bg-primary/30 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" delay={0} duration={8} />
      <FloatingOrb className="w-64 h-64 bg-primary/20 top-10 left-10" delay={1} />
      <FloatingOrb className="w-48 h-48 bg-primary/15 bottom-10 right-20" delay={2} />
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-card" />
      
      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">Limited spots available</span>
          </motion.div>
          
          <h2 className="text-3xl md:text-6xl font-bold text-foreground mb-8 tracking-tight">
            Ready to build{" "}
            <span className="relative inline-block">
              <span className="text-primary">momentum</span>
              <motion.span
                className="absolute -bottom-2 left-0 w-full h-1 bg-primary"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6, duration: 0.6 }}
              />
            </span>
            ?
          </h2>
        </motion.div>
        
        <motion.p 
          className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          If your service already works, your brand should reflect it.<br />
          <span className="text-foreground font-medium">Let's build something that grows.</span>
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              size="default"
              className="group text-base px-8 py-5 rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300"
              onClick={() => window.open('https://calendly.com/robertogaunaj/demo-presentation', '_blank')}
            >
              Book a Strategy Call
              <motion.span
                className="ml-2"
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <ArrowRight className="w-5 h-5" />
              </motion.span>
            </Button>
          </motion.div>
        </motion.div>
        
        {/* Trust indicators */}
        <motion.div
          className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.7 }}
        >
          <span>✓ 15-minute call</span>
          <span>✓ No commitment</span>
          <span>✓ Personalized strategy</span>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASectionEN;
