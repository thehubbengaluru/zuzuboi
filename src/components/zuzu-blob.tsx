"use client";

import { useEffect, useRef } from "react";

export type BlobState = "idle" | "speaking" | "listening" | "thinking";

type Props = {
  state: BlobState;
  amplitude: number;
};

export function ZuzuBlob({ state, amplitude }: Props) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef(amplitude);
  const currentRef = useRef(amplitude);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = Math.max(0, Math.min(1, amplitude));
  }, [amplitude]);

  useEffect(() => {
    const tick = () => {
      const target = targetRef.current;
      currentRef.current += (target - currentRef.current) * 0.18;
      const node = innerRef.current;
      if (node) {
        const scale = 1 + currentRef.current * 0.32;
        const glow = 0.3 + currentRef.current * 0.55;
        node.style.setProperty("--blob-scale", scale.toFixed(3));
        node.style.setProperty("--blob-glow", glow.toFixed(3));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className={`zuzu-blob blob-${state}`} aria-hidden="true">
      <div ref={innerRef} className="zuzu-blob-inner">
        <span className="blob-glow" />
        <span className="blob-layer blob-layer-1" />
        <span className="blob-layer blob-layer-2" />
        <span className="blob-layer blob-layer-3" />
        <span className="blob-core" />
      </div>
    </div>
  );
}
