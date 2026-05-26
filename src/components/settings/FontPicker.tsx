import { useBranding } from '@/hooks/useBranding';
import { FONT_PAIRINGS, FONT_PAIRING_LABELS } from '@/lib/branding/presets';
import type { FontPairingId } from '@/lib/branding/types';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

const ORDER: FontPairingId[] = ['editorial', 'modern', 'classic', 'bold'];

export default function FontPicker() {
  const { branding, setFontPairing } = useBranding();

  const handlePick = async (id: FontPairingId) => {
    try {
      await setFontPairing(id);
      toast.success(`Font: ${FONT_PAIRING_LABELS[id]}`);
    } catch {
      toast.error('Failed to save font');
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Font pairing</h3>
      <div className="grid grid-cols-2 gap-3">
        {ORDER.map((id) => {
          const fp = FONT_PAIRINGS[id];
          const isSelected = branding.fontPairing === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handlePick(id)}
              className={`relative rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/40 bg-card'
                  : 'border-border hover:border-foreground/30 bg-card/50'
              }`}
              aria-pressed={isSelected}
              aria-label={`Select ${FONT_PAIRING_LABELS[id]} font pairing`}
            >
              <div className="text-2xl mb-1" style={{ fontFamily: fp.display, fontWeight: id === 'bold' ? 400 : 600 }}>
                Aa
              </div>
              <div className="text-xs opacity-70 mb-2" style={{ fontFamily: fp.body }}>
                The quick brown fox
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ fontFamily: fp.ui }}>
                  {FONT_PAIRING_LABELS[id]}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
