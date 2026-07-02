import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";

interface OutOfCreditsContextType {
  isOpen: boolean;
  showOutOfCreditsModal: () => void;
  hideOutOfCreditsModal: () => void;
}

const OutOfCreditsContext = createContext<OutOfCreditsContextType | null>(null);

export function OutOfCreditsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const showOutOfCreditsModal = useCallback(() => setIsOpen(true), []);
  const hideOutOfCreditsModal = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, showOutOfCreditsModal, hideOutOfCreditsModal }),
    [isOpen, showOutOfCreditsModal, hideOutOfCreditsModal],
  );

  return <OutOfCreditsContext.Provider value={value}>{children}</OutOfCreditsContext.Provider>;
}

export function useOutOfCredits() {
  const ctx = useContext(OutOfCreditsContext);
  if (!ctx) throw new Error("useOutOfCredits must be used within OutOfCreditsProvider");
  return ctx;
}
