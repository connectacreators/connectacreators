import { useRef, useEffect, useState } from 'react';
import GlassSurface from './GlassSurface';

interface GlassButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  borderRadius?: number;
  as?: 'button' | 'div';
}

/**
 * Auto-sizing glass button that wraps GlassSurface.
 * Measures its content then applies the distortion effect.
 */
export default function GlassButton({
  children,
  className = '',
  onClick,
  disabled,
  style,
  borderRadius = 12,
  as: Tag = 'button',
}: GlassButtonProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!measureRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(measureRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <Tag
      className={`${className} glass-btn-outer`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...style,
        position: 'relative',
        display: 'inline-flex',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: 'transparent',
        border: 'none',
        padding: 0,
      }}
    >
      {/* Hidden measurer */}
      <div
        ref={measureRef}
        style={{ visibility: 'hidden', position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap' }}
      >
        {children}
      </div>

      <GlassSurface
        width={size ? size.w + 2 : 'auto'}
        height={size ? size.h + 2 : 'auto'}
        borderRadius={borderRadius}
        brightness={45}
        opacity={0.9}
        blur={10}
        displace={0.3}
        distortionScale={-150}
        redOffset={0}
        greenOffset={8}
        blueOffset={16}
        mixBlendMode="difference"
        className="glass-btn-surface"
      >
        {children}
      </GlassSurface>
    </Tag>
  );
}
