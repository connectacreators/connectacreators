import { useBranding } from '@/hooks/useBranding';
import PalettePicker from './PalettePicker';
import FontPicker from './FontPicker';
import LogoUploader from './LogoUploader';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function BrandingSection() {
  const { isAvailable, isLoading, resetToDefault } = useBranding();

  if (!isAvailable) return null;

  const handleReset = async () => {
    try {
      await resetToDefault();
      toast.success('Branding reset to default');
    } catch {
      toast.error('Failed to reset');
    }
  };

  return (
    <section className="space-y-6 pt-6 mt-6 border-t border-border">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Branding</h2>
          <p className="text-sm text-muted-foreground">
            Customize how Connecta looks when you're logged in. Changes save automatically.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={handleReset} disabled={isLoading}>
          <RotateCcw className="w-3.5 h-3.5 mr-2" />
          Reset
        </Button>
      </div>

      <PalettePicker />
      <FontPicker />
      <LogoUploader />
    </section>
  );
}
