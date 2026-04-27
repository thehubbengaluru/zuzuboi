"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type Options = {
  elevenLabsConfigured: boolean;
  muted: boolean;
  onElevenLabsFailure: () => void;
};

export type BarkType = "happy" | "excited" | "celebrate" | "video";

const BARK_PROMPTS: Record<BarkType, string> = {
  happy:     "small golden retriever puppy, single warm friendly bark, welcoming, clean studio",
  excited:   "excited dog barking twice, two quick energetic yips, enthusiastic impressed reaction, studio",
  celebrate: "joyful dog celebration howl then barks, tail-wagging jubilant, festive happy sound",
  video:     "curious dog whimper then short bark, inquisitive investigative sniff, playful friendly"
};

const AUDIO_TIMEOUT_MS = 90000;

type AbortRef = { current: (() => void) | null };

export function useZuzuVoice({ elevenLabsConfigured, muted, onElevenLabsFailure }: Options) {
  const [voiceStatus, setVoiceStatus] = useState("voice ready");
  const [speaking, setSpeaking] = useState(false);
  const [outputAmplitude, setOutputAmplitude] = useState(0);

  const barkCacheRef = useRef<Map<BarkType, string>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mountedRef = useRef(true);
  const speakIdRef = useRef(0);
  const abortCurrentRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      barkCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      barkCacheRef.current.clear();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (muted) {
      setVoiceStatus("muted");
      return;
    }
    setVoiceStatus(elevenLabsConfigured ? "ElevenLabs on" : "browser voice");
  }, [muted, elevenLabsConfigured]);

  const speak = useCallback(
    async (text: string, barkType: BarkType | false = false) => {
      if (muted) return;

      // Preempt any in-flight audio
      abortCurrentRef.current?.();
      abortCurrentRef.current = null;
      window.speechSynthesis?.cancel();

      speakIdRef.current += 1;
      const myId = speakIdRef.current;
      const isStale = () => speakIdRef.current !== myId;

      setVoiceStatus("speaking");
      setSpeaking(true);

      try {
        if (barkType) {
          await playBark(barkCacheRef, barkType, audioContextRef, analyserRef, setOutputAmplitude, abortCurrentRef);
          if (isStale()) return;
          await delay(120);
          if (isStale()) return;
        }

        if (elevenLabsConfigured) {
          try {
            const response = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: readableSpeech(text) })
            });
            if (isStale()) return;
            if (!response.ok) {
              const detail = await response.text().catch(() => "");
              throw new Error(`TTS ${response.status}: ${detail.slice(0, 200)}`);
            }
            const blob = await response.blob();
            if (isStale()) return;
            const url = URL.createObjectURL(blob);
            try {
              await playWithAnalyser(url, audioContextRef, analyserRef, setOutputAmplitude, abortCurrentRef);
            } finally {
              URL.revokeObjectURL(url);
            }
            if (isStale()) return;
            if (mountedRef.current) setVoiceStatus("ElevenLabs on");
            return;
          } catch (error) {
            if (isStale()) return;
            console.error("[Zuzu] ElevenLabs TTS failed:", error);
            onElevenLabsFailure();
          }
        }

        if (isStale()) return;
        await speakWithBrowser(readableSpeech(text), setOutputAmplitude);
        if (isStale()) return;
        if (mountedRef.current) setVoiceStatus(muted ? "muted" : "browser voice");
      } finally {
        if (mountedRef.current && !isStale()) {
          setSpeaking(false);
          setOutputAmplitude(0);
        }
      }
    },
    [elevenLabsConfigured, muted, onElevenLabsFailure]
  );

  const cancel = useCallback(() => {
    abortCurrentRef.current?.();
    abortCurrentRef.current = null;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
  }, []);

  // Must be called inside a user-gesture handler (click/keydown) to satisfy
  // Chrome's AudioContext autoplay policy before the first speak() call.
  const primeAudioContext = useCallback(() => {
    if (typeof window === "undefined") return;
    const result = ensureAudioContext(audioContextRef, analyserRef);
    if (result && result.context.state === "suspended") {
      result.context.resume().catch(() => {});
    }
  }, []);

  return { voiceStatus, speak, cancel, speaking, outputAmplitude, primeAudioContext };
}

function readableSpeech(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function ensureAudioContext(
  audioContextRef: { current: AudioContext | null },
  analyserRef: { current: AnalyserNode | null }
): { context: AudioContext; analyser: AnalyserNode } | null {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContextRef.current) {
    try {
      const context = new Ctx();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
    } catch {
      return null;
    }
  }
  if (!analyserRef.current) return null;
  return { context: audioContextRef.current, analyser: analyserRef.current };
}

