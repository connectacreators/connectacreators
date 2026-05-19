// src/components/videoEditor/MusicPanel.tsx
// Right-panel "Music" tab. Lets the user upload a background audio track,
// pick a volume, and remove it. The file uploads to the `footage` bucket
// at `music/<videoEditId>/<filename>` and the storage_path is stored in
// the EDL — the worker pulls it down at render time and mixes it under
// the source audio with `amix`.
import { useEffect, useRef, useState } from "react";
import type { Music } from "@/lib/videoEditor/edl";
import { supabase } from "@/integrations/supabase/client";
import { useAudioImport } from "@/hooks/useAudioImport";

type Props = {
  music: Music | null;
  videoEditId: string;
  onSet: (music: Music | null) => void;
};

export function MusicPanel({ music, videoEditId, onSet }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const { state: importState, submit: submitImport, reset: resetImport } = useAudioImport(videoEditId);

  // When the import finishes, automatically attach the resulting MP3 as
  // this video's music track.
  useEffect(() => {
    if (importState.phase === "done") {
      onSet({
        storage_path: importState.storagePath,
        volume: music?.volume ?? 0.3,
      });
      resetImport();
      setImportUrl("");
    }
  }, [importState, music?.volume, onSet, resetImport]);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, "-").slice(0, 80);
      const storagePath = `music/${videoEditId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("footage")
        .upload(storagePath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      onSet({
        storage_path: storagePath,
        volume: music?.volume ?? 0.3,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        Background music
      </div>

      {music ? (
        <div className="bg-neutral-900 rounded p-2 space-y-2">
          <div className="text-[11px] text-neutral-200 truncate" title={music.storage_path}>
            {music.storage_path.split("/").pop()}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-neutral-500 w-12">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={music.volume}
              onChange={(e) => onSet({ ...music, volume: parseFloat(e.target.value) })}
              className="flex-1 accent-blue-500"
            />
            <span className="text-[9px] text-neutral-400 w-8 text-right tabular-nums">
              {Math.round(music.volume * 100)}%
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 text-[10px] px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded"
            >
              Replace
            </button>
            <button
              onClick={() => onSet(null)}
              className="flex-1 text-[10px] px-2 py-1 bg-red-900/50 hover:bg-red-900 text-red-200 rounded"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-neutral-900/60 rounded p-3 text-center space-y-2">
          <p className="text-[11px] text-neutral-400">
            No music track. Upload an MP3, M4A, or WAV.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Choose audio file"}
          </button>
        </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.currentTarget.value = "";
        }}
      />

      {/* Audio-from-URL importer. Paste a TikTok / IG Reel / YouTube link
          and the local worker runs yt-dlp to pull the audio. Useful when
          recreating inspiration content with the original audio. */}
      <div className="bg-neutral-900/60 rounded p-2 space-y-2">
        <div className="text-[9px] uppercase tracking-wider text-neutral-500">
          Or import from a URL
        </div>
        <input
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@…/video/…  or IG Reel / YT link"
          className="w-full bg-neutral-800 text-neutral-100 text-[10px] rounded px-2 py-1 border border-neutral-700"
        />
        {importState.phase === "polling" || importState.phase === "submitting" ? (
          <div className="space-y-1">
            <div className="h-1.5 bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: importState.phase === "polling" ? `${importState.progress}%` : "5%",
                }}
              />
            </div>
            <p className="text-[9px] text-neutral-400">
              {importState.phase === "submitting" ? "Submitting…" : "Importing audio…"}
            </p>
          </div>
        ) : (
          <button
            onClick={() => importUrl.trim() && submitImport(importUrl.trim())}
            disabled={!importUrl.trim()}
            className="w-full px-2 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded disabled:opacity-50"
          >
            Import audio from URL
          </button>
        )}
        {importState.phase === "error" && (
          <p className="text-[10px] text-red-400">{importState.message}</p>
        )}
        <p className="text-[9px] text-neutral-500">
          Worker uses yt-dlp locally (install with <code>brew install yt-dlp</code> on macOS).
        </p>
      </div>

      <p className="text-[9px] text-neutral-500">
        Music plays under the source audio at the chosen volume. Source audio
        stays at full volume.
      </p>
    </div>
  );
}
