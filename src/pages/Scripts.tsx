import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Film, Mic, Scissors, Sparkles, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import connectaLogo from "@/assets/connecta-logo.png";

type ScriptLine = {
  type: "filming" | "actor" | "editor";
  text: string;
};

const typeConfig = {
  filming: {
    label: "Instrucciones de Filmación",
    icon: Film,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    dot: "bg-red-500",
  },
  actor: {
    label: "Diálogo del Actor",
    icon: Mic,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    dot: "bg-purple-500",
  },
  editor: {
    label: "Instrucciones de Edición",
    icon: Scissors,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    dot: "bg-emerald-500",
  },
};

function parseScript(raw: string): ScriptLine[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  const result: ScriptLine[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (
      lower.startsWith("[filming]") ||
      lower.startsWith("[film]") ||
      lower.startsWith("[camera]") ||
      lower.startsWith("[cámara]") ||
      lower.startsWith("[filmación]")
    ) {
      result.push({ type: "filming", text: trimmed.replace(/^\[.*?\]\s*/i, "") });
    } else if (
      lower.startsWith("[actor]") ||
      lower.startsWith("[dialogue]") ||
      lower.startsWith("[diálogo]") ||
      lower.startsWith("[talent]") ||
      lower.startsWith("[talento]")
    ) {
      result.push({ type: "actor", text: trimmed.replace(/^\[.*?\]\s*/i, "") });
    } else if (
      lower.startsWith("[editor]") ||
      lower.startsWith("[edit]") ||
      lower.startsWith("[edición]") ||
      lower.startsWith("[post]")
    ) {
      result.push({ type: "editor", text: trimmed.replace(/^\[.*?\]\s*/i, "") });
    } else {
      // Default: treat as actor dialogue
      result.push({ type: "actor", text: trimmed });
    }
  }

  return result;
}

const exampleScript = `[filming] Plano medio del doctor en su consultorio, luz natural
[actor] ¿Sabías que el 80% de las personas no cuidan su piel correctamente?
[actor] Hoy te voy a dar 3 tips que van a cambiar tu rutina para siempre.
[filming] Close-up de productos en el escritorio
[editor] Agregar texto animado: "Tip #1"
[actor] Primero, siempre usa protector solar, incluso en días nublados.
[filming] Transición suave al siguiente plano
[editor] Insertar B-roll de aplicación de protector solar
[actor] Segundo, hidrata tu piel dos veces al día.
[editor] Agregar música de fondo suave
[filming] Plano cerrado del doctor señalando la cámara
[actor] Y tercero, nunca duermas con maquillaje puesto.
[editor] Pantalla final con logo y CTA: "Agenda tu cita"`;

export default function Scripts() {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ScriptLine[]>([]);

  const handleBreakdown = () => {
    if (!input.trim()) return;
    setParsed(parseScript(input));
  };

  const handleExample = () => {
    setInput(exampleScript);
    setParsed(parseScript(exampleScript));
  };

  const handleClear = () => {
    setInput("");
    setParsed([]);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-smooth text-sm">
              <ArrowLeft className="w-4 h-4" />
              Inicio
            </Link>
            <img src={connectaLogo} alt="Connecta" className="h-8" />
          </div>
          <span className="text-sm font-inter text-muted-foreground">Script Breakdown Tool</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Script <span className="text-primary">Breakdown</span>
          </h1>
          <p className="text-muted-foreground font-inter max-w-xl mx-auto">
            Pega tu guión usando tags como <code className="text-red-400">[filming]</code>, <code className="text-purple-400">[actor]</code>, y <code className="text-emerald-400">[editor]</code> para organizarlo visualmente.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {Object.entries(typeConfig).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2 text-sm font-inter">
              <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
              <span className={cfg.color}>{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="mb-6">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Escribe o pega tu guión aquí...\n\n[filming] Plano medio del talento\n[actor] Hola, bienvenidos a mi canal\n[editor] Agregar intro animada`}
            className="min-h-[200px] bg-card border-border font-mono text-sm resize-y"
          />
          <div className="flex flex-wrap gap-3 mt-4">
            <Button onClick={handleBreakdown} variant="cta" size="lg" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Desglosar Script
            </Button>
            <Button onClick={handleExample} variant="outline" size="lg">
              Ver Ejemplo
            </Button>
            {parsed.length > 0 && (
              <Button onClick={handleClear} variant="ghost" size="lg">
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Output */}
        {parsed.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            <h2 className="text-xl font-bold text-foreground mb-4 font-inter">
              Resultado — {parsed.length} líneas
            </h2>
            {parsed.map((line, i) => {
              const cfg = typeConfig[line.type];
              const Icon = cfg.icon;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-4 rounded-lg border ${cfg.bg} ${cfg.border} transition-smooth`}
                >
                  <div className={`mt-0.5 p-1.5 rounded-md ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color} font-inter`}>
                      {cfg.label}
                    </span>
                    <p className="text-foreground font-inter mt-1 text-sm leading-relaxed">
                      {line.text}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono mt-1">
                    #{i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
