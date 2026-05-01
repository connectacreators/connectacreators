import { useState, useEffect } from 'react';
import { uploadStore, type UploadEntry } from '@/services/uploadStore';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle2, XCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FloatingUploadProgress() {
  const [uploads, setUploads] = useState<UploadEntry[]>(() => uploadStore.getAll());
  const navigate = useNavigate();

  useEffect(() => uploadStore.subscribe(() => setUploads(uploadStore.getAll())), []);

  if (uploads.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 w-72">
      {uploads.map((u) => (
        <div
          key={u.id}
          className="bg-background/95 backdrop-blur border border-border rounded-xl px-4 py-3 shadow-xl flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            {u.done && !u.error ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            ) : u.error ? (
              <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-primary shrink-0 animate-pulse" />
            )}
            <button
              className="text-xs font-medium truncate flex-1 text-left hover:underline disabled:no-underline disabled:cursor-default"
              disabled={!u.route}
              onClick={() => u.route && navigate(u.route)}
              title={u.route ? 'Go to upload location' : undefined}
            >
              {u.filename}
            </button>
            <span className="text-xs text-muted-foreground shrink-0">
              {u.error ? 'Failed' : u.done ? 'Done' : `${u.progress}%`}
            </span>
            {!u.done && (
              <button
                className="ml-1 text-muted-foreground hover:text-destructive shrink-0"
                title="Cancel upload"
                onClick={() => uploadStore.cancel(u.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!u.done && <Progress value={u.progress} className="h-1.5" />}
          {u.error && <p className="text-[10px] text-destructive truncate">{u.error}</p>}
        </div>
      ))}
    </div>
  );
}
