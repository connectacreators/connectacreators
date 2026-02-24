import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Loader2, Play, CheckCircle2, AlertCircle } from "lucide-react";

interface TestRunModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunTest: (data: TestData) => Promise<void>;
  isRunning: boolean;
  results?: TestRunResult | null;
}

export interface TestData {
  full_name: string;
  email: string;
  phone: string;
}

export interface TestRunResult {
  status: "completed" | "failed";
  execution_id?: string;
  duration?: number;
  steps_executed?: Array<{
    step_id: string;
    service: string;
    status: "completed" | "failed" | "skipped";
    error?: string;
  }>;
  error_message?: string;
}

export default function TestRunModal({
  open,
  onOpenChange,
  onRunTest,
  isRunning,
  results,
}: TestRunModalProps) {
  const [formData, setFormData] = useState<TestData>({
    full_name: "",
    email: "",
    phone: "",
  });

  const handleRunTest = async () => {
    if (!formData.full_name || !formData.email) {
      alert("Please fill in at least name and email");
      return;
    }
    await onRunTest(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test Run Workflow</DialogTitle>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test_name">Full Name</Label>
              <Input
                id="test_name"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                disabled={isRunning}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="test_email">Email</Label>
              <Input
                id="test_email"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isRunning}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="test_phone">Phone (optional)</Label>
              <Input
                id="test_phone"
                placeholder="+1234567890"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={isRunning}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isRunning}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRunTest}
                disabled={isRunning}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
                {isRunning ? "Running..." : "Run Test"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {results.status === "completed" ? (
              <>
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="font-semibold text-green-400">Test Passed</span>
                  </div>
                  <p className="text-sm text-green-300">
                    Workflow executed successfully in {results.duration}ms
                  </p>
                </div>

                {results.steps_executed && results.steps_executed.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Step Results:</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {results.steps_executed.map((step, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded text-xs font-mono ${
                            step.status === "completed"
                              ? "bg-green-500/10 text-green-400 border border-green-500/30"
                              : step.status === "skipped"
                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                              : "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}
                        >
                          <div className="font-semibold">{step.service}</div>
                          <div className="text-xs opacity-75">{step.status}</div>
                          {step.error && <div className="text-xs mt-1">{step.error}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="font-semibold text-red-400">Test Failed</span>
                </div>
                <p className="text-sm text-red-300">{results.error_message || "Unknown error"}</p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setFormData({ full_name: "", email: "", phone: "" });
                  // Reset results by re-opening modal
                }}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Play className="w-4 h-4" />
                Run Again
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
