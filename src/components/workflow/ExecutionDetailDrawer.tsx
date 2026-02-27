import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { createClient } from '@supabase/supabase-js';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ExecutionDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executionId: string;
}

interface StepExecution {
  id: string;
  step_id: string;
  step_index: number;
  service: string;
  action: string;
  step_label: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'skipped';
  input_data: Record<string, any>;
  output_data: Record<string, any>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
}

interface Execution {
  id: string;
  workflow_id: string;
  status: string;
  duration_ms: number;
  created_at: string;
  trigger_data: Record<string, any>;
  workflow_version_id?: string;
  error_message?: string;
  last_failed_step?: string;
}

export function ExecutionDetailDrawer({ open, onOpenChange, executionId }: ExecutionDetailDrawerProps) {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [stepExecutions, setStepExecutions] = useState<StepExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !executionId) return;

    const loadExecutionDetails = async () => {
      setLoading(true);
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );

      try {
        // Load main execution record
        const { data: execData } = await supabase
          .from('workflow_executions')
          .select('*')
          .eq('id', executionId)
          .single();

        if (execData) {
          setExecution(execData);

          // Load step-by-step execution details
          const { data: stepData } = await supabase
            .from('workflow_step_executions')
            .select('*')
            .eq('execution_id', executionId)
            .order('step_index', { ascending: true });

          if (stepData) {
            setStepExecutions(stepData);
          }
        }
      } catch (error) {
        console.error('Failed to load execution details:', error);
      } finally {
        setLoading(false);
      }
    };

    loadExecutionDetails();
  }, [open, executionId]);

  const toggleStepExpanded = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'skipped':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'skipped':
        return '⊘';
      case 'running':
        return '⟳';
      default:
        return '○';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (!execution) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Execution Details</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading execution details...</div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* Summary */}
            <div className="space-y-3 pb-6 border-b">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge className={getStatusColor(execution.status)}>
                  {getStatusIcon(execution.status)} {execution.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Duration</span>
                <span className="text-sm text-muted-foreground">{formatDuration(execution.duration_ms)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Executed At</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(execution.created_at).toLocaleString()}
                </span>
              </div>
              {execution.last_failed_step && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Last Failed Step</span>
                  <span className="text-sm text-red-600">{execution.last_failed_step}</span>
                </div>
              )}
            </div>

            {/* Step Timeline */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Step Execution Timeline</h3>
              {stepExecutions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No steps executed</p>
              ) : (
                <div className="space-y-2">
                  {stepExecutions.map((step) => (
                    <div
                      key={step.id}
                      className="border rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => toggleStepExpanded(step.id)}
                        className="w-full p-3 hover:bg-muted/50 flex items-center justify-between text-left transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg font-semibold">{getStatusIcon(step.status)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {step.step_label || `${step.service}.${step.action}`}
                            </p>
                            <p className="text-xs text-muted-foreground">{step.service}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-3">
                          <Badge variant="outline" className={`text-xs ${getStatusColor(step.status)}`}>
                            {step.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDuration(step.duration_ms || 0)}
                          </span>
                          {expandedSteps.has(step.id) ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {expandedSteps.has(step.id) && (
                        <div className="px-3 pb-3 bg-muted/30 border-t space-y-3">
                          {/* Input Data */}
                          {step.input_data && Object.keys(step.input_data).length > 0 && (
                            <div>
                              <p className="text-xs font-semibold mb-2 text-muted-foreground">Input Data</p>
                              <pre className="bg-black/5 rounded p-2 text-xs overflow-auto max-h-32">
                                {JSON.stringify(step.input_data, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Output Data */}
                          {step.output_data && Object.keys(step.output_data).length > 0 && (
                            <div>
                              <p className="text-xs font-semibold mb-2 text-muted-foreground">Output</p>
                              <pre className="bg-green-500/10 rounded p-2 text-xs overflow-auto max-h-32">
                                {JSON.stringify(step.output_data, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Error */}
                          {step.error_message && (
                            <div>
                              <p className="text-xs font-semibold mb-2 text-red-600">Error</p>
                              <p className="bg-red-500/10 rounded p-2 text-xs text-red-700">
                                {step.error_message}
                              </p>
                            </div>
                          )}

                          {/* Timing */}
                          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                            <p>Started: {new Date(step.started_at).toLocaleTimeString()}</p>
                            {step.completed_at && (
                              <p>Completed: {new Date(step.completed_at).toLocaleTimeString()}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trigger Data (for context) */}
            {execution.trigger_data && Object.keys(execution.trigger_data).length > 0 && (
              <div className="space-y-2 pt-6 border-t">
                <h3 className="font-semibold text-sm">Trigger Data</h3>
                <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-32">
                  {JSON.stringify(execution.trigger_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
