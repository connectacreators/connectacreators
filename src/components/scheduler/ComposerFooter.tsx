import * as React from "react";
import { Calendar, ChevronDown, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Mode = "autopost" | "scheduled" | "draft";

export interface ComposerFooterProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  /** ISO datetime string for the scheduled time. Null if not scheduled. */
  scheduledAt: string | null;
  /** Called when user picks a new datetime (still ISO). Pass null to clear. */
  onScheduledAtChange: (iso: string | null) => void;
  /** Submitting state — disables actions while in flight */
  submitting?: boolean;
  /** Whether we're editing an existing post or creating new */
  isEditing?: boolean;
  /** The active primary submit (based on current mode) */
  onSubmit: () => void;
  /** Cancel button click */
  onCancel: () => void;
  /** Delete (only available if isEditing). null → no delete button. */
  onDelete?: () => void;
}

function primaryLabelFor(mode: Mode, isEditing: boolean): string {
  if (mode === "draft") return "Save draft";
  if (mode === "scheduled") return isEditing ? "Save changes" : "Schedule";
  // autopost
  return isEditing ? "Save & publish now" : "Publish now";
}

function labelForMode(mode: Mode, isEditing: boolean): string {
  if (mode === "draft") return "Save as draft";
  if (mode === "scheduled") return isEditing ? "Save changes" : "Schedule";
  return isEditing ? "Save & publish now" : "Publish now";
}

function formatScheduledAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Split an ISO date into local YYYY-MM-DD and HH:MM strings suited for <input>. */
function isoToInputs(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

function inputsToIso(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || "09:00";
  const combined = new Date(`${date}T${t}:00`);
  if (Number.isNaN(combined.getTime())) return null;
  return combined.toISOString();
}

export function ComposerFooter({
  mode,
  onModeChange,
  scheduledAt,
  onScheduledAtChange,
  submitting = false,
  isEditing = false,
  onSubmit,
  onCancel,
  onDelete,
}: ComposerFooterProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const initial = isoToInputs(scheduledAt);
  const [date, setDate] = React.useState<string>(initial.date);
  const [time, setTime] = React.useState<string>(initial.time);

  // Keep local picker state in sync when scheduledAt changes externally.
  React.useEffect(() => {
    const next = isoToInputs(scheduledAt);
    setDate(next.date);
    setTime(next.time);
  }, [scheduledAt]);

  const formatted = formatScheduledAt(scheduledAt);

  const handleDelete = () => {
    if (!onDelete) return;
    const ok = window.confirm(
      "Delete this post? This action cannot be undone."
    );
    if (ok) onDelete();
  };

  const handlePickerOk = () => {
    const iso = inputsToIso(date, time);
    onScheduledAtChange(iso);
    setPickerOpen(false);
  };

  const handlePickerClear = () => {
    onScheduledAtChange(null);
    setDate("");
    setTime("");
    setPickerOpen(false);
  };

  const otherModes: Mode[] = (
    ["autopost", "scheduled", "draft"] as Mode[]
  ).filter((m) => m !== mode);

  const primary = primaryLabelFor(mode, isEditing);

  return (
    <div className="flex w-full items-center gap-2 border-t border-border/40 px-4 py-3">
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={submitting}
      >
        Cancel
      </Button>

      {onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Delete post"
          onClick={handleDelete}
          disabled={submitting}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
        </Button>
      ) : null}

      <div className="flex-1" />

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            className={cn(
              "gap-2",
              !scheduledAt && "text-muted-foreground font-normal"
            )}
          >
            <Calendar className="h-4 w-4" />
            {formatted ?? "Pick a date / time"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 p-4">
          <div className="space-y-2">
            <Label htmlFor="composer-footer-date">Date</Label>
            <Input
              id="composer-footer-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="composer-footer-time">Time</Label>
            <Input
              id="composer-footer-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handlePickerClear}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePickerOk}
              disabled={!date}
            >
              OK
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex items-stretch">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-r-none pr-4"
        >
          {primary}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              disabled={submitting}
              aria-label="More publish options"
              className="rounded-l-none border-l border-black/20 px-2"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {otherModes.map((m) => (
              <DropdownMenuItem
                key={m}
                onSelect={() => {
                  onModeChange(m);
                  // Defer so parent state has a chance to commit before submit.
                  queueMicrotask(() => onSubmit());
                }}
              >
                {labelForMode(m, isEditing)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default ComposerFooter;
