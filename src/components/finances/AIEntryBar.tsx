import { useState } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  disabled?: boolean;
  loading?: boolean;
  onSubmit: (raw: string) => void;
};

export function AIEntryBar({ disabled, loading, onSubmit }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0 ml-1" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='e.g. "Saratoga just paid us $4,000" or "Spent $120 on Figma"'
          className="flex-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
          disabled={disabled || loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          onClick={handleSubmit}
          disabled={disabled || loading || !value.trim()}
          variant="cta"
          size="sm"
          className="flex-shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          {loading ? null : "Log it"}
        </Button>
      </div>
    </div>
  );
}
