import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, User, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Contract {
  id: string;
  title: string;
}

interface Props {
  contract: Contract;
  defaultEmail: string;
  onClose: () => void;
  onSent: () => void;
}

export default function SendContractModal({ contract, defaultEmail, onClose, onSent }: Props) {
  const [method, setMethod] = useState<"email" | "in_app">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (method === "email" && !email.trim()) { toast.error("Email address is required"); return; }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-contract", {
        body: {
          contract_id: contract.id,
          send_method: method,
          client_email: method === "email" ? email.trim() : null,
          message: message.trim() || null,
        },
      });
      if (error) throw new Error(error.message);
      toast.success(method === "email" ? "Contract sent to client" : "Contract sent to client's dashboard");
      onSent();
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send for Signature</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">{contract.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Your signature is complete</p>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">How should the client sign?</Label>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setMethod("email")}
                className={`text-left p-3 rounded-lg border transition-all ${
                  method === "email" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Send email link</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                  Client gets a unique link by email. No login required.
                </p>
              </button>

              <button
                onClick={() => setMethod("in_app")}
                className={`text-left p-3 rounded-lg border transition-all ${
                  method === "in_app" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">In-app (Connecta account)</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                  Contract appears in client's Connecta dashboard next time they log in.
                </p>
              </button>
            </div>
          </div>

          {method === "email" && (
            <div>
              <Label className="text-xs mb-1.5 block">Client email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
          )}

          <div>
            <Label className="text-xs mb-1.5 block">Message (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi, please review and sign the attached contract..."
              rows={3}
              className="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending} className="btn-17-primary gap-2">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? "Sending..." : "Send to Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
