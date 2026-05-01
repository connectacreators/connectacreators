import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';

interface Props {
  src: string;
  maxHeight?: string;
  className?: string;
  autoPlay?: boolean;
  /** External ref if caller needs direct access (e.g. for revision markers) */
  videoRef?: React.RefObject<HTMLVideoElement>;
  onTimeUpdate?: (time: number) => void;
  onLoadedMetadata?: (duration: number, width: number, height: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  /** Overlay elements rendered on top of the progress bar (e.g. revision markers) */
  progressOverlay?: React.ReactNode;
  /** Called when the video fails to load (e.g. Drive direct URL blocked) */
  onError?: () => void;
}

const CYAN = 'rgb(8, 145, 178)';

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ThemedVideoPlayer({
  src, maxHeight = '380px', className, autoPlay = false,
  videoRef: externalRef, onTimeUpdate, onLoadedMetadata, onPlay, onPause,
  progressOverlay, onError,
}: Props) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const ref = externalRef || internalRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      setShowControls(prev => playing ? false : prev);
    }, 2800);
  }, [playing]);

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      setPlaying(true);
      setBuffering(true);
      v.play().catch(() => { setPlaying(false); setBuffering(false); setShowControls(true); });
    } else {
      v.pause(); setPlaying(false); setBuffering(false); setShowControls(true);
    }
    resetHideTimer();
  }, [ref, resetHideTimer]);

  const handleTimeUpdate = useCallback(() => {
    const v = ref.current;
    if (!v || !v.duration) return;
    setCurrentTime(v.currentTime);
    setProgress(v.currentTime / v.duration);
    onTimeUpdate?.(v.currentTime);
  }, [ref, onTimeUpdate]);

  const handleMetadata = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    setDuration(v.duration);
    onLoadedMetadata?.(v.duration, v.videoWidth, v.videoHeight);
  }, [ref, onLoadedMetadata]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = ref.current;
    const bar = progressRef.current;
    if (!v || !bar || !v.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    resetHideTimer();
  }, [ref, resetHideTimer]);

  const toggleMute = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    resetHideTimer();
  }, [ref, resetHideTimer]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: fullscreen ? '100vh' : undefined,
        maxHeight: fullscreen ? '100vh' : maxHeight,
        borderRadius: fullscreen ? 0 : 12,
        overflow: 'hidden',
        border: '1px solid rgba(8,145,178,0.2)',
        background: '#000',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) setShowControls(false); }}
      onClick={toggle}
    >
      {/* Video area — fills available space, constrained */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <video
          ref={ref}
          src={src}
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', objectFit: 'contain' }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleMetadata}
          onEnded={() => { setPlaying(false); setBuffering(false); setShowControls(true); }}
          onPlay={() => { setPlaying(true); onPlay?.(); }}
          onPlaying={() => { setBuffering(false); }}
          onWaiting={() => { if (playing) setBuffering(true); }}
          onPause={() => { setPlaying(false); setBuffering(false); onPause?.(); }}
          onError={onError}
          autoPlay={autoPlay}
          preload="none"
          playsInline
        />

        {/* Buffering spinner */}
        {buffering && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            zIndex: 3,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              border: `2px solid rgba(8,145,178,0.25)`,
              borderTopColor: CYAN,
              animation: 'tvp-spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes tvp-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Big play overlay when paused */}
        {!playing && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
            zIndex: 2,
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(8,145,178,0.2)',
              border: '1.5px solid rgba(8,145,178,0.5)',
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Play size={24} style={{ color: 'rgba(255,255,255,0.9)', marginLeft: 3 }} />
            </div>
          </div>
        )}
      </div>

      {/* Controls bar — always at the bottom, never pushed off-screen */}
      <div
        style={{
          flexShrink: 0,
          padding: '8px 14px 10px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 100%)',
          transition: 'opacity 0.3s ease',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          style={{
            height: 4, background: 'rgba(255,255,255,0.15)',
            borderRadius: 2, marginBottom: 8,
            cursor: 'pointer', position: 'relative',
          }}
          onClick={handleSeek}
        >
          <div style={{
            height: '100%', width: `${progress * 100}%`,
            background: CYAN, borderRadius: 2, position: 'relative',
          }}>
            <div style={{
              position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)',
              width: 10, height: 10, borderRadius: '50%',
              background: '#fff', boxShadow: `0 0 6px ${CYAN}`,
            }} />
          </div>
          {progressOverlay}
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={toggle} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#fff', padding: 0, display: 'flex', alignItems: 'center',
          }}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button onClick={toggleMute} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.6)', padding: 0, display: 'flex', alignItems: 'center',
          }}>
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.45)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
          }}>
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={toggleFullscreen} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.6)', padding: 0, display: 'flex', alignItems: 'center',
          }}>
            {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
