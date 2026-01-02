import { motion } from "framer-motion";
import { FloatingOrb, GradientLine } from "./ui/FloatingElements";
import jonathanTiktok from "@/assets/jonathan-tiktok.png";
import jonathanInstagram from "@/assets/jonathan-instagram.png";

const ProblemSection = () => {
  return (
    <section className="relative py-24 md:py-32 bg-background overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-96 h-96 bg-primary/20 -top-48 -left-48" delay={0} />
      <FloatingOrb className="w-64 h-64 bg-primary/15 bottom-20 right-10" delay={2} />
      
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
            Real <span className="italic text-primary">results</span> across platforms
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            @elabogadojonathan — Immigration Lawyer dominating social media
          </p>
        </motion.div>

        {/* Instagram & TikTok side by side */}
        <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-12">
          {/* Instagram */}
          <motion.div
            className="relative group w-full max-w-[260px]"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="absolute -inset-1 bg-gradient-to-br from-pink-500/30 via-purple-500/20 to-orange-500/30 rounded-2xl blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-3 rounded-2xl border border-border bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-foreground text-xs font-medium">
                  Instagram
                </span>
                <span className="text-muted-foreground text-xs">@elabogadojonathan</span>
              </div>
              
              <div className="relative rounded-xl overflow-hidden">
                <img 
                  src={jonathanInstagram} 
                  alt="El Abogado Jonathan Instagram - 218K followers" 
                  className="w-full h-auto"
                />
              </div>
              
              <div className="mt-3 text-center">
                <motion.p 
                  className="text-2xl font-bold text-foreground"
                  initial={{ scale: 0.5 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
                >
                  218K
                </motion.p>
                <p className="text-xs text-muted-foreground">followers</p>
              </div>
            </div>
          </motion.div>

          {/* TikTok */}
          <motion.div
            className="relative group w-full max-w-[260px]"
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-cyan-400/20 rounded-2xl blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-3 rounded-2xl border border-primary/30 bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
                  TikTok
                </span>
                <span className="text-primary text-xs font-medium">@elabogadojonathan</span>
              </div>
              
              <div className="relative rounded-xl overflow-hidden">
                <img 
                  src={jonathanTiktok} 
                  alt="El Abogado Jonathan TikTok - 862.8K followers" 
                  className="w-full h-auto"
                />
              </div>
              
              <div className="mt-3 text-center">
                <motion.p 
                  className="text-2xl font-bold text-primary"
                  initial={{ scale: 0.5 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.6 }}
                >
                  862.8K
                </motion.p>
                <p className="text-xs text-muted-foreground">followers</p>
              </div>
            </div>
            
            {/* Verified badge */}
            <motion.div 
              className="absolute -top-3 -right-3 px-3 py-1.5 rounded-full bg-primary shadow-lg shadow-primary/30"
              initial={{ opacity: 0, scale: 0, rotate: -10 }}
              whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, delay: 0.8 }}
              whileHover={{ scale: 1.1 }}
            >
              <span className="text-primary-foreground font-bold text-xs">✓ Verified</span>
            </motion.div>
          </motion.div>
        </div>

        {/* Stats row */}
        <motion.div 
          className="mt-16 max-w-3xl mx-auto grid grid-cols-3 gap-4 md:gap-8 p-6 md:p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-sm"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <div className="text-center">
            <p className="text-2xl md:text-4xl font-bold text-foreground">1M+</p>
            <p className="text-xs md:text-sm text-muted-foreground">combined followers</p>
          </div>
          <div className="text-center border-x border-border">
            <p className="text-2xl md:text-4xl font-bold text-primary">7.4M</p>
            <p className="text-xs md:text-sm text-muted-foreground">TikTok likes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl md:text-4xl font-bold text-foreground">14.6M</p>
            <p className="text-xs md:text-sm text-muted-foreground">views in 30 days</p>
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
          Real results from <span className="text-foreground font-medium">Jonathan Shaw</span> — Immigration Lawyer
        </motion.p>
      </div>
      
      <GradientLine className="absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default ProblemSection;
