import { motion } from "framer-motion";
import { FloatingOrb, GradientLine } from "./ui/FloatingElements";
import { EyeOff, TrendingDown, HelpCircle } from "lucide-react";

const painPoints = [
  { icon: EyeOff, text: "Posting randomly with no results" },
  { icon: TrendingDown, text: "Following trends that don't fit your brand" },
  { icon: HelpCircle, text: "Not knowing what actually works" },
];

const ProblemSection = () => {
  return (
    <section className="relative py-24 md:py-32 bg-background overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-96 h-96 bg-destructive/30 -top-48 -left-48" delay={0} />
      <FloatingOrb className="w-64 h-64 bg-primary/20 bottom-20 right-10" delay={2} />
      
      <div className="relative max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 tracking-tight">
            Good businesses are{" "}
            <span className="relative inline-block">
              invisible
              <motion.span
                className="absolute -bottom-2 left-0 w-full h-1 bg-primary/50"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5, duration: 0.6 }}
              />
            </span>{" "}
            online.
          </h2>
        </motion.div>
        
        <motion.div 
          className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p>
            Most professionals know they're good at what they do, but social media isn't bringing them clients.
          </p>
        </motion.div>

        {/* Pain points with staggered animation */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {painPoints.map((point, index) => (
            <motion.div
              key={index}
              className="group p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-destructive/30 transition-all duration-300"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
              whileHover={{ y: -5, scale: 1.02 }}
            >
              <point.icon className="w-8 h-8 text-destructive/70 mb-4 group-hover:scale-110 transition-transform" />
              <p className="text-foreground font-medium">{point.text}</p>
            </motion.div>
          ))}
        </div>
        
        <motion.p 
          className="text-foreground font-medium text-xl md:text-2xl"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          Social media growth isn't luck.<br />
          <span className="text-primary">It's structure, messaging, and execution.</span>
        </motion.p>
      </div>
      
      <GradientLine className="absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default ProblemSection;
