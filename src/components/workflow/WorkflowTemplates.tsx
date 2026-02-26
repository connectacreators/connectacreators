import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { motion } from "framer-motion";
import type { WorkflowStep } from "@/pages/ClientWorkflow";

interface WorkflowTemplate {
  name: string;
  description: string;
  emoji: string;
  steps: Omit<WorkflowStep, 'id'>[];
}

interface WorkflowTemplatesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (steps: Omit<WorkflowStep, 'id'>[]) => void;
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: "New Lead → SMS + Email",
    description: "Send notification SMS and email when new lead arrives",
    emoji: "📬",
    steps: [
      {
        type: "trigger",
        service: "webhooks",
        action: "new_lead",
        label: "New Lead Webhook",
        config: {},
      },
      {
        type: "action",
        service: "sms",
        action: "send_sms",
        label: "Send SMS Notification",
        config: { to: "{{lead.phone}}", message: "Thanks for your interest! Someone will contact you soon." },
      },
      {
        type: "action",
        service: "email",
        action: "send_email",
        label: "Send Email Notification",
        config: {
          to: "{{lead.email}}",
          subject: "We Received Your Information",
          body: "Hi {{lead.name}},\n\nThank you for your interest. We'll be in touch soon!",
        },
      },
    ],
  },
  {
    name: "New Lead → Notion + SMS",
    description: "Save lead to Notion database and send SMS confirmation",
    emoji: "📝",
    steps: [
      {
        type: "trigger",
        service: "webhooks",
        action: "new_lead",
        label: "New Lead Webhook",
        config: {},
      },
      {
        type: "action",
        service: "notion",
        action: "create_record",
        label: "Create Notion Record",
        config: { database_id: "", title: "{{lead.name}}", updates: [] },
      },
      {
        type: "action",
        service: "sms",
        action: "send_sms",
        label: "Send SMS Confirmation",
        config: { to: "{{lead.phone}}", message: "Your information has been saved. We'll follow up soon!" },
      },
    ],
  },
  {
    name: "Status Changed → Notify",
    description: "Send email notification when lead status changes",
    emoji: "📧",
    steps: [
      {
        type: "trigger",
        service: "webhooks",
        action: "lead_status_changed",
        label: "Lead Status Changed",
        config: { status_to_watch: "interested" },
      },
      {
        type: "action",
        service: "email",
        action: "send_email",
        label: "Send Status Update Email",
        config: {
          to: "{{lead.email}}",
          subject: "Status Update",
          body: "Hi {{lead.name}},\n\nYour status has been updated. Here's what's next...",
        },
      },
    ],
  },
  {
    name: "Lead Qualification Flow",
    description: "Check if qualified, save to Notion if yes, notify if no",
    emoji: "🎯",
    steps: [
      {
        type: "trigger",
        service: "webhooks",
        action: "new_lead",
        label: "New Lead Received",
        config: {},
      },
      {
        type: "action",
        service: "filter",
        action: "if_condition",
        label: "Is Lead Qualified?",
        config: { field: "lead.status", operator: "equals", value: "interested" },
      },
      {
        type: "action",
        service: "notion",
        action: "create_record",
        label: "Save Qualified Lead",
        config: { database_id: "", title: "{{lead.name}}", updates: [] },
      },
      {
        type: "action",
        service: "email",
        action: "send_email",
        label: "Send Welcome Email",
        config: {
          to: "{{lead.email}}",
          subject: "Welcome!",
          body: "Hi {{lead.name}},\n\nWelcome to our program. Let's get started!",
        },
      },
    ],
  },
];

export default function WorkflowTemplates({
  open,
  onOpenChange,
  onSelectTemplate,
}: WorkflowTemplatesProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Workflow Templates
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
          {WORKFLOW_TEMPLATES.map((template, idx) => (
            <motion.button
              key={template.name}
              onClick={() => {
                onSelectTemplate(template.steps);
                onOpenChange(false);
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="card-glass-17 p-4 text-left hover:border-primary/50 transition-all hover:scale-105 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-3xl flex-shrink-0">{template.emoji}</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTemplate(template.steps);
                    onOpenChange(false);
                  }}
                  className="text-xs"
                >
                  Use
                </Button>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">
                  {template.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {template.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {template.steps
                  .filter(s => s.type === 'action')
                  .slice(0, 3)
                  .map((step) => (
                    <span key={step.label} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      {step.service === 'notion' && '📝'}
                      {step.service === 'email' && '📧'}
                      {step.service === 'sms' && '💬'}
                      {step.service === 'filter' && '🔀'}
                      {' '}{step.service}
                    </span>
                  ))}
              </div>
            </motion.button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          💡 Templates are starting points. You can add, remove, or modify steps after selection to customize your workflow.
        </div>
      </DialogContent>
    </Dialog>
  );
}
