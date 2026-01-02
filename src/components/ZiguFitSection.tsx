import { motion } from "framer-motion";
import { FloatingOrb, GradientLine } from "./ui/FloatingElements";
import { ArrowRight } from "lucide-react";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after.png";

const ZiguFitSection = () => {
  return (
    <section className="relative py-24 md:py-32 bg-background overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-96 h-96 bg-primary/20 -top-48 -right-48" delay={0} />
      <FloatingOrb className="w-64 h-64 bg-primary/15 bottom-20 left-10" delay={2} />
      
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
            La <span className="italic text-primary">transformación</span> es real
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Mira lo que pasa cuando la estrategia se encuentra con la ejecución
          </p>
        </motion.div>

        {/* Before / After comparison */}
        <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-12">
          {/* Before */}
          <motion.div
            className="relative group w-full max-w-[260px]"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-muted/50 to-muted/20 rounded-2xl blur-xl opacity-50" />
            <div className="relative p-3 rounded-2xl border border-border bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                  Antes
                </span>
                <span className="text-muted-foreground text-xs">@zigufit</span>
              </div>
              
              <div className="relative rounded-xl overflow-hidden">
                <img 
                  src={zigufitBefore} 
                  alt="ZiguFit before - 1,280 followers" 
                  className="w-full h-auto opacity-90 group-hover:opacity-100 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
              </div>
              
              <div className="mt-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">1,280</p>
                <p className="text-xs text-muted-foreground">seguidores</p>
              </div>
            </div>
          </motion.div>

          {/* Arrow indicator */}
          <motion.div 
            className="flex justify-center z-10"
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center md:rotate-0 rotate-90">
              <ArrowRight className="w-5 h-5 text-primary-foreground" />
            </div>
          </motion.div>

          {/* After */}
          <motion.div
            className="relative group w-full max-w-[260px]"
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-primary/10 rounded-2xl blur-xl opacity-70 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-3 rounded-2xl border border-primary/30 bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
                  Después
                </span>
                <span className="text-primary text-xs font-medium">@zigufit</span>
              </div>
              
              <div className="relative rounded-xl overflow-hidden">
                <img 
                  src={zigufitAfter} 
                  alt="ZiguFit after - 17.6K followers" 
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
              </div>
              
              <div className="mt-3 text-center">
                <motion.p 
                  className="text-2xl font-bold text-primary"
                  initial={{ scale: 0.5 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.6 }}
                >
                  17,600+
                </motion.p>
                <p className="text-xs text-muted-foreground">seguidores</p>
              </div>
            </div>
            
            {/* Growth indicator */}
            <motion.div 
              className="absolute -top-3 -right-3 px-3 py-1.5 rounded-full bg-primary shadow-lg shadow-primary/30"
              initial={{ opacity: 0, scale: 0, rotate: -10 }}
              whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, delay: 0.8 }}
              whileHover={{ scale: 1.1 }}
            >
              <span className="text-primary-foreground font-bold text-xs">+1,275%</span>
            </motion.div>
          </motion.div>
        </div>

        {/* Stats row */}
        <motion.div 
          className="mt-16 max-w-2xl mx-auto grid grid-cols-3 gap-4 md:gap-8 p-6 md:p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-sm"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <div className="text-center">
            <p className="text-2xl md:text-4xl font-bold text-foreground">5</p>
            <p className="text-xs md:text-sm text-muted-foreground">meses</p>
          </div>
          <div className="text-center border-x border-border">
            <p className="text-2xl md:text-4xl font-bold text-primary">2.6M+</p>
            <p className="text-xs md:text-sm text-muted-foreground">vistas en el mejor video</p>
          </div>
          <div className="text-center">
            <p className="text-2xl md:text-4xl font-bold text-foreground">442K</p>
            <p className="text-xs md:text-sm text-muted-foreground">likes totales</p>
          </div>
        </motion.div>

        {/* Caption */}
        <motion.p 
          className="text-center mt-8 text-muted-foreground"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 }}
        >
          Resultados reales de <span className="text-foreground font-medium">Zigurat Sofía</span> — Creadora de Fitness
        </motion.p>
      </div>
      
      <GradientLine className="absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default ZiguFitSection;
