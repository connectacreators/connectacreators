import { Instagram, Linkedin, Twitter } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border/10 py-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <h3 className="text-lg font-bold text-foreground/80 tracking-tight">
            Connecta
          </h3>

          <div className="flex items-center gap-6">
            <a href="#servicios" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Servicios</a>
            <a href="#proceso" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Proceso</a>
            <a href="#nosotros" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Nosotros</a>
          </div>

          <div className="flex items-center gap-4">
            <a href="#" className="text-muted-foreground/50 hover:text-foreground transition-colors">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="#" className="text-muted-foreground/50 hover:text-foreground transition-colors">
              <Linkedin className="w-4 h-4" />
            </a>
            <a href="#" className="text-muted-foreground/50 hover:text-foreground transition-colors">
              <Twitter className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground/40">
            © {new Date().getFullYear()} Connecta. Todos los derechos reservados.
          </p>
          <div className="flex gap-6 text-xs text-muted-foreground/40">
            <a href="/terms-and-conditions" className="hover:text-foreground transition-colors">Términos</a>
            <a href="/privacy-policy" className="hover:text-foreground transition-colors">Privacidad</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
