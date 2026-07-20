import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import {
  getStorageStatus,
  STORAGE_BLOCK_GB,
  STORAGE_LIMIT_GB,
  type StorageLevel,
} from "@/lib/storageGuard";

// App-shell notification: warns staff as storage nears the 100 GB quota and
// tells them uploads are blocked above the safety limit. Self-gates — renders
// nothing unless the viewer is staff AND usage is in the warn/block band.
export default function StorageCapBanner() {
  const { isAdmin, isEditor, isVideographer, isContentStrategist } = useAuth();
  const isStaff = isAdmin || isEditor || isVideographer || isContentStrategist;

  const [level, setLevel] = useState<StorageLevel>("ok");
  const [usedGb, setUsedGb] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    getStorageStatus().then((s) => {
      if (cancelled) return;
      setLevel(s.level);
      setUsedGb(s.usedGb);
    });
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  if (!isStaff || level === "ok" || usedGb == null) return null;
  const block = level === "block";
  // A hard-stop (block) can't be dismissed; a warning can.
  if (!block && dismissed) return null;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-sm ${
        block
          ? "bg-destructive/15 text-destructive border-b border-destructive/30"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-b border-amber-500/30"
      }`}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="min-w-0">
        Storage <span className="font-semibold tabular-nums">{usedGb.toFixed(1)} GB</span> /{" "}
        {STORAGE_LIMIT_GB} GB.{" "}
        {block
          ? `New uploads are blocked (safety limit ${STORAGE_BLOCK_GB} GB).`
          : "Approaching the limit."}{" "}
        <Link to="/editing-queue" className="font-medium underline underline-offset-2">
          Free space in Editing Queue → Trash
        </Link>
        .
      </span>
      {!block && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto shrink-0 rounded p-0.5 hover:bg-black/10"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
