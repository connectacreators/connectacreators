import { motion } from "framer-motion";
import { FloatingOrb, GradientLine } from "./ui/FloatingElements";
import { Sparkles, Target, Zap } from "lucide-react";

const benefits = [
  { icon: Sparkles, label: "Claridad" },
  { icon: Target, label: "Ejecución" },
  { icon: Zap, label: "Momentum" },
];

const SolutionSection = () => {
  return (
    <section className="relative py-24 md:py-32 bg-card overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-80 h-80 bg-primary/30 -top-40 right-0" delay={1} />
      <FloatingOrb className="w-48 h-48 bg-primary/20 bottom-10 left-20" delay={3} />
      
      {/* Animated grid */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />
      
      <div className="relative max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 tracking-tight">
            Deja de adivinar.{" "}
            <span className="text-primary">Empieza a crecer.</span>
          </h2>
        </motion.div>
        
        <motion.div 
          className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed mb-12 text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p>
            Connecta Creators te proporciona claridad y ejecución para que puedas enfocarte en tu negocio mientras tu marca gana momentum online.
          </p>
        </motion.div>

        {/* Benefits with hover effects */}
        <div className="flex flex-wrap justify-center gap-6 mb-12">
          {benefits.map((benefit, index) => (
            <motion.div
              key={index}
              className="group flex items-center gap-3 px-6 py-4 rounded-full border border-primary/20 bg-background/50 backdrop-blur-sm cursor-default"
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1, type: "spring" }}
              whileHover={{ scale: 1.05, borderColor: "hsl(var(--primary))" }}
            >
              <benefit.icon className="w-5 h-5 text-primary group-hover:rotate-12 transition-transform" />
              <span className="text-foreground font-medium">{benefit.label}</span>
            </motion.div>
          ))}
        </div>
        
        <motion.div
          className="p-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent backdrop-blur-sm text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <p className="text-lg md:text-xl text-foreground">
            No solo hacemos contenido.<br />
            <span className="font-medium">Te ayudamos a presentarte con confianza, consistencia y dirección.</span>
          </p>
        </motion.div>
      </div>
      
      <GradientLine className="absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default SolutionSection;
