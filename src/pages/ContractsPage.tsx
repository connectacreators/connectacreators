import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ArrowLeft, Plus, FileText, Download, Send,
  FileX, LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ContractUploadModal from "@/components/contracts/ContractUploadModal";
import SigningModal from "@/components/contracts/SigningModal";
import SendContractModal from "@/components/contracts/SendContractModal";

type ContractStatus = "draft" | "awaiting_client" | "complete" | "voided";

interface Contract {
  id: string;
  title: string;
  status: ContractStatus;
  current_storage_path: string | null;
  original_storage_path: string;
  admin_signed_at: string | null;
  admin_signature_name: string | null;
  admin_signature_font: string | null;
  client_signed_at: string | null;
  send_method: string | null;
  client_email: string | null;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  storage_path: string;
}

function statusBadge(status: ContractStatus) {
  const cfg: Record<ContractStatus, { label: string; className: string }> = {
    draft:           { label: "Draft",          className: "bg-muted/50 text-muted-foreground border-border/40" },
    awaiting_client: { label: "Awaiting Client", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    complete:        { label: "Fully Signed",    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    voided:          { label: "Voided",          className: "bg-destructive/10 text-destructive border-destructive/30" },
  };
  const { label, className } = cfg[status] ?? cfg.draft;
  return <Badge variant="outline" className={`text-[10px] px-2 py-0 h-4 ${className}`}>{label}</Badge>;
}

function needsAdminSign(c: Contract) {
  return c.status === "draft" && !c.admin_signed_at;
}

export default function ContractsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fetching, setFetching] = useState(true);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFromTemplate, setUploadFromTemplate] = useState<Template | null>(null);
  const [signingContract, setSigningContract] = useState<Contract | null>(null);
  const [sendingContract, setSendingContract] = useState<Contract | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setFetching(true);
    try {
      const [{ data: clientData }, { data: contractData }, { data: templateData }] = await Promise.all([
        supabase.from("clients").select("name,email").eq("id", clientId).single(),
        supabase.from("contracts").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
        isAdmin ? supabase.from("contract_templates").select("*").order("name") : Promise.resolve({ data: [] }),
      ]);
      setClientName(clientData?.name ?? "");
      setClientEmail(clientData?.email ?? "");
      setContracts((contractData ?? []) as Contract[]);
      setTemplates((templateData ?? []) as Template[]);
    } catch {
      toast.error("Failed to load contracts");
    } finally {
      setFetching(false);
    }
  }, [clientId, isAdmin]);

  useEffect(() => {
    if (!loading && user) fetchData();
  }, [loading, user, fetchData]);

  const handleDownload = async (contract: Contract) => {
    const path = contract.current_storage_path ?? contract.original_storage_path;
    setDownloading(contract.id);
    try {
      const { data } = await supabase.storage.from("contracts").createSignedUrl(path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      else toast.error("Could not generate download link");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(null);
    }
  };

  const handleVoid = async (contract: Contract) => {
    if (!window.confirm("Void this contract? This cannot be undone.")) return;
    const { error } = await supabase.from("contracts").update({ status: "voided" }).eq("id", contract.id);
    if (error) { toast.error("Failed to void contract"); return; }
    toast.success("Contract voided");
    fetchData();
  };

  const handleSaveAsTemplate = async (contract: Contract) => {
    const name = window.prompt("Template name:", contract.title);
    if (!name?.trim()) return;
    const templateId = crypto.randomUUID();
    const destPath = `${templateId}/template.pdf`;
    const { data: fileData } = await supabase.storage.from("contracts").download(contract.original_storage_path);
    if (!fileData) { toast.error("Could not read contract PDF"); return; }
    const { error: upErr } = await supabase.storage.from("contract-templates").upload(destPath, fileData, { contentType: "application/pdf" });
    if (upErr) { toast.error("Failed to save template"); return; }
    const { error: dbErr } = await supabase.from("contract_templates").insert({
      id: templateId, name: name.trim(), storage_path: destPath, created_by: user!.id,
    });
    if (dbErr) { toast.error("Failed to save template"); return; }
    toast.success("Template saved");
    fetchData();
  };

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageTransition className="flex-1 flex flex-col min-h-screen">
      <div className="flex-1 px-4 sm:px-8 py-8 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {clientName || "Client"}
          </button>
          <span className="text-muted-foreground/30">/</span>
          <h1 className="text-lg font-bold text-foreground">Contracts</h1>
          {isAdmin && (
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                className="gap-1.5 h-7 text-xs btn-17-primary"
                onClick={() => { setUploadFromTemplate(null); setShowUpload(true); }}
              >
                <Plus className="w-3 h-3" />
                Upload PDF
              </Button>
            </div>
          )}
        </div>

        {contracts.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No contracts yet</p>
            {isAdmin && (
              <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setShowUpload(true)}>
                <Plus className="w-3.5 h-3.5" />
                Upload first contract
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-8">
            {contracts.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border bg-card/30 px-4 py-3 flex items-center gap-4 transition-all ${
                  needsAdminSign(c) ? "border-primary/40 hover:border-primary/60" : "border-border/50 hover:border-border/80"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                  c.status === "complete"
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : c.status === "awaiting_client" || needsAdminSign(c)
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-muted/30 border-border/30"
                }`}>
                  <FileText className={`w-4 h-4 ${
                    c.status === "complete" ? "text-emerald-400"
                    : c.status === "awaiting_client" || needsAdminSign(c) ? "text-amber-400"
                    : "text-muted-foreground"
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                    {c.admin_signed_at && ` · You signed ${new Date(c.admin_signed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    {c.client_signed_at && ` · Client signed ${new Date(c.client_signed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {statusBadge(c.status)}

                  {isAdmin && needsAdminSign(c) && (
                    <Button size="sm" className="h-7 text-xs btn-17-primary gap-1" onClick={() => setSigningContract(c)}>
                      Sign
                      <ArrowLeft className="w-3 h-3 rotate-180" />
                    </Button>
                  )}
                  {isAdmin && c.status === "draft" && !!c.admin_signed_at && (
                    <Button
                      size="sm"
                      className="h-7 text-xs btn-17-primary gap-1"
                      onClick={() => setSendingContract(c)}
                    >
                      <Send className="w-3 h-3" />
                      Send
                    </Button>
                  )}
                  {!isAdmin && c.status === "awaiting_client" && c.send_method === "in_app" && (
                    <Button
                      size="sm"
                      className="h-7 text-xs btn-17-primary gap-1"
                      onClick={() => setSigningContract(c)}
                    >
                      Sign
                      <ArrowLeft className="w-3 h-3 rotate-180" />
                    </Button>
                  )}
                  {isAdmin && c.status === "awaiting_client" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSendingContract(c)}>
                      <Send className="w-3 h-3" />
                      Resend
                    </Button>
                  )}
                  {c.status === "complete" && (
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => handleDownload(c)} disabled={downloading === c.id}
                    >
                      {downloading === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      Download
                    </Button>
                  )}
                  {isAdmin && c.status === "draft" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      title="Void contract"
                      onClick={() => handleVoid(c)}
                    >
                      <FileX className="w-3 h-3" />
                    </Button>
                  )}
                  {isAdmin && c.status === "complete" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => handleSaveAsTemplate(c)}>
                      <LayoutTemplate className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="border-t border-border/40 pt-6">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Templates</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setUploadFromTemplate(t); setShowUpload(true); }}
                  className="flex items-center gap-2 bg-card/30 border border-border/40 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-all"
                >
                  <LayoutTemplate className="w-3 h-3" />
                  {t.name}
                </button>
              ))}
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 bg-transparent border border-dashed border-border/30 rounded-lg px-3 py-2 text-xs text-muted-foreground/50 hover:border-border/60 hover:text-muted-foreground transition-all"
              >
                <Plus className="w-3 h-3" />
                Save current as template
              </button>
            </div>
          </div>
        )}
      </div>

      {showUpload && (
        <ContractUploadModal
          clientId={clientId!}
          fromTemplate={uploadFromTemplate}
          onClose={() => { setShowUpload(false); setUploadFromTemplate(null); }}
          onCreated={() => { setShowUpload(false); setUploadFromTemplate(null); fetchData(); }}
        />
      )}
      {signingContract && (
        <SigningModal
          contract={signingContract}
          role={isAdmin ? "admin" : "client"}
          onClose={() => setSigningContract(null)}
          onSigned={(updatedContract) => {
            setSigningContract(null);
            if (isAdmin) setSendingContract(updatedContract);
            fetchData();
          }}
        />
      )}
      {sendingContract && (
        <SendContractModal
          contract={sendingContract}
          defaultEmail={clientEmail}
          onClose={() => setSendingContract(null)}
          onSent={() => { setSendingContract(null); fetchData(); }}
        />
      )}
    </PageTransition>
  );
}
