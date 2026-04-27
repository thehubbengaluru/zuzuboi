"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onComplete: () => void;
  onReady?: () => void;
};

type Phase = "entering" | "ready" | "exiting";

export function SplashScreen({ onComplete, onReady }: Props) {
  const [phase, setPhase] = useState<Phase>("entering");
  const onCompleteRef = useRef(onComplete);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  // After the expand animation (700ms), show "tap to begin"
  useEffect(() => {
    const t = window.setTimeout(() => setPhase("ready"), 760);
    return () => clearTimeout(t);
  }, []);

  const handleTap = useCallback(() => {
    if (phase !== "ready") return;
    onReadyRef.current?.();
    setPhase("exiting");
    window.setTimeout(() => onCompleteRef.current(), 960);
  }, [phase]);

  return (
    <div
      className={`splash-overlay${phase === "exiting" ? " splash-exit" : ""}${phase === "ready" ? " splash-ready" : ""}`}
      onClick={handleTap}
      role="button"
      aria-label="Tap to begin"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleTap(); }}
    >
      <div className="splash-rings">
        <div className="splash-ring splash-ring-3" />
        <div className="splash-ring splash-ring-2" />
        <div className="splash-ring splash-ring-1" />
        <div className="splash-portrait">
          <img src="/zuzu.jpg" alt="Zuzu" />
        </div>
      </div>
      <p className="splash-eyebrow">zuzuboi.com</p>
      <h2 className="splash-heading">Zuzu</h2>
      <p className="splash-sub">Residency Agent</p>
      {phase === "ready" && (
        <p className="splash-tap">Tap anywhere to begin</p>
      )}
    </div>
  );
}
