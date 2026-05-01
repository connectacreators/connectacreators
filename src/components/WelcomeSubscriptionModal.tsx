import { useEffect, useState } from "react";
import { CheckCircle, Zap, Star, Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface WelcomeSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  planType: string;
}

const PLAN_INFO: Record<string, {
  name: string;
  price: string;
  icon: typeof Zap;
  color: string;
  features: string[];
}> = {
  starter: {
    name: "Starter",
    price: "$39/month",
    icon: Zap,
    color: "text-blue-400",
    features: [
      "10,000 AI credits per month",
      "8 channel scrapes per month",
      "Script generator access",
      "Editing queue access",
      "Content calendar",
    ],
  },
  growth: {
    name: "Growth",
    price: "$79/month",
    icon: Star,
    color: "text-purple-400",
    features: [
      "30,000 AI credits per month",
      "15 channel scrapes per month",
      "Everything in Starter",
      "Priority support",
      "Advanced analytics",
    ],
  },
  enterprise: {
    name: "Pro",
    price: "$139/month",
    icon: Crown,
    color: "text-yellow-400",
    features: [
      "75,000 AI credits per month",
      "25 channel scrapes per month",
      "Everything in Growth",
      "Priority support",
      "Unlimited scripts",
    ],
  },
};

export default function WelcomeSubscriptionModal({ open, onClose, planType }: WelcomeSubscriptionModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (open) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const info = PLAN_INFO[planType] || PLAN_INFO.starter;
  const PlanIcon = info.icon;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 w-full max-w-md"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
          >
            <div className="rounded-2xl border border-white/10 bg-[#111] shadow-2xl overflow-hidden">
              {/* Header gradient */}
              <div className="relative bg-gradient-to-br from-primary/30 via-primary/10 to-transparent px-8 pt-10 pb-8 text-center">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Animated check + icon */}
                <motion.div
                  className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 border border-primary/30 mb-4 relative"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                >
                  <CheckCircle className="w-10 h-10 text-primary" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <p className="text-sm text-primary font-medium uppercase tracking-widest mb-1">
                    Registration Successful
                  </p>
                  <h2 className="text-2xl font-bold text-white mb-1">
                    Welcome to Connecta!
                  </h2>
                  <div className={`flex items-center justify-center gap-1.5 text-lg font-semibold ${info.color}`}>
                    <PlanIcon className="w-5 h-5" />
                    {info.name} Plan
                  </div>
                  <p className="text-white/40 text-sm mt-1">{info.price}</p>
                </motion.div>
              </div>

              {/* Features */}
              <div className="px-8 py-6">
                <p className="text-xs text-white/40 uppercase tracking-wider font-medium mb-3">
                  What's included
                </p>
                <ul className="space-y-2.5">
                  {info.features.map((feature, i) => (
                    <motion.li
                      key={feature}
                      className="flex items-center gap-3 text-sm text-white/80"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + i * 0.07 }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      {feature}
                    </motion.li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="px-8 pb-8">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={onClose}
                >
                  Get Started →
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
