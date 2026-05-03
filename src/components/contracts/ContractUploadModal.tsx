import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  storage_path: string;
}

interface Props {
  clientId: string;
  fromTemplate: Template | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function ContractUploadModal({ clientId, fromTemplate, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState(fromTemplate?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!fromTemplate && !file) { toast.error("Please select a PDF file"); return; }

    setUploading(true);
    try {
      const contractId = crypto.randomUUID();
      const originalPath = `${clientId}/${contractId}/original.pdf`;

      if (fromTemplate) {
        const { data: templateFile, error: dlErr } = await supabase.storage
          .from("contract-templates")
          .download(fromTemplate.storage_path);
        if (dlErr || !templateFile) throw new Error("Failed to read template");

        const { error: upErr } = await supabase.storage
          .from("contracts")
          .upload(originalPath, templateFile, { contentType: "application/pdf" });
        if (upErr) throw new Error("Failed to copy template");
      } else {
        if (file!.size > 10 * 1024 * 1024) throw new Error("File must be under 10MB");
        const { error: upErr } = await supabase.storage
          .from("contracts")
          .upload(originalPath, file!, { contentType: "application/pdf" });
        if (upErr) throw new Error("Upload failed");
      }

      const { error: dbErr } = await supabase.from("contracts").insert({
        id: contractId,
        client_id: clientId,
        template_id: fromTemplate?.id ?? null,
        created_by: user!.id,
        title: title.trim(),
        original_storage_path: originalPath,
        status: "draft",
      });
      if (dbErr) throw new Error(dbErr.message);

      toast.success("Contract created");
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create contract");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fromTemplate ? `New contract from: ${fromTemplate.name}` : "Upload Contract PDF"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label className="text-xs mb-1.5 block">Contract title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Service Agreement 2026"
            />
          </div>

          {!fromTemplate && (
            <div>
              <Label className="text-xs mb-1.5 block">PDF file (max 10MB)</Label>
              {file ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-card/30">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-foreground flex-1 truncate">{file.name}</span>
                  <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-border/50 rounded-lg p-6 flex flex-col items-center gap-2 hover:border-border transition-colors"
                >
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Click to select PDF</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={uploading} className="btn-17-primary gap-2">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Creating..." : "Create Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
