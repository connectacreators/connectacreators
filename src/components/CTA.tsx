import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Calendar, MessageSquare, Sparkles } from "lucide-react";

const CTA = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-bg" />
      <div className="absolute top-10 left-10 w-32 h-32 rounded-full gradient-hero opacity-20 blur-3xl animate-glow" />
      <div className="absolute bottom-20 right-20 w-40 h-40 rounded-full bg-primary/20 blur-3xl animate-glow" style={{animationDelay: '1s'}} />
      
      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <div className="animate-slide-up">
          <div className="inline-flex items-center gap-2 glass-card px-6 py-3 rounded-full mb-8">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Es tu momento</span>
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="text-foreground">Conviértete en la próxima</span>
            <br />
            <span className="gradient-hero bg-clip-text text-transparent">marca que factura miles</span>
            <br />
            <span className="text-foreground">con Connecta</span>
          </h2>
          
          <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
            No esperes más. Únete a los emprendedores que ya están automatizando su crecimiento 
            y multiplicando sus ingresos con nuestro sistema de <strong className="text-primary">IA + Social Media</strong>.
          </p>
        </div>

        {/* CTA Options */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <Card className="border-0 shadow-glow glass-blue group hover:scale-105 transition-bounce animate-scale-in">
            <CardContent className="p-8">
              <Calendar className="w-12 h-12 text-white mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-bold text-white mb-4">
                Consulta Estratégica Gratuita
              </h3>
              <p className="text-white/90 mb-6 leading-relaxed">
                Agenda una llamada de 30 minutos donde analizaremos tu situación actual 
                y diseñaremos una estrategia personalizada para tu crecimiento.
              </p>
              <Button variant="secondary" size="lg" className="w-full group">
                Agendar llamada gratis
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-glow glass-card group hover:scale-105 transition-bounce animate-scale-in" style={{animationDelay: '0.2s'}}>
            <CardContent className="p-8">
              <MessageSquare className="w-12 h-12 text-primary mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-bold text-foreground mb-4">
                Análisis Rápido WhatsApp
              </h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Envíanos un mensaje y en menos de 24 horas recibirás un análisis 
                gratuito de tu marca con recomendaciones específicas.
              </p>
              <Button variant="cta" size="lg" className="w-full group">
                Escribir por WhatsApp
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Urgency and social proof */}
        <div className="glass-card p-8 rounded-3xl max-w-4xl mx-auto animate-fade-in" style={{animationDelay: '0.5s'}}>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-primary mb-2">🔥</div>
              <div className="text-sm text-muted-foreground">Solo 5 cupos disponibles este mes</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">⚡</div>
              <div className="text-sm text-muted-foreground">Resultados visibles en 30 días</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">🏆</div>
              <div className="text-sm text-muted-foreground">Garantía de satisfacción 100%</div>
            </div>
          </div>
        </div>

        {/* Final message */}
        <div className="mt-12">
          <p className="text-lg text-muted-foreground">
            <strong className="text-foreground">¿Sigues dudando?</strong> Recuerda que cada día que pases 
            sin automatizar tu crecimiento es una oportunidad perdida de generar ingresos.
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTA;