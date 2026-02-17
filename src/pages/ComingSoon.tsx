import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function ComingSoon() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        className="text-center max-w-md"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Clock className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">Coming Soon</h1>
        <p className="text-muted-foreground mb-8">
          Scheduling will be available soon. Our team will contact you shortly.
        </p>
        <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
      </motion.div>
    </div>
  );
}
