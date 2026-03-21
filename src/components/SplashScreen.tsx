import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // Start video at 1 second
    if (videoRef.current) {
      videoRef.current.currentTime = 1;
      videoRef.current.play().catch(() => {});
    }

    // Auto-dismiss after 1.2s
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onCompleteRef.current(), 450); // wait for fade-out
    }, 1200);

    return () => clearTimeout(timer);
  }, []); // stable — no dependency on onComplete

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "#06090c",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}
        >
          {/* Ring pulse */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.35, 0], scale: [0.5, 2.8] }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{
              position: "absolute", width: 200, height: 200, borderRadius: "50%",
              border: "1px solid rgba(34,211,238,.25)",
            }}
          />

          {/* Video */}
          <motion.video
            ref={videoRef}
            muted
            playsInline
            initial={{ opacity: 0, scale: 1.3, filter: "blur(20px) brightness(1.3) contrast(1.4)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px) brightness(1.3) contrast(1.4)" }}
            transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
            style={{
              height: 220, objectFit: "contain",
              mixBlendMode: "lighten",
              maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 75%)",
            }}
          >
            <source src="/assets/horse-splash.mp4" type="video/mp4" />
          </motion.video>

          {/* Loading bar */}
          <div style={{ width: 140, height: 2, borderRadius: 4, background: "rgba(255,255,255,.04)", marginTop: 32, overflow: "hidden" }}>
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #06B6D4, #84CC16)" }}
            />
          </div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            style={{ fontSize: 10, color: "rgba(255,255,255,.15)", letterSpacing: "0.2em", marginTop: 16, fontWeight: 500 }}
          >
            CONNECTA
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
