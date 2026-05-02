import { createContext, useContext, useState, ReactNode } from "react";

interface OutOfCreditsContextType {
  isOpen: boolean;
  showOutOfCreditsModal: () => void;
  hideOutOfCreditsModal: () => void;
}

const OutOfCreditsContext = createContext<OutOfCreditsContextType | null>(null);

export function OutOfCreditsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <OutOfCreditsContext.Provider
      value={{
        isOpen,
        showOutOfCreditsModal: () => setIsOpen(true),
        hideOutOfCreditsModal: () => setIsOpen(false),
      }}
    >
      {children}
    </OutOfCreditsContext.Provider>
  );
}

export function useOutOfCredits() {
  const ctx = useContext(OutOfCreditsContext);
  if (!ctx) throw new Error("useOutOfCredits must be used within OutOfCreditsProvider");
  return ctx;
}
