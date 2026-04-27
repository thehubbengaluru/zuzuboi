"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export type RecorderState = "idle" | "recording" | "transcribing";

type Options = {
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  silenceMs?: number;
  minSpeechMs?: number;
  maxRecordingMs?: number;
};

const DEFAULT_SILENCE_MS = 1500;
const DEFAULT_MIN_SPEECH_MS = 500;
const DEFAULT_MAX_RECORDING_MS = 60_000;
const VOICE_RMS_THRESHOLD = 0.04;

export function useRecorder({
  onTranscript,
  onError,
  silenceMs = DEFAULT_SILENCE_MS,
  minSpeechMs = DEFAULT_MIN_SPEECH_MS,
  maxRecordingMs = DEFAULT_MAX_RECORDING_MS
}: Options) {
  const [state, setState] = useState<RecorderState>("idle");
  const [amplitude, setAmplitude] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const vadEnabledRef = useRef(false);
  const startTimeRef = useRef(0);
  const lastVoiceTimeRef = useRef(0);
  const totalVoicedMsRef = useRef(0);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasRecorder = typeof window.MediaRecorder !== "undefined";
    const hasMedia = Boolean(navigator.mediaDevices?.getUserMedia);
    setSupported(hasRecorder && hasMedia);
  }, []);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, []);

  function teardown() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  const start = useCallback(
    async ({ autoStopOnSilence = false }: { autoStopOnSilence?: boolean } = {}) => {
      if (mediaRecorderRef.current) return;
      setErrorMessage(null);
      vadEnabledRef.current = autoStopOnSilence;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error("AudioContext not available");
        const audioContext = new Ctx();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          const mimeType = recorder.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          teardown();
          if (blob.size === 0) {
            setState("idle");
            setAmplitude(0);
            return;
          }
          void uploadAndTranscribe(blob);
        };

        const buffer = new Uint8Array(analyser.fftSize);
        startTimeRef.current = performance.now();
        lastVoiceTimeRef.current = performance.now();
        totalVoicedMsRef.current = 0;

        let lastTickTime = performance.now();
        const tick = () => {
          const analyserNode = analyserRef.current;
          if (!analyserNode) return;
          analyserNode.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const sample = (buffer[i] - 128) / 128;
            sum += sample * sample;
          }
          const rms = Math.sqrt(sum / buffer.length);
          setAmplitude(Math.min(1, rms * 2.4));

          const now = performance.now();
          const dt = now - lastTickTime;
          lastTickTime = now;
          if (rms > VOICE_RMS_THRESHOLD) {
            lastVoiceTimeRef.current = now;
            totalVoicedMsRef.current += dt;
          }

          if (vadEnabledRef.current) {
            const elapsed = now - startTimeRef.current;
            const silentFor = now - lastVoiceTimeRef.current;
            if (
              elapsed > 800 &&
              totalVoicedMsRef.current > minSpeechMs &&
              silentFor > silenceMs &&
              mediaRecorderRef.current?.state === "recording"
            ) {
              mediaRecorderRef.current.stop();
              return;
            }
          }
          animationFrameRef.current = requestAnimationFrame(tick);
        };
        animationFrameRef.current = requestAnimationFrame(tick);

        maxTimerRef.current = window.setTimeout(() => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }, maxRecordingMs);

        recorder.start();
        setState("recording");
      } catch (error) {
        const message = errorToMessage(error);
        setErrorMessage(message);
        onErrorRef.current?.(message);
        teardown();
        setState("idle");
        setAmplitude(0);
      }
    },
    [silenceMs, minSpeechMs, maxRecordingMs]
  );

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  async function uploadAndTranscribe(blob: Blob) {
    setState("transcribing");
    setAmplitude(0);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "answer.webm");
      const response = await fetch("/api/stt", { method: "POST", body: formData });
      const result = (await response.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!response.ok || !result) {
        throw new Error(result?.error || `Transcription failed (${response.status})`);
      }
      const text = result.text?.trim() || "";
      if (!text) {
        const message = "Zuzu didn't catch any words.";
        setErrorMessage(message);
        onErrorRef.current?.(message);
      } else {
        onTranscriptRef.current(text);
      }
    } catch (error) {
      const message = errorToMessage(error);
      setErrorMessage(message);
      onErrorRef.current?.(message);
    } finally {
      setState("idle");
    }
  }

  return { state, amplitude, errorMessage, start, stop, supported };
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") return "Mic blocked. Check browser permissions.";
    if (error.name === "NotFoundError") return "No mic found.";
    return error.message || "Could not record audio.";
  }
  return "Could not record audio.";
}
