import { useBranding } from '@/hooks/useBranding';
import { PALETTES, PALETTE_LABELS } from '@/lib/branding/presets';
import type { PaletteId } from '@/lib/branding/types';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

const ORDER: PaletteId[] = ['editorial', 'slate', 'forest', 'plum', 'crimson', 'mono'];

export default function PalettePicker() {
  const { branding, setPalette } = useBranding();

  const handlePick = async (id: PaletteId) => {
    try {
      await setPalette(id);
      toast.success(`Palette: ${PALETTE_LABELS[id]}`);
    } catch {
      toast.error('Failed to save palette');
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Color palette</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ORDER.map((id) => {
          const p = PALETTES[id];
          const isSelected = branding.palette === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handlePick(id)}
              className={`relative rounded-xl border overflow-hidden text-left transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/40'
                  : 'border-border hover:border-foreground/30'
              }`}
              aria-pressed={isSelected}
              aria-label={`Select ${PALETTE_LABELS[id]} palette`}
            >
              <div className="flex h-20">
                <div className="w-1/4" style={{ background: `hsl(${p.ink})` }} />
                <div className="w-1/4" style={{ background: `hsl(${p.graphite})` }} />
                <div className="w-1/4" style={{ background: `hsl(${p.aqua})` }} />
                <div className="w-1/4" style={{ background: `hsl(${p.honey})` }} />
              </div>
              <div className="px-3 py-2 bg-card text-card-foreground flex items-center justify-between">
                <span className="text-xs font-medium">{PALETTE_LABELS[id]}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
