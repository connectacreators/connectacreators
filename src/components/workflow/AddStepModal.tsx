import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";

export interface ServiceOption {
  id: string;
  service: string;
  action: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
}

const AVAILABLE_SERVICES: ServiceOption[] = [
  {
    id: "filter_condition",
    service: "filter",
    action: "if_condition",
    name: "Filter / If Condition",
    description: "Only continue if a condition is met",
    emoji: "🔀",
    color: "amber",
  },
  {
    id: "notion_create",
    service: "notion",
    action: "create_record",
    name: "Create Notion Record",
    description: "Create a new entry in a Notion database",
    emoji: "📝",
    color: "slate",
  },
  {
    id: "formatter_date",
    service: "formatter",
    action: "date_time",
    name: "Date / Time",
    description: "Format or manipulate dates and times",
    emoji: "📅",
    color: "orange",
  },
  {
    id: "notion_search",
    service: "notion",
    action: "search_record",
    name: "Search for matching record in...",
    description: "Find a record in your Notion database",
    emoji: "📝",
    color: "slate",
  },
  {
    id: "notion_update",
    service: "notion",
    action: "update_record",
    name: "Update Data Source Item",
    description: "Update an existing Notion record",
    emoji: "📝",
    color: "slate",
  },
  {
    id: "email_send",
    service: "email",
    action: "send_email",
    name: "Send Email",
    description: "Send an email via Zoho Mail",
    emoji: "📧",
    color: "blue",
  },
  {
    id: "sms_send",
    service: "sms",
    action: "send_sms",
    name: "Send SMS",
    description: "Send an SMS message via Twilio",
    emoji: "💬",
    color: "red",
  },
  {
    id: "whatsapp_send",
    service: "whatsapp",
    action: "send_whatsapp",
    name: "Send WhatsApp",
    description: "Send a WhatsApp message via Twilio",
    emoji: "💚",
    color: "green",
  },
  {
    id: "delay",
    service: "delay",
    action: "delay_until",
    name: "Delay Until",
    description: "Wait for a specified time",
    emoji: "⏱️",
    color: "orange",
  },
];

interface AddStepModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectService: (service: ServiceOption) => void;
}

const colorClasses = {
  orange: "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30",
  slate: "bg-slate-600/20 text-slate-300 hover:bg-slate-600/30",
  blue: "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
  red: "bg-red-500/20 text-red-400 hover:bg-red-500/30",
  amber: "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
  green: "bg-green-500/20 text-green-400 hover:bg-green-500/30",
};

export default function AddStepModal({ open, onOpenChange, onSelectService }: AddStepModalProps) {
  const fadeUp = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.05, duration: 0.2 },
    }),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose an action</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
          {AVAILABLE_SERVICES.map((service, i) => (
            <motion.button
              key={service.id}
              onClick={() => {
                onSelectService(service);
                onOpenChange(false);
              }}
              className={`card-glass-17 p-4 text-left transition-all hover:scale-105 ${colorClasses[service.color as keyof typeof colorClasses]}`}
              initial="hidden"
              animate="visible"
              custom={i}
              variants={fadeUp}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{service.emoji}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-foreground">{service.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{service.description}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
