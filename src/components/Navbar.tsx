import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import connectaLogo from "@/assets/connecta-logo.png";
import connectaLogoDark from "@/assets/connecta-logo-dark.png";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();

  const navItems = [
    { label: "Servicios", href: "#servicios" },
    { label: "Proceso", href: "#proceso" },
    { label: "Casos de Éxito", href: "#casos" },
    { label: "Nosotros", href: "#nosotros" }
  ];

  return (
    <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-background/60 border-b border-border/20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <img src={theme === "light" ? connectaLogoDark : connectaLogo} alt="Connecta" className="h-16" />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* CTA Button - Pill style */}
          <div className="hidden md:block">
            <Link to="/onboarding">
              <button className="rounded-full border border-foreground/20 px-5 py-1.5 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors">
                Empezar ahora
              </button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <X className="w-6 h-6 text-foreground" />
            ) : (
              <Menu className="w-6 h-6 text-foreground" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden border-t border-border/20 py-4 animate-fade-in">
            <div className="flex flex-col space-y-4">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium px-4 py-2"
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="px-4 pt-2">
                <Link to="/onboarding">
                  <button className="w-full rounded-full border border-foreground/20 px-5 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors">
                    Empezar ahora
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
