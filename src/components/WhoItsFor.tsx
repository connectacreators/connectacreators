import { motion } from "framer-motion";
import { FloatingOrb } from "./ui/FloatingElements";
import { Check, Stethoscope, Scale, Lightbulb, TrendingUp, Briefcase } from "lucide-react";

const audiences = [
  { text: "Profesionales con servicios probados", icon: Briefcase },
  { text: "Clínicas y consultorios médicos", icon: Stethoscope },
  { text: "Abogados y marcas legales", icon: Scale },
  { text: "Coaches y consultores", icon: Lightbulb },
  { text: "Líderes de ventas y emprendedores", icon: TrendingUp },
];

const WhoItsFor = () => {
  return (
    <section className="relative py-24 md:py-32 bg-background overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-64 h-64 bg-primary/20 top-10 right-20" delay={1.5} />
      <FloatingOrb className="w-48 h-48 bg-primary/15 bottom-40 left-10" delay={0} />
      
      <div className="relative max-w-4xl mx-auto px-6">
        <motion.h2 
          className="text-3xl md:text-5xl font-bold text-foreground mb-12 tracking-tight text-center"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          Para quién es <span className="italic">Connecta</span>
        </motion.h2>
        
        <div className="space-y-4 mb-12">
          {audiences.map((audience, index) => (
            <motion.div 
              key={index}
              className="group flex items-center gap-4 p-4 rounded-xl border border-transparent hover:border-primary/20 hover:bg-card/50 transition-all duration-300 cursor-default"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ x: 10 }}
            >
              <motion.div 
                className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors"
                whileHover={{ scale: 1.1, rotate: 10 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <audience.icon className="w-5 h-5 text-primary" />
              </motion.div>
              <span className="text-lg md:text-xl text-foreground group-hover:text-primary transition-colors">
                {audience.text}
              </span>
              <motion.div 
                className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                initial={{ scale: 0 }}
                whileHover={{ scale: 1 }}
              >
                <Check className="w-5 h-5 text-primary" />
              </motion.div>
            </motion.div>
          ))}
        </div>
        
        <motion.div
          className="relative p-8 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <p className="text-lg md:text-xl text-foreground">
            Si quieres ser <span className="text-primary font-medium">visible</span>, <span className="text-primary font-medium">confiable</span> y <span className="text-primary font-medium">tomado en serio</span> online, esto es para ti.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default WhoItsFor;
