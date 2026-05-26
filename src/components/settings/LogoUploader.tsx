import { useRef, useState } from 'react';
import { useBranding } from '@/hooks/useBranding';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const MAX_BYTES = 1_048_576;
const ALLOWED_TYPES = ['image/png', 'image/svg+xml'];

export default function LogoUploader() {
  const { user } = useAuth();
  const { branding, setLogo } = useBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!user) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Logo must be a PNG or SVG');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Logo must be under 1MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.type === 'image/svg+xml' ? 'svg' : 'png';
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase
        .storage
        .from('branding-logos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from('branding-logos').getPublicUrl(path);
      const publicUrl = data.publicUrl;

      if (branding.logoUrl) {
        const prior = extractStoragePath(branding.logoUrl);
        if (prior) {
          await supabase.storage.from('branding-logos').remove([prior]).catch(() => {});
        }
      }

      await setLogo(publicUrl, file.name);
      toast.success('Logo uploaded');
    } catch (e: any) {
      console.error('[branding] upload failed', e);
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (branding.logoUrl) {
      const prior = extractStoragePath(branding.logoUrl);
      if (prior) {
        await supabase.storage.from('branding-logos').remove([prior]).catch(() => {});
      }
    }
    await setLogo(null, null);
    toast.success('Logo removed');
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Sidebar logo</h3>
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="w-32 h-16 rounded-lg bg-background border border-border flex items-center justify-center overflow-hidden">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.logoAlt || 'Logo preview'} className="max-h-12 max-w-28 object-contain" />
          ) : (
            <span className="font-wordmark text-base text-foreground" style={{ letterSpacing: '-0.022em', fontWeight: 700 }}>Connecta</span>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">PNG or SVG, max 1MB. Transparent background recommended.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-2" />}
              {branding.logoUrl ? 'Replace' : 'Upload'}
            </Button>
            {branding.logoUrl && (
              <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={uploading}>
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/svg+xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      </div>
    </div>
  );
}

function extractStoragePath(publicUrl: string): string | null {
  const marker = '/branding-logos/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}
