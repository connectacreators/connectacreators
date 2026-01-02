import { motion } from "framer-motion";
import abogadoJonathan from "@/assets/abogado-jonathan.webp";
import drCalvin from "@/assets/dr-calvin-new.webp";
import zigufit from "@/assets/zigufit-profile.jpg";

const caseStudies = [
  {
    name: "Abogado Jonathan",
    timeline: "~9 meses",
    image: abogadoJonathan,
    before: "378K",
    after: "1.28M"
  },
  {
    name: "Clínica Dr. Calvin",
    timeline: "menos de 2 meses",
    image: drCalvin,
    before: "0",
    after: "6,700"
  },
  {
    name: "ZiguFit (Creadora Fitness)",
    timeline: "5 meses",
    image: zigufit,
    before: "1,000",
    after: "17,700"
  }
];

const overallStats = [
  { platform: "Instagram", views: "50M+", label: "vistas en" },
  { platform: "TikTok", views: "200M+", label: "vistas en" },
  { platform: "YouTube", views: "20M+", label: "vistas en" }
];

const ResultsSection = () => {
  return (
    <section className="relative py-24 md:py-32 bg-background overflow-hidden">
      {/* Static background elements */}
      <div className="absolute w-80 h-80 rounded-full bg-primary/25 blur-3xl top-20 -left-40 hidden md:block" />
      <div className="absolute w-64 h-64 rounded-full bg-primary/15 blur-3xl bottom-20 right-10 hidden md:block" />
      
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.h2 
          className="text-3xl md:text-5xl font-bold text-foreground mb-16 tracking-tight text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Crecimiento real. <span className="text-primary">Números reales.</span>
        </motion.h2>
        
        {/* Case Studies */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {caseStudies.map((study, index) => (
            <motion.div 
              key={index}
              className="group relative p-8 rounded-2xl border border-border bg-card overflow-hidden hover:-translate-y-2 transition-transform duration-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              {/* Glow effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="relative">
                {study.image && (
                  <div className="relative mb-4">
                    <img 
                      src={study.image} 
                      alt={study.name}
                      className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all"
                      loading="lazy"
                    />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-xs text-primary-foreground">✓</span>
                    </div>
                  </div>
                )}
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {study.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Tiempo: {study.timeline}
                </p>
                
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{study.before}</span>
                  <span className="text-primary text-xl">→</span>
                  <span className="text-primary font-bold text-xl">{study.after}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">seguidores</p>
              </div>
            </motion.div>
          ))}
        </div>
        
        {/* Overall Stats */}
        <motion.div 
          className="relative p-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/5 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {/* Static background pattern */}
          <div className="absolute inset-0 opacity-5 hidden md:block" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, hsl(var(--primary)) 1px, transparent 0)`,
            backgroundSize: '30px 30px'
          }} />
          
          <h3 className="text-lg font-bold text-muted-foreground mb-8 uppercase tracking-wider">
            Historial de Connecta
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {overallStats.map((stat, index) => (
              <motion.div 
                key={index} 
                className="text-center"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <p className="text-4xl md:text-6xl font-bold text-primary mb-2">
                  {stat.views}
                </p>
                <p className="text-muted-foreground">
                  vistas en {stat.platform}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ResultsSection;
