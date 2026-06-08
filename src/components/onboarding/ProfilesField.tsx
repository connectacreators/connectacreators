import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

interface ProfilesFieldProps {
  /** Current list of profiles (handles or links). */
  value: string[];
  onChange: (next: string[]) => void;
  /** Minimum rows always shown (placeholders). Default 3. */
  minRows?: number;
  placeholder?: string;
}

/**
 * Repeater for "profiles you want to emulate": starts with N placeholder rows
 * and a "+ Add another" button, replacing the old free-text area. Stored as a
 * string[] in onboarding_data (see lib/onboarding/richText#toProfilesArray for
 * legacy-string tolerance).
 */
export default function ProfilesField({
  value,
  onChange,
  minRows = 3,
  placeholder = "@handle or profile link",
}: ProfilesFieldProps) {
  // Always render at least `minRows` rows so the empty placeholders show.
  const rows = [...value];
  while (rows.length < minRows) rows.push("");

  const update = (i: number, v: string) => {
    const next = [...rows];
    next[i] = v;
    onChange(next);
  };

  const remove = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    // Never collapse below a single row.
    onChange(next.length ? next : [""]);
  };

  const add = () => onChange([...rows, ""]);

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row}
            placeholder={placeholder}
            onChange={(e) => update(i, e.target.value)}
            className="flex-1"
          />
          <button
            type="button"
            aria-label="Remove profile"
            onClick={() => remove(i)}
            disabled={rows.length <= 1}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
        Add another
      </button>
    </div>
  );
}
