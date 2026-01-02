import { motion } from "framer-motion";
import { FileText, Video, Users, Megaphone } from "lucide-react";
import { FloatingOrb } from "./ui/FloatingElements";

const services = [
  {
    icon: FileText,
    title: "20 Viral Short-Form Scripts per Month",
    description: "Scripts engineered for attention, retention, and authority across Instagram, TikTok, and YouTube Shorts."
  },
  {
    icon: Video,
    title: "High-Performance Video Editing",
    description: "Fast-paced, scroll-stopping edits designed for watch time and shares, not just aesthetics."
  },
  {
    icon: Users,
    title: "Coaching & Creative Direction",
    description: "Clear guidance on what to film, how to film it, and how to communicate on camera like a personal brand."
  },
  {
    icon: Megaphone,
    title: "Paid Ads Amplification",
    description: "Strategic promotion of winning content to accelerate growth and reach the right audience faster."
  }
];

const WhatWeDoSection = () => {
  return (
    <section className="relative py-24 md:py-32 bg-background overflow-hidden">
      {/* Background elements */}
      <FloatingOrb className="w-72 h-72 bg-primary/20 top-20 -right-36" delay={0.5} />
      <FloatingOrb className="w-56 h-56 bg-primary/15 bottom-40 -left-28" delay={2.5} />
      
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.h2 
          className="text-3xl md:text-5xl font-bold text-foreground mb-16 tracking-tight text-center"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          What you get with{" "}
          <span className="text-primary">Connecta</span>
        </motion.h2>
        
        <div className="grid md:grid-cols-2 gap-8">
          {services.map((service, index) => (
            <motion.div 
              key={index}
              className="group relative p-8 rounded-2xl border border-border bg-card overflow-hidden"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ y: -8, borderColor: "hsl(var(--primary) / 0.5)" }}
            >
              {/* Hover glow effect */}
              <motion.div 
                className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              
              {/* Number indicator */}
              <span className="absolute top-4 right-4 text-6xl font-bold text-primary/10 group-hover:text-primary/20 transition-colors">
                {String(index + 1).padStart(2, '0')}
              </span>
              
              <div className="relative">
                <motion.div
                  whileHover={{ rotate: 10, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <service.icon className="w-10 h-10 text-primary mb-6" />
                </motion.div>
                <h3 className="text-xl font-bold text-foreground mb-4 text-center">
                  {service.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed text-center">
                  {service.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhatWeDoSection;
