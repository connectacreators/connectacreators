import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { videoUploadService } from '@/services/videoUploadService';
import { toast } from 'sonner';

interface UploadButtonProps {
  videoEditId: string;
  clientId: string;
  onUploadComplete: () => void;
  currentSource?: string | null;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB
const FIVE_GB = 5 * 1024 * 1024 * 1024;

export default function UploadButton({
  videoEditId,
  clientId,
  onUploadComplete,
}: UploadButtonProps) {
  const { isAdmin, isEditor, isVideographer } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isResumable, setIsResumable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInternalUser = isAdmin || isEditor || isVideographer;

  // Subscribers don't get direct upload — they paste Google Drive links
  // in the existing footage/file_submission inline fields
  if (!isInternalUser) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is 50 GB.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    setIsResumable(file.size > FIVE_GB);

    try {
      await videoUploadService.uploadVideoFile(
        file,
        clientId,
        videoEditId,
        (pct) => setProgress(pct)
      );
      toast.success('Video uploaded successfully');
      onUploadComplete();
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      setProgress(0);
      setIsResumable(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (uploading) {
    return (
      <div className="flex flex-col gap-1 min-w-[150px]">
        <Progress value={progress} className="h-2" />
        <span className="text-xs text-muted-foreground">
          {isResumable ? `Resumable upload — ${progress}% (safe to close browser)` : `Uploading... ${progress}%`}
        </span>
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-3 w-3" />
        Upload Video
      </Button>
    </>
  );
}
