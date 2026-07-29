// Per-client accent overrides, layered on top of the chosen palette.
//
// Palettes alone meant "which of our six looks closest to your brand?" —
// a client's actual accent colour could never appear. These two pickers let
// it, without opening every token to free-form input: structure and
// foreground colours stay preset-owned, so a bad pick can change the accent
// but can't produce unreadable text on an unreadable surface.
//
// Stored as bare HSL triplets to match every other token in the app, so
// `hsl(var(--aqua) / 0.3)` keeps working everywhere downstream.
import { useBranding } from '@/hooks/useBranding';
import { PALETTES } from '@/lib/branding/presets';
import type { AccentOverrides } from '@/lib/branding/types';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

/** "184 41% 70%" -> "#8fd0d5" for <input type="color">. */
function hslTripletToHex(triplet: string): string {
  const m = triplet.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return '#000000';
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** "#8fd0d5" -> "184 41% 70%". */
function hexToHslTriplet(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const SLOTS: Array<{ token: keyof AccentOverrides; label: string; hint: string }> = [
  { token: 'aqua', label: 'Primary accent', hint: 'Buttons, links, active states, new leads' },
  { token: 'honey', label: 'Warm accent', hint: 'Highlights, booked leads, attention states' },
];

export default function AccentPicker() {
  const { branding, setAccentOverride } = useBranding();
  const preset = PALETTES[branding.palette];
  const overrides = branding.accentOverrides ?? {};

  const commit = async (token: keyof AccentOverrides, hsl: string | null) => {
    try {
      await setAccentOverride(token, hsl);
    } catch {
      toast.error('Failed to save colour');
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-1">Accent colours</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Optional. Overrides the palette's accents with your own — everything else stays
        on the palette so text always keeps its contrast.
      </p>
      <div className="space-y-3">
        {SLOTS.map(({ token, label, hint }) => {
          const active = overrides[token];
          const effective = active || preset[token];
          return (
            <div key={token} className="flex items-center gap-3">
              {/* The native colour input is the swatch — no custom popover to
                  keep in sync, and it gets the OS picker (eyedropper included)
                  for free. onBlur rather than onChange so dragging through the
                  spectrum doesn't fire a write per frame. */}
              <input
                type="color"
                aria-label={label}
                defaultValue={hslTripletToHex(effective)}
                key={effective}
                onBlur={(e) => {
                  const next = hexToHslTriplet(e.target.value);
                  if (next !== effective) void commit(token, next);
                }}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-foreground">{label}</div>
                <div className="truncate text-xs text-muted-foreground">{hint}</div>
              </div>
              {active && (
                <button
                  type="button"
                  onClick={() => void commit(token, null)}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  title="Back to the palette's colour"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
