import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";

interface WorkflowStepProps {
  id: string;
  type: "trigger" | "action";
  service: string;
  action: string;
  label: string;
  stepNumber: number;
  onEdit: () => void;
  onDelete: () => void;
}

const SERVICE_CONFIG = {
  webhooks: { name: "Webhooks", emoji: "🪝", color: "bg-orange-500/20 text-orange-400", borderColor: "border-orange-500/30" },
  formatter: { name: "Formatter", emoji: "📅", color: "bg-orange-500/20 text-orange-400", borderColor: "border-orange-500/30" },
  notion: { name: "Notion", emoji: "📝", color: "bg-slate-600/20 text-slate-300", borderColor: "border-slate-600/30" },
  email: { name: "Zoho Mail", emoji: "📧", color: "bg-blue-500/20 text-blue-400", borderColor: "border-blue-500/30" },
  sms: { name: "Twilio", emoji: "💬", color: "bg-red-500/20 text-red-400", borderColor: "border-red-500/30" },
  delay: { name: "Delay", emoji: "⏱️", color: "bg-orange-500/20 text-orange-400", borderColor: "border-orange-500/30" },
  filter: { name: "Filter / If", emoji: "🔀", color: "bg-amber-500/20 text-amber-400", borderColor: "border-amber-500/30" },
};

export default function WorkflowStep({ id, type, service, stepNumber, label, onEdit, onDelete }: WorkflowStepProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const config = SERVICE_CONFIG[service as keyof typeof SERVICE_CONFIG] || { name: service, emoji: "⚙️", color: "bg-gray-500/20 text-gray-400", borderColor: "border-gray-500/30" };

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={`card-glass-17 p-4 flex items-center gap-4 border-l-4 ${
        type === "trigger"
          ? "border-l-orange-500"
          : service === "filter"
          ? "border-l-amber-500"
          : "border-l-purple-500"
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      {/* Drag Handle */}
      <div {...attributes} {...listeners} className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
        <GripVertical className="w-5 h-5" />
      </div>

      {/* Step Number */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
        {stepNumber}
      </div>

      {/* Service Icon & Info */}
      <div className="flex items-center gap-3 flex-1">
        <span className="text-2xl">{config.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${config.color} px-2 py-1 rounded-full w-fit mb-1`}>{config.name}</p>
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          className="h-8 w-8 p-0"
          title="Edit step"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          title="Delete step"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