async function playWithAnalyser(
  url: string,
  audioContextRef: { current: AudioContext | null },
  analyserRef: { current: AnalyserNode | null },
  setAmplitude: (value: number) => void,
  abortCurrentRef: AbortRef
) {
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    let settled = false;
    let rafHandle: number | null = null;
    const stopPolling = () => {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      setAmplitude(0);
    };
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      stopPolling();
      audio.pause();
      if (err) reject(err);
      else resolve();
    };
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("audio error"));

    // Register abort so a new speak() call can stop this audio immediately
    abortCurrentRef.current = () => finish();

    (async () => {
      const ctx = ensureAudioContext(audioContextRef, analyserRef);
      let analyserAttached = false;
      if (ctx) {
        try {
          if (ctx.context.state === "suspended") {
            await ctx.context.resume();
          }
          if (ctx.context.state === "running") {
            const source = ctx.context.createMediaElementSource(audio);
            source.connect(ctx.analyser);
            analyserAttached = true;
          }
        } catch {
          analyserAttached = false;
        }
      }

      if (analyserAttached && analyserRef.current) {
        const buffer = new Uint8Array(analyserRef.current.fftSize);
        const tick = () => {
          if (settled || !analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const sample = (buffer[i] - 128) / 128;
            sum += sample * sample;
          }
          const rms = Math.sqrt(sum / buffer.length);
          setAmplitude(Math.min(1, rms * 3.2));
          rafHandle = requestAnimationFrame(tick);
        };
        rafHandle = requestAnimationFrame(tick);
      } else {
        startSyntheticPulse(setAmplitude, () => settled, (handle) => (rafHandle = handle));
      }

      // Dynamic timeout: use actual audio duration once metadata loads, fall back to AUDIO_TIMEOUT_MS
      let safetyTimeout = window.setTimeout(() => finish(), AUDIO_TIMEOUT_MS);
      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration) && audio.duration > 0) {
          clearTimeout(safetyTimeout);
          safetyTimeout = window.setTimeout(() => finish(), audio.duration * 1000 + 6000);
        }
      }, { once: true });

      try {
        await audio.play();
      } catch (err) {
        clearTimeout(safetyTimeout);
        finish(err);
        return;
      }
    })();
  });
}

function speakWithBrowser(text: string, setAmplitude: (value: number) => void) {
  return new Promise<void>((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    let rafHandle: number | null = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      setAmplitude(0);
      resolve();
    };
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1.18;
    utterance.volume = 0.88;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
    startSyntheticPulse(setAmplitude, () => settled, (handle) => (rafHandle = handle));
    window.setTimeout(finish, AUDIO_TIMEOUT_MS);
  });
}

function startSyntheticPulse(
  setAmplitude: (value: number) => void,
  isStopped: () => boolean,
  setHandle: (handle: number) => void
) {
  const startTime = performance.now();
  const tick = () => {
    if (isStopped()) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const pulse = 0.42 + 0.22 * Math.sin(elapsed * 6.2) + 0.12 * Math.sin(elapsed * 11.7);
    setAmplitude(Math.max(0.18, Math.min(0.85, pulse)));
    setHandle(requestAnimationFrame(tick));
  };
  setHandle(requestAnimationFrame(tick));
}

async function playBark(
  barkCacheRef: { current: Map<BarkType, string> },
  barkType: BarkType,
  audioContextRef: { current: AudioContext | null },
  analyserRef: { current: AnalyserNode | null },
  setAmplitude: (value: number) => void,
  abortCurrentRef: AbortRef
) {
  const generated = await playGeneratedBark(barkCacheRef, barkType, audioContextRef, analyserRef, setAmplitude, abortCurrentRef);
  if (generated) return;

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const context = new Ctx();
    const now = context.currentTime;
    const gain = context.createGain();
    const low = context.createOscillator();
    const high = context.createOscillator();

    low.type = "sawtooth";
    high.type = "square";
    low.frequency.setValueAtTime(210, now);
    low.frequency.exponentialRampToValueAtTime(90, now + 0.13);
    high.frequency.setValueAtTime(420, now);
    high.frequency.exponentialRampToValueAtTime(180, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    low.connect(gain);
    high.connect(gain);
    gain.connect(context.destination);
    low.start(now);
    high.start(now);
    low.stop(now + 0.18);
    high.stop(now + 0.14);

    setAmplitude(0.7);
    await delay(180);
    setAmplitude(0);
  } catch {
    // Sound effects are decorative.
  }
}

async function playGeneratedBark(
  barkCacheRef: { current: Map<BarkType, string> },
  barkType: BarkType,
  audioContextRef: { current: AudioContext | null },
  analyserRef: { current: AnalyserNode | null },
  setAmplitude: (value: number) => void,
  abortCurrentRef: AbortRef
) {
  try {
    const cached = barkCacheRef.current.get(barkType);
    if (cached) {
      await playWithAnalyser(cached, audioContextRef, analyserRef, setAmplitude, abortCurrentRef);
      return true;
    }
    const response = await fetch("/api/sfx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: BARK_PROMPTS[barkType] })
    });
    if (!response.ok) return false;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    barkCacheRef.current.set(barkType, url);
    await playWithAnalyser(url, audioContextRef, analyserRef, setAmplitude, abortCurrentRef);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
