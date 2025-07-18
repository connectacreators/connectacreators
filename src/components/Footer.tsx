import { Button } from "@/components/ui/button";
import { Instagram, Linkedin, Twitter, Mail, Phone } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-secondary text-secondary-foreground py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <h3 className="text-2xl font-bold gradient-hero bg-clip-text text-transparent">
                Connecta
              </h3>
              <p className="text-white/80 text-sm">AI + Social Media</p>
            </div>
            <p className="text-white/70 leading-relaxed mb-6 max-w-md">
              Transformamos tu presencia digital en ingresos reales y automatizados. 
              La agencia que combina viralidad con inteligencia artificial.
            </p>
            <div className="flex gap-4">
              <Button variant="ghost" size="icon" className="text-white/60 hover:text-primary">
                <Instagram className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white/60 hover:text-primary">
                <Linkedin className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white/60 hover:text-primary">
                <Twitter className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-bold text-white mb-4">Servicios</h4>
            <ul className="space-y-3 text-white/70">
              <li><a href="#servicios" className="hover:text-primary transition-colors">Contenido Viral</a></li>
              <li><a href="#servicios" className="hover:text-primary transition-colors">Publicidad en Redes</a></li>
              <li><a href="#servicios" className="hover:text-primary transition-colors">Automatización IA</a></li>
              <li><a href="#servicios" className="hover:text-primary transition-colors">Embudos de Conversión</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-white mb-4">Contacto</h4>
            <div className="space-y-3 text-white/70">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-primary" />
                <a href="mailto:hola@connecta.com" className="hover:text-primary transition-colors">
                  hola@connecta.com
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-primary" />
                <a href="tel:+1234567890" className="hover:text-primary transition-colors">
                  +1 (234) 567-890
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-white/10 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/60 text-sm">
              © 2024 Connecta. Todos los derechos reservados.
            </p>
            <div className="flex gap-6 text-sm text-white/60">
              <a href="#" className="hover:text-primary transition-colors">Términos y Condiciones</a>
              <a href="#" className="hover:text-primary transition-colors">Política de Privacidad</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;