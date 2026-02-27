import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface WorkflowAnalyticsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
}

interface ExecutionStats {
  total_runs: number;
  successful_runs: number;
  success_rate: number;
  most_failed_step: string | null;
  avg_duration_ms: number;
  chartData: Array<{
    date: string;
    runs: number;
    successful: number;
  }>;
}

export default function WorkflowAnalytics({
  open,
  onOpenChange,
  workflowId,
}: WorkflowAnalyticsProps) {
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && workflowId) {
      loadAnalytics();
    }
  }, [open, workflowId]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Fetch execution data from past 30 days
      const { data: executions, error: execError } = await supabase
        .from("workflow_executions")
        .select("*")
        .eq("workflow_id", workflowId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      if (execError) throw execError;

      // Calculate stats
      const total_runs = executions?.length || 0;
      const successful_runs = executions?.filter(e => e.status === 'completed').length || 0;
      const success_rate = total_runs > 0 ? Math.round((successful_runs / total_runs) * 100) : 0;

      // Find most failed step
      const stepFailures: Record<string, number> = {};
      executions?.forEach(execution => {
        if (execution.status === 'failed' && execution.last_failed_step) {
          stepFailures[execution.last_failed_step] = (stepFailures[execution.last_failed_step] || 0) + 1;
        }
      });
      const most_failed_step = Object.entries(stepFailures).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // Calculate average duration
      const durations = executions
        ?.filter(e => e.duration_ms)
        .map(e => e.duration_ms || 0) || [];
      const avg_duration_ms = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

      // Build chart data (runs per day)
      const chartData: Record<string, { runs: number; successful: number }> = {};

      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        chartData[dateStr] = { runs: 0, successful: 0 };
      }

      executions?.forEach(execution => {
        const dateStr = execution.created_at.split('T')[0];
        if (chartData[dateStr]) {
          chartData[dateStr].runs += 1;
          if (execution.status === 'completed') {
            chartData[dateStr].successful += 1;
          }
        }
      });

      const chartDataArray = Object.entries(chartData).map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        runs: data.runs,
        successful: data.successful,
      }));

      setStats({
        total_runs,
        successful_runs,
        success_rate,
        most_failed_step,
        avg_duration_ms,
        chartData: chartDataArray,
      });
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            Workflow Analytics
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading analytics...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-red-400 text-sm">
              <p>Failed to load analytics</p>
              <Button
                size="sm"
                variant="outline"
                onClick={loadAnalytics}
                className="mt-3"
              >
                Retry
              </Button>
            </div>
          </div>
        ) : stats ? (
          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {/* Stats Cards */}
            <div className="space-y-3 px-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.0 }}
                className="card-glass-17 p-4 space-y-1"
              >
                <p className="text-xs text-muted-foreground">Total Runs</p>
                <p className="text-2xl font-bold text-foreground">{stats.total_runs}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card-glass-17 p-4 space-y-1"
              >
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-green-400">{stats.success_rate}%</p>
                  <span className="text-xs text-muted-foreground">
                    ({stats.successful_runs}/{stats.total_runs})
                  </span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${stats.success_rate}%` }}
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card-glass-17 p-4 space-y-1"
              >
                <p className="text-xs text-muted-foreground">Average Duration</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats.avg_duration_ms < 1000
                    ? `${Math.round(stats.avg_duration_ms)}ms`
                    : `${(stats.avg_duration_ms / 1000).toFixed(1)}s`}
                </p>
              </motion.div>

              {stats.most_failed_step && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="card-glass-17 p-4 space-y-1 border border-red-500/30 bg-red-500/5"
                >
                  <p className="text-xs text-muted-foreground">Most Failed Step</p>
                  <p className="text-sm font-medium text-red-400 truncate">
                    {stats.most_failed_step}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Consider debugging or adding retry logic
                  </p>
                </motion.div>
              )}
            </div>

            {/* Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="px-4"
            >
              <div className="card-glass-17 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-foreground">Runs per Day (30 days)</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      stroke="rgba(255,255,255,0.5)"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="rgba(255,255,255,0.5)"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(20, 20, 30, 0.95)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                      }}
                      formatter={(value) => value}
                    />
                    <Line
                      type="monotone"
                      dataKey="runs"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="Total Runs"
                    />
                    <Line
                      type="monotone"
                      dataKey="successful"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      name="Successful"
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Total Runs</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>Successful</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}

        {/* Footer Actions */}
        <div className="border-t border-muted-foreground/10 pt-3 space-y-2 px-4">
          <Button
            onClick={loadAnalytics}
            variant="outline"
            className="w-full"
            size="sm"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Refreshing...
              </>
            ) : (
              "Refresh"
            )}
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="w-full"
            size="sm"
          >
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
