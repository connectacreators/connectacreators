// src/components/videoEditor/EditorTopBar.tsx
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  saveStatus: "saved" | "saving" | "error";
  onExportClick: () => void;
  exportDisabled?: boolean;
};

export function EditorTopBar({ title, saveStatus, onExportClick, exportDisabled }: Props) {
  return (
    <div className="h-11 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 text-neutral-200">
      <div className="flex items-center gap-3 text-xs">
        <Link to="/editing-queue" className="flex items-center gap-1 text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-3.5 h-3.5" /> Queue
        </Link>
        <span className="text-neutral-600">/</span>
        <span className="text-neutral-100">{title}</span>
        <span
          className={
            saveStatus === "saved"
              ? "text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded"
              : saveStatus === "saving"
              ? "text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded"
              : "text-[10px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded"
          }
        >
          {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Save error"}
        </span>
      </div>
      <Button size="sm" onClick={onExportClick} disabled={exportDisabled}>
        Export
      </Button>
    </div>
  );
}
