import { memo, useState } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { Bot, X } from "lucide-react";
import CanvasAIPanel, { type CanvasContext } from "./CanvasAIPanel";
import ScriptOutputPanel from "./ScriptOutputPanel";

interface AIAssistantData {
  canvasContext: CanvasContext;
  clientInfo?: { name?: string; target?: string };
  authToken: string | null;
  format: string;
  language: "en" | "es";
  aiModel: string;
  remixMode?: boolean;
  remixContext?: {
    channel_username: string;
    format: string | null;
    prompt_hint: string | null;
  } | null;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  onSaveScript: (script: any) => Promise<void>;
  onDelete?: () => void;
}

const EMPTY_CONTEXT: CanvasContext = {
  transcriptions: [],
  structures: [],
  text_notes: "",
  research_facts: [],
  primary_topic: "",
};

const AIAssistantNode = memo(({ data }: NodeProps) => {
  const d = data as AIAssistantData;
  const [generatedScript, setGeneratedScript] = useState<any>(null);

  return (
    <div
      className="bg-white/95 dark:bg-[#252525] backdrop-blur-sm border border-border/60 dark:border-white/8 rounded-2xl shadow-2xl flex flex-col"
      style={{ width: "100%", height: "100%", minWidth: "340px", minHeight: "400px" }}
    >
      <NodeResizer
        minWidth={340}
        minHeight={400}
        handleStyle={{ background: "transparent", border: "none", opacity: 0, width: 14, height: 14 }}
        lineStyle={{ border: "none" }}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-primary/10 border-b border-primary/20 flex-shrink-0 cursor-default">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">Connecta AI</span>
          <span className="text-[9px] text-muted-foreground">Draw edges from nodes to connect context</span>
        </div>
        {d.onDelete && (
          <button
            onClick={d.onDelete}
            className="nodrag p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Content — nodrag + nowheel prevents canvas drag/scroll capture */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 nodrag nowheel">
        {generatedScript ? (
          <ScriptOutputPanel
            script={generatedScript}
            onSave={() => d.onSaveScript(generatedScript)}
            onClear={() => setGeneratedScript(null)}
          />
        ) : (
          <CanvasAIPanel
            canvasContext={d.canvasContext ?? EMPTY_CONTEXT}
            clientInfo={d.clientInfo}
            onGenerateScript={setGeneratedScript}
            authToken={d.authToken}
            format={d.format}
            language={d.language}
            aiModel={d.aiModel || "claude-haiku-4-5"}
            remixMode={d.remixMode ?? false}
            remixContext={d.remixContext ?? null}
            onFormatChange={d.onFormatChange}
            onLanguageChange={d.onLanguageChange}
            onModelChange={d.onModelChange}
          />
        )}
      </div>

      {/* Handle — content nodes connect TO this node (source → target) */}
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70" />
    </div>
  );
});

AIAssistantNode.displayName = "AIAssistantNode";
export default AIAssistantNode;
