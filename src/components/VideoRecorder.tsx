import { useState, useRef, useCallback, useEffect } from "react";
import { Video, Square, Download, X, SwitchCamera, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface VideoRecorderProps {
  /** If true, shows as a small floating pip over content */
  pip?: boolean;
  scriptTitle?: string;
  onClose: () => void;
}

export default function VideoRecorder({ pip = false, scriptTitle, onClose }: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [hasStream, setHasStream] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 3840, min: 1920 },
          height: { ideal: 2160, min: 1080 },
          frameRate: { ideal: 60, min: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasStream(true);
    } catch (err) {
      toast.error("Could not access camera. Please check your permissions.");
      setHasStream(false);
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitchCamera = useCallback(() => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    startCamera(next);
  }, [facingMode, startCamera]);

  const handleStartRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setRecordedUrl(null);

    const mimeType = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const mr = new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 20_000_000 });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
    };
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!recordedUrl) return;
    const safeName = (scriptTitle || "grabacion").replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, "").replace(/\s+/g, "-").slice(0, 60);
    const ext = mediaRecorderRef.current?.mimeType?.includes("mp4") ? "mp4" : "webm";
    const a = document.createElement("a");
    a.href = recordedUrl;
    a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    toast.success("Video downloaded");
  }, [recordedUrl]);

  const handleClose = useCallback(() => {
    if (recording) handleStopRecording();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onClose();
  }, [recording, handleStopRecording, onClose]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // PIP mode: small draggable preview
  if (pip) {
    return (
      <div className="fixed bottom-20 right-4 z-[9998] flex flex-col items-center gap-2 animate-fade-in">
        {/* Camera preview */}
        <div className="relative rounded-2xl overflow-hidden shadow-lg border-2 border-primary/60 bg-black w-[140px] h-[200px] sm:w-[180px] sm:h-[240px]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
          />
          {/* Recording indicator */}
          {recording && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-mono">{formatTime(elapsed)}</span>
            </div>
          )}
          {/* Close pip */}
          <button onClick={handleClose} className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white hover:bg-black/80 transition-smooth">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 bg-black/80 rounded-full px-3 py-1.5 backdrop-blur-sm">
          <button onClick={handleSwitchCamera} className="p-1.5 rounded-full text-white hover:bg-white/20 transition-smooth" title="Cambiar cámara">
            <SwitchCamera className="w-4 h-4" />
          </button>
          {!recording ? (
            <button onClick={handleStartRecording} className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-smooth" title="Grabar">
              <Video className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleStopRecording} className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-smooth animate-pulse" title="Detener">
              <Square className="w-4 h-4" />
            </button>
          )}
          {recordedUrl && (
            <button onClick={handleDownload} className="p-1.5 rounded-full text-emerald-400 hover:bg-white/20 transition-smooth" title="Descargar">
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Full overlay mode (fallback, not typically used)
  return (
    <div className="fixed inset-0 z-[9998] bg-black/90 flex flex-col items-center justify-center gap-4">
      <div className="relative rounded-2xl overflow-hidden w-[90vw] max-w-md aspect-[9/16] bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
        />
        {recording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-sm font-mono">{formatTime(elapsed)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleSwitchCamera} className="text-white">
          <SwitchCamera className="w-5 h-5" />
        </Button>
        {!recording ? (
          <Button onClick={handleStartRecording} className="bg-red-500 hover:bg-red-600 text-white rounded-full w-16 h-16">
            <Video className="w-6 h-6" />
          </Button>
        ) : (
          <Button onClick={handleStopRecording} className="bg-red-500 hover:bg-red-600 text-white rounded-full w-16 h-16 animate-pulse">
            <Square className="w-6 h-6" />
          </Button>
        )}
        {recordedUrl && (
          <Button variant="ghost" onClick={handleDownload} className="text-emerald-400">
            <Download className="w-5 h-5" />
          </Button>
        )}
        <Button variant="ghost" onClick={handleClose} className="text-white">
          <X className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
