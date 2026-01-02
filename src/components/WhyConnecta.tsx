import { motion } from "framer-motion";
import { FloatingOrb, GradientLine } from "./ui/FloatingElements";
import { Brain, Smartphone, Compass, Rocket } from "lucide-react";

const pillars = [
  { label: "Psychology", icon: Brain },
  { label: "Platform knowledge", icon: Smartphone },
  { label: "Clear direction", icon: Compass },
  { label: "Execution", icon: Rocket },
];

const WhyConnecta = () => {
  return (
    <section className="relative py-24 md:py-32 bg-card overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-72 h-72 bg-primary/20 -top-36 left-20" delay={0.5} />
      <FloatingOrb className="w-48 h-48 bg-primary/15 bottom-20 -right-24" delay={2} />
      
      <div className="relative max-w-4xl mx-auto px-6">
        <motion.h2 
          className="text-3xl md:text-5xl font-bold text-foreground mb-8 tracking-tight text-center"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          Why this <span className="italic">works</span>
        </motion.h2>
        
        <motion.div 
          className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed mb-12 text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p>
            Most agencies post content and hope it works.<br />
            <span className="text-foreground font-medium">Connecta focuses on messaging, retention, and consistency.</span>
          </p>
        </motion.div>
        
        <div className="mb-12 text-center">
          <motion.p 
            className="text-foreground font-medium text-lg mb-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            We combine:
          </motion.p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {pillars.map((pillar, index) => (
              <motion.div 
                key={index}
                className="group relative p-6 rounded-2xl border border-primary/20 bg-background/50 backdrop-blur-sm text-center cursor-default overflow-hidden"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                whileHover={{ 
                  y: -5, 
                  borderColor: "hsl(var(--primary))",
                  backgroundColor: "hsl(var(--primary) / 0.1)"
                }}
              >
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <pillar.icon className="w-8 h-8 text-primary mx-auto mb-3" />
                </motion.div>
                <span className="relative text-foreground font-medium text-sm md:text-base">
                  {pillar.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
        
        <motion.div
          className="relative text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <p className="text-xl md:text-2xl text-foreground font-medium">
            So your content doesn't just exist.<br />
            <span className="text-primary">It performs.</span>
          </p>
        </motion.div>
      </div>
      
      <GradientLine className="absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default WhyConnecta;
