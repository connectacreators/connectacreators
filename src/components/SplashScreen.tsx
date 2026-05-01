import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DecryptedText from "./DecryptedText";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onCompleteRef.current(), 450);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

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
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <DecryptedText
            text="Connecting..."
            speed={40}
            sequential
            revealDirection="start"
            animateOn="view"
            parentClassName="splash-decrypt"
            className="splash-revealed"
            encryptedClassName="splash-encrypted"
          />

          <style>{`
            .splash-decrypt {
              font-size: 14px;
              font-weight: 600;
              letter-spacing: 0.15em;
              font-family: inherit;
            }
            .splash-revealed {
              color: rgba(255,255,255,0.9);
            }
            .splash-encrypted {
              color: rgba(34,211,238,0.5);
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
