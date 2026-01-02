import { motion } from "framer-motion";

interface FloatingOrbProps {
  className?: string;
  delay?: number;
  duration?: number;
}

export const FloatingOrb = ({ className = "", delay = 0, duration = 6 }: FloatingOrbProps) => (
  <motion.div
    className={`absolute rounded-full blur-3xl opacity-20 ${className}`}
    animate={{
      y: [0, -30, 0],
      x: [0, 15, 0],
      scale: [1, 1.1, 1],
    }}
    transition={{
      duration,
      delay,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
);

export const GridPattern = ({ className = "" }: { className?: string }) => (
  <div 
    className={`absolute inset-0 opacity-[0.03] pointer-events-none ${className}`}
    style={{
      backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
      backgroundSize: '40px 40px'
    }}
  />
);

export const GradientLine = ({ className = "" }: { className?: string }) => (
  <motion.div 
    className={`h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent ${className}`}
    initial={{ scaleX: 0, opacity: 0 }}
    whileInView={{ scaleX: 1, opacity: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 1.5, ease: "easeOut" }}
  />
);

interface AnimatedCounterProps {
  value: string;
  className?: string;
}

export const AnimatedCounter = ({ value, className = "" }: AnimatedCounterProps) => (
  <motion.span
    className={className}
    initial={{ opacity: 0, scale: 0.5 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    transition={{ type: "spring", stiffness: 100, damping: 10 }}
  >
    {value}
  </motion.span>
);
