import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface StepResult {
  step_id: string;
  service: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  output?: Record<string, any>;
  error?: string;
  duration?: number;
}

interface LiveRunDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Array<{ id: string; service: string; label: string }>;
  stepRunStatuses: Record<string, 'idle' | 'running' | 'passed' | 'failed'>;
  stepTestResults: Record<string, Record<string, any>>;
  isRunning: boolean;
  onRetry?: () => void;
}

const SERVICE_EMOJI: Record<string, string> = {
  email: "📧",
  sms: "💬",
  whatsapp: "💚",
  webhook: "🪝",
  notion: "📝",
  formatter: "📅",
  delay: "⏱️",
  filter: "🔀",
};

export default function LiveRunDrawer({
  open,
  onOpenChange,
  steps,
  stepRunStatuses,
  stepTestResults,
  isRunning,
  onRetry,
}: LiveRunDrawerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStepExpand = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  // Calculate overall status
  const allStepIds = steps.map(s => s.id);
  const completedSteps = allStepIds.filter(id => stepRunStatuses[id] === 'passed').length;
  const failedStepIndex = allStepIds.findIndex(id => stepRunStatuses[id] === 'failed');
  const hasFailure = failedStepIndex !== -1;
  const allCompleted = completedSteps === allStepIds.length && !hasFailure && !isRunning;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isRunning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
                Running...
              </>
            ) : allCompleted ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                All passed! ✓
              </>
            ) : hasFailure ? (
              <>
                <XCircle className="w-5 h-5 text-red-500" />
                <div className="flex flex-col gap-1">
                  <span>Failed at step {failedStepIndex + 1}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {steps[failedStepIndex]?.label || 'Unknown step'}
                  </span>
                </div>
              </>
            ) : (
              "Execution Logs"
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-4">
          {steps.map((step, idx) => {
            const status = stepRunStatuses[step.id] || 'idle';
            const output = stepTestResults[step.id];
            const emoji = SERVICE_EMOJI[step.service] || "⚙️";
            const isExpanded = expandedSteps.has(step.id);

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="card-glass-17 p-3 space-y-2"
              >
                {/* Step Header */}
                <button
                  onClick={() => toggleStepExpand(step.id)}
                  className="w-full flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
                >
                  {/* Step Number */}
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {idx + 1}
                  </div>

                  {/* Emoji */}
                  <span className="text-lg flex-shrink-0">{emoji}</span>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{step.label}</p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {status === 'running' && (
                      <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                    )}
                    {status === 'passed' && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                    {status === 'failed' && (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    {status === 'idle' && (
                      <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                    )}
                  </div>

                  {/* Expand Arrow */}
                  {output && (
                    <div className="flex-shrink-0 text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  )}
                </button>

                {/* Output Details */}
                {isExpanded && output && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pl-9 space-y-1 text-xs border-t border-muted-foreground/10 pt-2"
                  >
                    {Object.entries(output).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <p className="font-mono text-muted-foreground">{key}:</p>
                        <p className="font-mono text-foreground/80 break-words whitespace-pre-wrap">
                          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                        </p>
                      </div>
                    ))}
                  </motion.div>
                )}

                {/* Error Message */}
                {status === 'failed' && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="pl-9 space-y-2 mt-2"
                  >
                    <div className="border-l-2 border-red-500/50 bg-red-500/10 p-2 rounded text-xs space-y-1">
                      <div className="flex items-center gap-2 text-red-400 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        Error Details
                      </div>
                      <p className="font-mono text-red-300 break-words whitespace-pre-wrap">
                        {output?.error || 'Unknown error occurred'}
                      </p>
                      {output?.error_code && (
                        <div className="text-muted-foreground">
                          <span className="font-mono">Code: {output.error_code}</span>
                        </div>
                      )}
                    </div>

                    {/* Suggestions */}
                    <div className="text-xs text-muted-foreground space-y-1 pl-2">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Try increasing retry count or delay</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        <span>Check configuration values (URL, API key, etc.)</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Footer Actions */}
        {!isRunning && (
          <div className="border-t border-muted-foreground/10 pt-3 space-y-2">
            {onRetry && (
              <Button
                onClick={onRetry}
                variant="default"
                className="w-full"
                size="sm"
              >
                Retry
              </Button>
            )}
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="w-full"
              size="sm"
            >
              Close
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
