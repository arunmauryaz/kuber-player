import React, { useEffect, useRef } from 'react';
import { KuberPlayer, PlayerOptions } from '../core/KuberPlayer';

export interface ReactPlayerProps extends Omit<PlayerOptions, 'container'> {
  className?: string;
  style?: React.CSSProperties;
}

export const KuberPlayerReact: React.FC<ReactPlayerProps> = ({
  src,
  poster,
  spriteVtt,
  autoplay,
  muted,
  controls,
  plugins,
  className,
  style
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<KuberPlayer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    playerRef.current = new KuberPlayer({
      container: containerRef.current,
      src,
      poster,
      spriteVtt,
      autoplay,
      muted,
      controls,
      plugins
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [src, poster, spriteVtt, autoplay, muted, controls, plugins]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', aspectRatio: '16/9', position: 'relative', ...style }}
    />
  );
};
