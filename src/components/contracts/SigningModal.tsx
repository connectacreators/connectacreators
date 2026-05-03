import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FONTS = [
  { key: "dancing-script", label: "Dancing Script", family: "'Dancing Script', cursive" },
  { key: "great-vibes",    label: "Great Vibes",    family: "'Great Vibes', cursive"    },
  { key: "pinyon-script",  label: "Pinyon Script",  family: "'Pinyon Script', cursive"  },
];

interface Contract {
  id: string;
  title: string;
  original_storage_path: string;
  current_storage_path: string | null;
}

interface Props {
  contract: Contract;
  onClose: () => void;
  onSigned: (updatedContract: Contract) => void;
  role?: "admin" | "client";
}

export default function SigningModal({ contract, onClose, onSigned, role = "admin" }: Props) {
  const { user } = useAuth();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [font, setFont] = useState("dancing-script");
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!document.getElementById("contract-gfonts")) {
      const link = document.createElement("link");
      link.id = "contract-gfonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Pinyon+Script&display=swap";
      document.head.appendChild(link);
    }

    const loadProfile = async () => {
      const { data } = await supabase
        .from("videographers")
        .select("name")
        .eq("user_id", user!.id)
        .single();
      if (data?.name) setName(data.name);
    };
    loadProfile();

    supabase.storage.from("contracts").createSignedUrl(contract.original_storage_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    });
  }, [contract, user]);

  const handleSign = async () => {
    if (!name.trim()) { toast.error("Please enter your full name"); return; }
    setSigning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sign-contract", {
        body: {
          contract_id: contract.id,
          role,
          signature_name: name.trim(),
          signature_font: font,
        },
      });
      if (error) throw new Error(error.message);
      toast.success("Document signed");
      onSigned({ ...contract, current_storage_path: data?.path ?? contract.current_storage_path });
    } catch (err: any) {
      toast.error(err.message || "Failed to sign");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex">
      <div className="flex-1 flex flex-col border-r border-border/40">
        <div className="px-4 py-3 border-b border-border/40 bg-card/20 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{contract.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sign as Agency</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 bg-muted/10">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full min-h-[600px]" title="Contract" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      <div className="w-72 flex-shrink-0 flex flex-col p-5 gap-5 overflow-y-auto">
        <div>
          <p className="text-sm font-bold text-foreground">Your signature</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Type your full name. It will appear in cursive on the document.
          </p>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="text-sm" />
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

        <Button onClick={handleSign} disabled={signing || !name.trim()} className="w-full btn-17-primary gap-2">
          {signing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Sign Document
        </Button>

        <Button variant="outline" onClick={onClose} disabled={signing} className="w-full">
          Cancel
        </Button>
      </div>
    </div>
  );
}
