"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onComplete: () => void;
};

export function SplashScreen({ onComplete }: Props) {
  const [exiting, setExiting] = useState(false);
  // Stable ref so the effect never needs to re-run when parent re-renders
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Run exactly once on mount — parent re-renders don't reset the timers
  useEffect(() => {
    const exitTimer = window.setTimeout(() => setExiting(true), 1900);
    const doneTimer = window.setTimeout(() => onCompleteRef.current(), 2820);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return (
    <div className={`splash-overlay${exiting ? " splash-exit" : ""}`}>
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
    </div>
  );
}
