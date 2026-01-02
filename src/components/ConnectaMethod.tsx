import { motion } from "framer-motion";
import { FloatingOrb, GradientLine } from "./ui/FloatingElements";

const steps = [
  "Creamos guiones virales adaptados a tu nicho y personalidad",
  "Tú grabas con confianza usando nuestra guía",
  "Editamos y optimizamos para máxima retención",
  "Amplificamos el contenido ganador con ads",
  "Tu marca gana visibilidad, autoridad y momentum"
];

const ConnectaMethod = () => {
  return (
    <section className="relative py-24 md:py-32 bg-card overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-96 h-96 bg-primary/20 -top-48 -right-48" delay={0} />
      
      {/* Connecting line */}
      <div className="absolute left-1/2 md:left-[calc(50%-280px)] top-48 bottom-32 w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent hidden md:block" />
      
      <div className="relative max-w-4xl mx-auto px-6">
        <motion.h2 
          className="text-3xl md:text-5xl font-bold text-foreground mb-16 tracking-tight text-center"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          El Método <span className="italic">Connecta</span>
        </motion.h2>
        
        <div className="space-y-6">
          {steps.map((step, index) => (
            <motion.div 
              key={index}
              className="group flex items-start gap-6 p-6 rounded-xl border border-border bg-background/50 backdrop-blur-sm cursor-default"
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ 
                x: 10, 
                borderColor: "hsl(var(--primary) / 0.5)",
                backgroundColor: "hsl(var(--primary) / 0.05)"
              }}
            >
              <motion.span 
                className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-lg shadow-primary/30"
                whileHover={{ scale: 1.15, rotate: 10 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {index + 1}
              </motion.span>
              <p className="text-lg md:text-xl text-foreground pt-2 group-hover:text-foreground transition-colors">
                {step}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
      
      <GradientLine className="absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default ConnectaMethod;
