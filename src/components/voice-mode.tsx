"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type Answers, type Question } from "@/config/questions";
import { ZuzuBlob, type BlobState } from "./zuzu-blob";
import { CloseIcon } from "./icons";
import { useRecorder } from "@/hooks/use-recorder";

type Props = {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  speaking: boolean;
  outputAmplitude: number;
  thinking: boolean;
  completed: boolean;
  scribeAvailable: boolean;
  showStartScreen: boolean;
  validate: (key: keyof Answers, value: string) => string | null;
  speakError: (text: string) => Promise<void> | void;
  submitValue: (value: string) => Promise<void>;
  onStart: () => void;
  onInterrupt: () => void;
  onExit: () => void;
};

export function VoiceMode({
  question,
  questionNumber,
  totalQuestions,
  speaking,
  outputAmplitude,
  thinking,
  completed,
  scribeAvailable,
  showStartScreen,
  validate,
  speakError,
  submitValue,
  onStart,
  onInterrupt,
  onExit
}: Props) {
  const [started, setStarted] = useState(!showStartScreen);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showInputModal, setShowInputModal] = useState(false);
  const [modalValue, setModalValue] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const modalInputRef = useRef<HTMLInputElement | null>(null);

  const needsInputModal = question.inputModal === true;

  const handleTranscript = useCallback(
    async (text: string) => {
      setLastTranscript(text);
      const error = validate(question.key, text);
      if (error) {
        setValidationError(error);
        await speakError(error);
        return;
      }
      setValidationError(null);
      submittingRef.current = true;
      setSubmitting(true);
      try {
        await submitValue(text);
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [question.key, validate, speakError, submitValue]
  );

  const handleRecorderError = useCallback((message: string) => {
    setValidationError(message);
  }, []);

  const recorder = useRecorder({
    onTranscript: handleTranscript,
    onError: handleRecorderError
  });

  // Auto-start recorder for spoken questions
  useEffect(() => {
    if (!started) return;
    if (needsInputModal) return;
    if (!scribeAvailable) return;
    if (completed) return;
    if (speaking) return;
    if (submittingRef.current) return;
    if (recorder.state !== "idle") return;
    const timer = window.setTimeout(() => {
      void recorder.start({ autoStopOnSilence: true });
    }, 380);
    return () => window.clearTimeout(timer);
  }, [started, speaking, completed, scribeAvailable, needsInputModal, recorder.state, recorder.start, question.key, lastTranscript]);

  // Auto-show input modal for typed questions
  useEffect(() => {
    if (!started) return;
    if (!needsInputModal) return;
    if (speaking) return;
    if (submittingRef.current) return;
    if (completed) return;
    const timer = window.setTimeout(() => {
      setShowInputModal(true);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [started, speaking, needsInputModal, completed, question.key]);

  // Reset modal state when question changes
  useEffect(() => {
    setShowInputModal(false);
    setModalValue("");
    setModalError(null);
    setLastTranscript(null);
    setValidationError(null);
  }, [question.key]);

  useEffect(() => {
    if (showInputModal) {
      window.setTimeout(() => modalInputRef.current?.focus(), 80);
    }
  }, [showInputModal]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (showInputModal) { setShowInputModal(false); return; }
        onExit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, showInputModal]);

  function handleStart() {
    setStarted(true);
    onStart();
  }

  function manualToggle() {
    if (recorder.state === "recording") { recorder.stop(); return; }
    if (recorder.state === "idle") {
      void recorder.start({ autoStopOnSilence: true });
    }
  }

  async function handleModalSubmit(event: FormEvent) {
    event.preventDefault();
    const value = modalValue.trim();
    const error = validate(question.key, value);
    if (error) { setModalError(error); return; }
    setModalError(null);
    setShowInputModal(false);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await submitValue(value);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const blobState: BlobState =
    speaking
      ? "speaking"
      : thinking
        ? "thinking"
        : recorder.state === "recording"
          ? "listening"
          : recorder.state === "transcribing" || submitting
            ? "thinking"
            : "idle";

  const blobAmplitude = speaking
    ? outputAmplitude
    : recorder.state === "recording"
      ? recorder.amplitude
      : 0;

  const statusLine = computeStatusLine({
    started,
    speaking,
    thinking,
    recorderState: recorder.state,
    submitting,
    completed,
    validationError,
    lastTranscript,
    scribeAvailable,
    needsInputModal,
    showInputModal
  });

  const buttonLabel =
    recorder.state === "recording"
      ? "Stop"
      : recorder.state === "transcribing"
        ? "Sniffing…"
        : submitting
          ? "Sending…"
          : "Talk";

  const inputType = question.key === "video" ? "url" : "text";
  const inputMode = question.key === "video" ? "url" : question.key === "contact" ? "email" : "text";
  const autoComplete = question.key === "video" ? "url" : question.key === "contact" ? "email" : "off";

  return (
    <div className="voice-mode" role="dialog" aria-modal="true" aria-label="Zuzu voice mode">
      <div className="voice-mode-inner">
        <div className="voice-mode-portrait-mini" aria-hidden="true">
          <img src="/zuzu.jpg" alt="" />
        </div>
        <button className="voice-mode-exit" onClick={onExit} aria-label="Exit voice mode">
          <CloseIcon />
        </button>

        {!started ? (
          <div className="voice-mode-start">
            <div className="voice-mode-start-blob">
              <ZuzuBlob state="idle" amplitude={0} />
            </div>
            <h2 className="voice-mode-question">Zuzu's ready. Are you?</h2>
            <p className="voice-mode-status">
              8 questions. Voice first. Tap below and we'll get sniffing.
            </p>
            <div className="voice-mode-controls">
              <button type="button" className="voice-mode-mic" onClick={handleStart}>
                Start talking
              </button>
              <button type="button" className="voice-mode-secondary" onClick={onExit}>
                I'd rather type
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              className="voice-mode-blob-wrap"
              onClick={speaking ? onInterrupt : undefined}
              aria-label={speaking ? "Tap to interrupt Zuzu" : undefined}
              style={{ cursor: speaking ? "pointer" : "default", background: "none", border: "none", padding: 0 }}
            >
              <ZuzuBlob state={blobState} amplitude={blobAmplitude} />
            </button>

            <p className="voice-mode-counter">
              {completed ? "All done" : `Question ${questionNumber} of ${totalQuestions}`}
            </p>
            <h2 className="voice-mode-question">{question.prompt}</h2>
            <p className="voice-mode-status" aria-live="polite">
              {statusLine}
            </p>
            {validationError && (
              <p className="voice-mode-error" role="alert">
                {validationError}
              </p>
            )}

            {!needsInputModal && (
              <div className="voice-mode-controls">
                <button
                  type="button"
                  className={`voice-mode-mic ${recorder.state === "recording" ? "recording" : ""}`}
                  onClick={manualToggle}
                  disabled={
                    !scribeAvailable ||
                    completed ||
                    speaking ||
                    recorder.state === "transcribing" ||
                    submitting
                  }
                  aria-pressed={recorder.state === "recording"}
                >
                  {buttonLabel}
                </button>
                <button type="button" className="voice-mode-secondary" onClick={onExit}>
                  Type instead
                </button>
              </div>
            )}

            {needsInputModal && !showInputModal && (
              <div className="voice-mode-controls">
                <button
                  type="button"
                  className="voice-mode-mic"
                  onClick={() => setShowInputModal(true)}
                  disabled={speaking || submitting}
                >
                  {submitting ? "Sending…" : "Type answer"}
                </button>
                <button type="button" className="voice-mode-secondary" onClick={onExit}>
                  Type instead
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showInputModal && (
        <div
          className="voice-input-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={question.label}
          onClick={(e) => { if (e.target === e.currentTarget) setShowInputModal(false); }}
        >
          <div className="voice-input-modal-box">
            <p className="voice-input-modal-label">{question.hint}</p>
            <form onSubmit={handleModalSubmit}>
              <input
                ref={modalInputRef}
                className="voice-input-modal-field"
                type={inputType}
                inputMode={inputMode as React.HTMLAttributes<HTMLInputElement>["inputMode"]}
                autoComplete={autoComplete}
                placeholder={question.hint}
                value={modalValue}
                onChange={(e) => { setModalValue(e.target.value); setModalError(null); }}
                aria-invalid={Boolean(modalError)}
              />
              {modalError && (
                <p className="voice-input-modal-error" role="alert">{modalError}</p>
              )}
              <div className="voice-input-modal-actions">
                <button
                  type="submit"
                  className="voice-mode-mic"
                  disabled={!modalValue.trim()}
                >
                  Send it
                </button>
                <button
                  type="button"
                  className="voice-mode-secondary"
                  onClick={() => setShowInputModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function computeStatusLine({
  started,
  speaking,
  thinking,
  recorderState,
  submitting,
  completed,
  validationError,
  lastTranscript,
  scribeAvailable,
  needsInputModal,
  showInputModal
}: {
  started: boolean;
  speaking: boolean;
  thinking: boolean;
  recorderState: "idle" | "recording" | "transcribing";
  submitting: boolean;
  completed: boolean;
  validationError: string | null;
  lastTranscript: string | null;
  scribeAvailable: boolean;
  needsInputModal: boolean;
  showInputModal: boolean;
}) {
  if (!started) return "";
  if (!scribeAvailable) return "Scribe is offline. Type instead.";
  if (completed) return "Application's in. Tail high.";
  if (speaking) return "Tap the blob to interrupt.";
  if (thinking) return "Zuzu is reading between the lines…";
  if (needsInputModal) {
    if (showInputModal) return "Type it in — Zuzu can't sniff URLs.";
    if (submitting) return "Trotting it over to the chat…";
    return "Tap to type your answer.";
  }
  if (recorderState === "recording") return "Listening…";
  if (recorderState === "transcribing") return "Zuzu is sniffing your answer…";
  if (submitting) return "Trotting it over to the chat…";
  if (validationError) return "Zuzu will listen again in a moment.";
  if (lastTranscript) return `You said: "${lastTranscript}"`;
  return "Hold tight, hooman.";
}
