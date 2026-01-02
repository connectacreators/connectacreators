import { motion } from "framer-motion";
import { FloatingOrb, GridPattern } from "./ui/FloatingElements";
import robertoImage from "@/assets/roberto-founder.png";
import signatureImage from "@/assets/roberto-signature.png";

const FounderSection = () => {
  return (
    <section className="relative py-24 md:py-32 bg-background overflow-hidden">
      {/* Background Elements */}
      <GridPattern />
      <FloatingOrb className="w-96 h-96 bg-primary/30 -top-48 -right-48" delay={0} />
      <FloatingOrb className="w-64 h-64 bg-primary/20 bottom-0 -left-32" delay={2} />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            {/* Photo */}
            <motion.div
              className="relative flex-shrink-0"
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-110" />
                
                {/* Image container */}
                <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden border border-primary/20">
                  <img
                    src={robertoImage}
                    alt="Roberto Gauna, Founder of Connecta Creators"
                    className="w-full h-full object-cover scale-150 object-[center_25%]"
                  />
                </div>
                
                {/* Decorative corner */}
                <div className="absolute -bottom-4 -right-4 w-24 h-24 border-r-2 border-b-2 border-primary/40 rounded-br-2xl" />
              </div>
            </motion.div>
            
            {/* Content */}
            <motion.div
              className="flex-1 text-center"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <motion.p
                className="text-primary font-medium tracking-widest uppercase text-xs md:text-sm mb-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                Meet the Founder
              </motion.p>
              
              <motion.h2
                className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-6"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                Roberto <span className="italic text-primary">Gauna</span>
              </motion.h2>
              
              <motion.div
                className="space-y-4 text-muted-foreground text-lg leading-relaxed text-left"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <p>
                  I started as a video editor and grew into a content strategist by obsessing over what actually makes content work. Along the way, I've helped generate over{" "}
                  <span className="text-primary font-semibold">215M+ views</span> across Instagram, TikTok, and YouTube by building systems that turn attention into real results.
                </p>
                <p>
                  Today, I help creators, professionals, and sales teams build brands with clear positioning, strong storytelling, and execution that scales. Connecta Creators exists because good content isn't enough.{" "}
                  <span className="text-foreground font-medium italic">Direction, consistency, and strategy</span> are what separate growth from noise.
                </p>
              </motion.div>
              
              {/* Signature */}
              <motion.div
                className="mt-8 flex justify-center"
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <img
                  src={signatureImage}
                  alt="Roberto's signature"
                  className="h-12 md:h-16 opacity-80 invert"
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FounderSection;
