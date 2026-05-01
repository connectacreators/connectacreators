import { useState, useRef, useCallback } from 'react';
import { uploadStore } from '@/services/uploadStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Link, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { videoUploadService } from '@/services/videoUploadService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FootageUploadDialogProps {
  videoEditId: string;
  clientId: string;
  onComplete: () => void;
  currentFootageUrl?: string | null;
  currentFileSubmissionUrl?: string | null;
  uploadSource?: string | null;
  subfolder?: string;
  /** Called after a Google Drive link is saved — lets callers sync to other tables */
  onDriveLinkSaved?: (url: string) => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB
const FIVE_GB = 5 * 1024 * 1024 * 1024;

export default function FootageUploadDialog({
  videoEditId,
  clientId,
  onComplete,
  currentFootageUrl,
  currentFileSubmissionUrl,
  uploadSource,
  subfolder,
  onDriveLinkSaved,
}: FootageUploadDialogProps) {
  const { isAdmin, isEditor, isVideographer } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [savingDrive, setSavingDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const isInternalUser = isAdmin || isEditor || isVideographer;
  // Only show refresh icon if THIS column has content — submission checks fileSubmission, footage checks footageUrl
  const hasExistingFootage = subfolder === 'submission'
    ? !!currentFileSubmissionUrl
    : !!(currentFootageUrl || currentFileSubmissionUrl);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.add('border-primary', 'bg-primary/5');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.remove('border-primary', 'bg-primary/5');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.remove('border-primary', 'bg-primary/5');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
    } else {
      toast.error('Please drop a video file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 50 GB.');
      return;
    }

    const uploadId = `${videoEditId}-${Date.now()}`;
    uploadStore.add(uploadId, selectedFile.name, window.location.pathname);

    // Close dialog immediately — upload continues in background
    setOpen(false);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    videoUploadService.uploadVideoFile(
      selectedFile,
      clientId,
      videoEditId,
      (pct) => uploadStore.update(uploadId, pct),
      subfolder,
      (abort) => uploadStore.setAbort(uploadId, abort)
    ).then(() => {
      uploadStore.complete(uploadId);
      toast.success(`${selectedFile.name} uploaded`);
      onComplete();
    }).catch((err: any) => {
      uploadStore.fail(uploadId, err.message || 'Upload failed');
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
    });
  };

  const handleSaveDriveUrl = async () => {
    if (!driveUrl.trim()) {
      toast.error('Please enter a Google Drive URL');
      return;
    }

    setSavingDrive(true);
    try {
      const updateData: Record<string, string | null> = { upload_source: 'gdrive' };
      if (subfolder === 'submission') {
        updateData.file_submission = driveUrl.trim();
      } else {
        updateData.footage = driveUrl.trim();
      }
      const { error } = await supabase
        .from('video_edits')
        .update(updateData)
        .eq('id', videoEditId);

      if (error) throw error;

      toast.success('Google Drive link saved');
      onDriveLinkSaved?.(driveUrl.trim());
      setOpen(false);
      setDriveUrl('');
      onComplete();
    } catch (err: any) {
      toast.error(`Failed to save link: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingDrive(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {hasExistingFootage ? (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={subfolder === 'submission' ? 'Upload final' : 'Add file'}>
            <Plus className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1 px-2">
            <Plus className="h-3 w-3" />
            {subfolder === 'submission' ? 'Upload final' : 'Footage'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Footage</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={isInternalUser ? 'upload' : 'drive'}>
          <TabsList className="w-full">
            {isInternalUser && (
              <TabsTrigger value="upload" className="flex-1 gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Upload
              </TabsTrigger>
            )}
            <TabsTrigger value="drive" className="flex-1 gap-1.5">
              <Link className="h-3.5 w-3.5" />
              Google Drive
            </TabsTrigger>
          </TabsList>

          {isInternalUser && (
            <TabsContent value="upload" className="mt-4">
              {selectedFile ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-dashed p-4 text-center overflow-hidden">
                    <p className="text-sm font-medium break-all line-clamp-2">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatFileSize(selectedFile.size)}
                      {selectedFile.size > FIVE_GB && ' — Will use resumable upload'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedFile(null)}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" className="flex-1" onClick={handleUpload}>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Upload
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div
                    ref={dropzoneRef}
                    className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center cursor-pointer transition-colors hover:border-primary/50"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium">Drop video here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Max 50 GB — files over 5 GB use resumable upload
                    </p>
                  </div>
                </>
              )}
            </TabsContent>
          )}

          <TabsContent value="drive" className="mt-4">
            <div className="flex flex-col gap-3">
              <Input
                placeholder="Paste Google Drive link..."
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
              />
              <Button
                size="sm"
                disabled={savingDrive || !driveUrl.trim()}
                onClick={handleSaveDriveUrl}
              >
                {savingDrive ? 'Saving...' : 'Save Link'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
