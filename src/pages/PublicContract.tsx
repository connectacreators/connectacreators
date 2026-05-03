import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FONTS = [
  { key: "dancing-script", label: "Dancing Script", family: "'Dancing Script', cursive" },
  { key: "great-vibes",    label: "Great Vibes",    family: "'Great Vibes', cursive"    },
  { key: "pinyon-script",  label: "Pinyon Script",  family: "'Pinyon Script', cursive"  },
];

interface PublicContractData {
  id: string;
  title: string;
  status: string;
  current_storage_path: string;
  signing_token_expires_at: string;
  admin_signature_name: string | null;
  client_signed_at: string | null;
}

export default function PublicContract() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<PublicContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [font, setFont] = useState("dancing-script");
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!document.getElementById("contract-pub-fonts")) {
      const link = document.createElement("link");
      link.id = "contract-pub-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Pinyon+Script&display=swap";
      document.head.appendChild(link);
    }

    async function load() {
      try {
        const { data, error: fetchErr } = await supabase
          .from("contracts")
          .select("id,title,status,current_storage_path,signing_token_expires_at,admin_signature_name,client_signed_at")
          .eq("signing_token", token!)
          .single();

        if (fetchErr || !data) { setError("Contract not found."); return; }
        if (data.status !== "awaiting_client") {
          setError(data.client_signed_at ? "This contract has already been signed." : "This contract is not ready for signing.");
          return;
        }
        if (new Date(data.signing_token_expires_at) < new Date()) {
          setError("This signing link has expired. Please contact the sender for a new link.");
          return;
        }

        setContract(data);

        const { data: urlData } = await supabase.storage
          .from("contracts")
          .createSignedUrl(data.current_storage_path, 3600);
        if (urlData?.signedUrl) setPdfUrl(urlData.signedUrl);
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const handleSign = async () => {
    if (!name.trim()) { toast.error("Please enter your full name"); return; }
    setSigning(true);
    try {
      const { error } = await supabase.functions.invoke("sign-contract", {
        body: {
          contract_id: contract.id,
          role: "client",
          signature_name: name.trim(),
          signature_font: font,
          signing_token: token,
        },
      });
      if (error) throw new Error(error.message);
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to sign. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3 px-4">
        <FileText className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-4">
        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
        <h2 className="text-lg font-semibold text-foreground">Contract signed</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Thank you. Your signature has been recorded. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="flex-1 flex flex-col border-r border-border/40">
        <div className="px-4 py-3 border-b border-border/40 bg-card/20">
          <p className="text-sm font-semibold text-foreground">{contract?.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Review the document before signing</p>
        </div>
        <div className="flex-1 bg-muted/10">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full min-h-[600px]" title="Contract PDF" />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Unable to load PDF preview
            </div>
          )}
        </div>
      </div>

      <div className="w-72 flex-shrink-0 flex flex-col p-5 gap-5 bg-card/10">
        <div>
          <p className="text-sm font-bold text-foreground">Your signature</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Type your full name. It will appear in cursive on the document.
          </p>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Full name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="text-sm"
          />
        </div>

        {name && (
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Preview</Label>
            <div className="bg-white border border-border rounded-md px-3 py-2 text-center">
              <span style={{ fontFamily: FONTS.find(f => f.key === font)?.family, fontSize: "24px", color: "#111" }}>
                {name}
              </span>
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Style</Label>
          <div className="flex flex-col gap-2">
            {FONTS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFont(f.key)}
                className={`text-left px-3 py-2 rounded-md border transition-all ${
                  font === f.key
                    ? "border-primary bg-primary/5"
                    : "border-border/40 bg-card/30 hover:border-border"
                }`}
              >
                <span style={{ fontFamily: f.family, fontSize: "18px", color: font === f.key ? "#d4af37" : "#888" }}>
                  {name || "Your Name"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          By signing, you agree this constitutes a legally binding electronic signature.
        </p>

        <Button
          onClick={handleSign}
          disabled={signing || !name.trim()}
          className="w-full btn-17-primary gap-2"
        >
          {signing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Sign Document
        </Button>
      </div>
    </div>
  );
}
