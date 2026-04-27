"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Answers, emptyAnswers, questions } from "@/config/questions";
import { useRecorder } from "@/hooks/use-recorder";
import { useZuzuVoice, type BarkType } from "@/hooks/use-zuzu-voice";
import { validateAnswer } from "@/lib/validation";
import { questionMood, reactionMood, resultMood, withMood } from "@/lib/voice-mood";
import { VoiceMode } from "./voice-mode";
import {
  MicIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
  VolumeOffIcon,
  VolumeOnIcon
} from "./icons";

type TranscriptItem = {
  role: "zuzu" | "user";
  text: string;
  at: string;
};

type AppConfig = {
  elevenLabsConfigured: boolean;
  soundEffectsConfigured: boolean;
  scribeConfigured: boolean;
  notionConfigured: boolean;
  voiceName: string | null;
};

type ConfigState = "loading" | "ready" | "error";

const MUTE_STORAGE_KEY = "zuzu:muted";
const DRAFT_STORAGE_KEY = "zuzu:draft";
const ANSWERS_STORAGE_KEY = "zuzu:answers";
const SUBMITTED_STORAGE_KEY = "zuzu:submitted";

export function ZuzuAgent() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [voiceModeShowStart, setVoiceModeShowStart] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const autoOpenedRef = useRef(false);
  const partialSavedRef = useRef(false);
  const [configState, setConfigState] = useState<ConfigState>("loading");
  const [config, setConfig] = useState<AppConfig>({
    elevenLabsConfigured: false,
    soundEffectsConfigured: false,
    scribeConfigured: false,
    notionConfigured: false,
    voiceName: null
  });

  const chatWindowRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const askedFirstQuestionRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const answersRef = useRef<Answers>(emptyAnswers);
  const indexRef = useRef(0);
  const completedRef = useRef(false);
  const hydratedRef = useRef(false);

  const handleComposerTranscript = useCallback((text: string) => {
    setDraft(text);
    setDraftError(null);
  }, []);

  const composerRecorder = useRecorder({
    onTranscript: handleComposerTranscript
  });

  const handleElevenFailure = useCallback(() => {
    setConfig((value) => ({ ...value, elevenLabsConfigured: false }));
  }, []);

  const voice = useZuzuVoice({
    elevenLabsConfigured: config.elevenLabsConfigured,
    muted,
    onElevenLabsFailure: handleElevenFailure
  });

  const currentQuestion = questions[index];
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);
  const progress = Math.round((answeredCount / questions.length) * 100);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    completedRef.current = completed;
  }, [completed]);

  useEffect(() => {
    transcriptRef.current = transcript;
    chatWindowRef.current?.scrollTo({ top: chatWindowRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedMute = window.localStorage.getItem(MUTE_STORAGE_KEY);
      if (storedMute === "1") setMuted(true);

      const storedAnswers = window.localStorage.getItem(ANSWERS_STORAGE_KEY);
      if (storedAnswers) {
        const parsed = JSON.parse(storedAnswers) as Partial<Answers>;
        const merged: Answers = { ...emptyAnswers, ...parsed };
        const firstUnanswered = questions.findIndex((q) => !merged[q.key]);
        if (firstUnanswered > 0) {
          setAnswers(merged);
          setIndex(firstUnanswered);
        }
      }

      const storedDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (storedDraft) setDraft(storedDraft);

      if (window.localStorage.getItem(SUBMITTED_STORAGE_KEY) === "1") {
        setAlreadySubmitted(true);
      }
    } catch {
      // localStorage unavailable; continue.
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [muted]);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, draft);
    } catch {
      /* ignore */
    }
  }, [draft]);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers));
    } catch {
      /* ignore */
    }
  }, [answers]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((response) => {
        if (!response.ok) throw new Error("config request failed");
        return response.json();
      })
      .then((nextConfig: AppConfig) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setConfigState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setConfigState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (configState !== "ready") return;
    if (askedFirstQuestionRef.current) return;
    askedFirstQuestionRef.current = true;
    const startQuestion = questions[indexRef.current];
    addMessage("zuzu", startQuestion.prompt);
    // If scribe is configured, voice mode will auto-open and re-speak on user's first tap.
    // Otherwise speak now (chat-only mode, user has likely already interacted).
    if (!config.scribeConfigured) {
      void voice.speak(
        withMood(questionMood(startQuestion.key), startQuestion.prompt),
        indexRef.current === 0 ? "happy" : false
      );
    }
  }, [configState, config.scribeConfigured, voice]);

  // Auto-open voice mode when config loads (if Scribe is available)
  useEffect(() => {
    if (configState !== "ready") return;
    if (!config.scribeConfigured) return;
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setVoiceModeShowStart(true);
    setVoiceModeOpen(true);
  }, [configState, config.scribeConfigured]);

  const handleVoiceModeStart = useCallback(() => {
    voice.primeAudioContext();
    const q = questions[indexRef.current];
    void voice.speak(withMood(questionMood(q.key), q.prompt), indexRef.current === 0 ? "happy" : false);
  }, [voice]);

  function addMessage(role: TranscriptItem["role"], text: string) {
    setTranscript((items) => [...items, { role, text, at: new Date().toISOString() }]);
  }

  const submitValue = useCallback(
    async (rawValue: string) => {
      const value = rawValue.trim();
      if (!value) return;
      if (completedRef.current || submitInFlightRef.current) return;

      const currentIndex = indexRef.current;
      const question = questions[currentIndex];
      submitInFlightRef.current = true;

      const nextAnswers: Answers = { ...answersRef.current, [question.key]: value };
      setAnswers(nextAnswers);
      addMessage("user", value);
      setDraft("");
      setDraftError(null);

      try {
        if (currentIndex < questions.length - 1) {
          const nextIndex = currentIndex + 1;
          const nextQuestion = questions[nextIndex];

          setThinking(true);
          const aiReaction = await fetchReaction({
            key: question.key,
            question: question.prompt,
            answer: value,
            name: answersRef.current.name || undefined,
            priorAnswers: answersRef.current,
            nextQuestionBase: nextQuestion.prompt
          });
          setThinking(false);

          const { display: reactionDisplay, spoken: reactionSpoken } = aiReaction ?? getReaction(question.key, value);
          const spokenNextQuestion = aiReaction?.nextQuestion ?? nextQuestion.prompt;

          addMessage("zuzu", reactionDisplay);
          await voice.speak(
            withMood(reactionMood(question.key, value), reactionSpoken),
            getBarkType(question.key)
          );

          await delay(280);
          setIndex(nextIndex);
          addMessage("zuzu", spokenNextQuestion);
          await voice.speak(
            withMood(questionMood(nextQuestion.key), spokenNextQuestion),
            nextQuestion.key === "video" ? "video" : false
          );
          textareaRef.current?.focus();

          // Background partial save after motivation (Q4) — never lose a half-finished application
          if (currentIndex === 3 && !partialSavedRef.current) {
            partialSavedRef.current = true;
            void fetch("/api/applications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answers: nextAnswers, partial: true })
            });
          }
          return;
        }

        setCompleted(true);
        await finishApplication(nextAnswers);
      } finally {
        setThinking(false);
        submitInFlightRef.current = false;
      }
    },
    [voice]
  );

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (completed || submitting || submitInFlightRef.current) return;

    const value = draft.trim();
    const error = validateAnswer(currentQuestion.key, value);
    if (error) {
      setDraftError(error);
      textareaRef.current?.focus();
      return;
    }

    await submitValue(value);
  }

  async function finishApplication(finalAnswers: Answers) {
    setSubmitting(true);
    const summary = `Application sniffed, sealed, and stamped. ${finalAnswers.name} from ${finalAnswers.location}, eyes on ${finalAnswers.residency}, video in the bag. Off to the hoomans.`;
    addMessage("zuzu", summary);
    await voice.speak(
      withMood("excited", "Tail high. I'm trotting this over to the hoomans now."),
      "celebrate"
    );

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: finalAnswers,
          transcript: transcriptRef.current,
          userAgent: navigator.userAgent
        })
      });

      const result = (await response.json().catch(() => null)) as
        | {
            nextStep?: string;
            score?: number;
            status?: string;
            notionConfigured?: boolean;
            notionError?: string | null;
            savedLocally?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !result) {
        throw new Error(result?.error || `Request failed (${response.status})`);
      }

      const finalMessage = composeFinalMessage(result);
      addMessage("zuzu", finalMessage);
      await voice.speak(withMood(resultMood(result), finalMessage), "celebrate");
      clearStoredProgress();
      setVoiceModeOpen(false);
      setShowSuccessModal(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      const message = `Zuzu caught the application, but the door slammed shut (${detail}). Give it a minute and try again, hooman.`;
      addMessage("zuzu", message);
      await voice.speak(
        withMood("apologetic", "Something tripped on the way to the hoomans. One more time."),
        false
      );
      setCompleted(false);
    } finally {
      setSubmitting(false);
    }
  }

  function composeFinalMessage(result: {
    nextStep?: string;
    score?: number;
    notionConfigured?: boolean;
    notionError?: string | null;
    savedLocally?: boolean;
  }) {
    const head = result.nextStep ?? "Application's in.";
    if (result.notionConfigured && !result.notionError) {
      return `${head} Filed away in Notion. Tail high.`;
    }
    if (result.notionError && result.savedLocally) {
      return `${head} Notion didn't open the door (${result.notionError}). Don't worry — Zuzu buried a copy on the server.`;
    }
    if (result.notionConfigured && result.notionError) {
      return `${head} Notion bit back: ${result.notionError}`;
    }
    if (result.savedLocally) {
      return `${head} Notion isn't connected, so Zuzu buried a copy on the server for the hoomans.`;
    }
    return `${head} Notion isn't connected and Zuzu couldn't bury a copy. Try again, hooman.`;
  }

  function clearStoredProgress() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      window.localStorage.removeItem(ANSWERS_STORAGE_KEY);
      window.localStorage.setItem(SUBMITTED_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function resetAndStartFresh() {
    if (typeof window === "undefined") return;
    try {
      [MUTE_STORAGE_KEY, DRAFT_STORAGE_KEY, ANSWERS_STORAGE_KEY, SUBMITTED_STORAGE_KEY].forEach(
        (k) => window.localStorage.removeItem(k)
      );
    } catch { /* ignore */ }
    window.location.reload();
  }

  function toggleComposerRecorder() {
    if (completed || submitting) return;
    if (composerRecorder.state === "recording") {
      composerRecorder.stop();
      return;
    }
    if (composerRecorder.state !== "idle") return;
    voice.primeAudioContext();
    setDraft("");
    setDraftError(null);
    void composerRecorder.start({ autoStopOnSilence: false });
  }

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      if (next) voice.cancel();
      return next;
    });
  }

  function onDraftChange(value: string) {
    setDraft(value);
    if (draftError) setDraftError(null);
  }

  function openVoiceMode() {
    if (!config.scribeConfigured) return;
    if (composerRecorder.state === "recording") composerRecorder.stop();
    voice.primeAudioContext();
    setVoiceModeShowStart(false);
    setVoiceModeOpen(true);
  }

  const speakError = useCallback(
    async (text: string) => {
      addMessage("zuzu", text);
      await voice.speak(withMood("concerned", text), false);
    },
    [voice]
  );

  const composerLabel = composerLabelFor({
    recorderState: composerRecorder.state,
    errorMessage: composerRecorder.errorMessage
  });
  const voiceLabel = composerRecorder.state === "recording" ? "listening" : composerLabel || voice.voiceStatus;
  const pillText = config.voiceName && !muted && composerRecorder.state !== "recording"
    ? `${voiceLabel}: ${config.voiceName}`
    : voiceLabel;
  const composerDisabled = completed || submitting;
  const composerTalkDisabled =
    composerDisabled ||
    !composerRecorder.supported ||
    !config.scribeConfigured ||
    composerRecorder.state === "transcribing";
  const composerTalkLabel =
    composerRecorder.state === "recording"
      ? "Stop"
      : composerRecorder.state === "transcribing"
        ? "Sniffing"
        : "Talk";

  return (
    <main className="app-shell">
      <section className="agent-panel" aria-label="Zuzu residency application chat">
        <header className="topbar">
          <div className="brand-lockup" aria-label="Zuzu residency agent">
            <div className="zuzu-portrait" aria-hidden="true">
              <img src="/zuzu.jpg" alt="" />
            </div>
            <div className="copy">
              <p className="eyebrow">zuzuboi.com</p>
              <h1>Zuzu Residency Agent</h1>
            </div>
          </div>

          <div className="status-cluster">
            <span className="pill">{pillText}</span>
            <button
              type="button"
              className="icon-button voice-mode-toggle"
              onClick={openVoiceMode}
              disabled={!config.scribeConfigured || completed}
              title={
                config.scribeConfigured
                  ? "Open voice mode"
                  : "Voice mode needs ElevenLabs Scribe configured"
              }
              aria-label="Open voice mode"
            >
              <SparklesIcon />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={muted ? "Unmute Zuzu" : "Mute Zuzu"}
              aria-pressed={muted}
              title={muted ? "Unmute Zuzu" : "Mute Zuzu"}
              onClick={toggleMute}
            >
              {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
            </button>
          </div>
        </header>

        {configState === "error" && (
          <div className="banner banner-error" role="alert">
            Zuzu can't reach the kennel right now. Voice and submission may misbehave — give the page a refresh.
          </div>
        )}

        {alreadySubmitted && !completed && (
          <div className="banner banner-submitted" role="alert">
            Zuzu already sniffed your application once.{" "}
            <button className="banner-link" onClick={resetAndStartFresh}>
              Start fresh anyway
            </button>
          </div>
        )}

        <div className="progress-wrap" aria-label="Application progress">
          <div className="progress-copy">
            <span>
              {completed
                ? "Application complete"
                : `Question ${Math.min(index + 1, questions.length)} of ${questions.length}`}
            </span>
            <span>tail-wag meter {progress}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="chat-window" ref={chatWindowRef} aria-live="polite" aria-label="Conversation with Zuzu">
          {transcript.length === 0 && configState !== "error" && (
            <div className="chat-empty">
              <div className="chat-empty-portrait" aria-hidden="true">
                <img src="/zuzu.jpg" alt="" />
              </div>
              <p>Zuzu is warming up his snoot…</p>
            </div>
          )}
          {transcript.map((message) => {
            const isZuzu = message.role === "zuzu";
            const initial = answers.name?.trim().charAt(0).toUpperCase() || "Y";
            return (
              <article className={`message ${message.role}`} key={`${message.at}-${message.text}`}>
                <div className={`avatar ${isZuzu ? "zuzu-avatar" : ""}`} aria-hidden="true">
                  {isZuzu ? <img src="/zuzu.jpg" alt="" /> : <span>{initial}</span>}
                </div>
                <div className="bubble">
                  <p>{message.text}</p>
                  <span className="timestamp" aria-hidden="true">
                    {new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        <form className="composer" onSubmit={submitAnswer} noValidate>
          <button
            className={`voice-button ${composerRecorder.state === "recording" ? "listening" : ""}`}
            type="button"
            aria-label="Answer by voice"
            title={
              !composerRecorder.supported
                ? "Voice input is not supported in this browser"
                : !config.scribeConfigured
                  ? "ElevenLabs Scribe is not configured"
                  : "Answer by voice"
            }
            onClick={toggleComposerRecorder}
            disabled={composerTalkDisabled}
          >
            {composerRecorder.state === "recording" ? <StopIcon /> : <MicIcon />}
            <span>{composerTalkLabel}</span>
          </button>
          <label className="input-wrap">
            <span className="sr-only">Your answer</span>
            <textarea
              ref={textareaRef}
              rows={1}
              autoComplete="off"
              placeholder={currentQuestion.hint}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!composerDisabled && draft.trim()) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              disabled={composerDisabled}
              aria-invalid={Boolean(draftError)}
              aria-describedby={draftError ? "draft-error" : undefined}
            />
          </label>
          <button
            className="send-button"
            type="submit"
            disabled={composerDisabled || !draft.trim()}
            aria-label={submitting ? "Sending answer" : "Send answer"}
          >
            <SendIcon />
            <span>{submitting ? "Sending" : "Send"}</span>
          </button>
          {(draftError || composerRecorder.errorMessage) && (
            <p id="draft-error" className="composer-error" role="alert">
              {draftError || composerRecorder.errorMessage}
            </p>
          )}
        </form>
      </section>

      <aside className="side-panel" aria-label="Application summary">
        <div className="summary-card dog-card">
          <div className="dog-card-portrait" aria-hidden="true">
            <img src="/zuzu.jpg" alt="" />
          </div>
          <div>
            <p className="eyebrow">current mission</p>
            <h2>Talk to Zuzu first. The hoomans only meet you if I wag.</h2>
          </div>
        </div>

        <div className="summary-card">
          <p className="eyebrow">application scent trail</p>
          <dl className="summary-list">
            {questions.map((question) => {
              const value = answers[question.key];
              return (
                <div key={question.key} className={value ? "answered" : ""}>
                  <dt>{question.label}</dt>
                  <dd>{value || "no scent yet"}</dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div className="summary-card compact">
          <p className="eyebrow">voice mode</p>
          <p>Tap the sparkle to go full voice. Talk to Zuzu, watch the blob breathe, hear the bark. Or stay here and type — Zuzu doesn't judge. Much.</p>
        </div>
      </aside>

      {showSuccessModal && (
        <div
          className="success-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Application submitted"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSuccessModal(false); }}
        >
          <div className="success-modal-card">
            <div className="success-modal-portrait">
              <img src="/zuzu.jpg" alt="Zuzu" />
            </div>
            <p className="success-modal-eyebrow">Sniff successful</p>
            <h2 className="success-modal-title">Your application is with the humans of The Hub.</h2>
            <p className="success-modal-body">
              We'll go through it and send you a confirmation. Keep building — Zuzu's got your back.
            </p>
            <button
              type="button"
              className="success-modal-close"
              onClick={() => setShowSuccessModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {voiceModeOpen && (
        <VoiceMode
          question={currentQuestion}
          questionNumber={Math.min(index + 1, questions.length)}
          totalQuestions={questions.length}
          speaking={voice.speaking}
          outputAmplitude={voice.outputAmplitude}
          thinking={thinking}
          completed={completed}
          scribeAvailable={config.scribeConfigured}
          showStartScreen={voiceModeShowStart}
          validate={validateAnswer}
          speakError={speakError}
          submitValue={submitValue}
          onStart={handleVoiceModeStart}
          onInterrupt={voice.cancel}
          onExit={() => setVoiceModeOpen(false)}
        />
      )}
    </main>
  );
}

function composerLabelFor({
  recorderState,
  errorMessage
}: {
  recorderState: "idle" | "recording" | "transcribing";
  errorMessage: string | null;
}) {
  if (recorderState === "recording") return "listening";
  if (recorderState === "transcribing") return "sniffing";
  if (errorMessage) return errorMessage;
  return null;
}

type Reaction = { display: string; spoken: string };

function getReaction(key: keyof Answers, value: string): Reaction {
  const first = value.split(" ")[0];
  const reactions: Partial<Record<keyof Answers, Reaction>> = {
    name: {
      display: `Got it, ${first}. Tail wag of approval.`,
      spoken: `Got it, ${first}. I like you already.`
    },
    contact: {
      display: "Locked in. The hoomans now have a way to fetch you back.",
      spoken: "Locked in. The hoomans can reach you now."
    },
    location: {
      display: "Sniffed and saved. I know your scent now.",
      spoken: "Got it. I know where you're coming from."
    },
    residency: {
      display: "Interesting scent. My ears just perked up.",
      spoken: "Interesting. My ears are perked."
    },
    motivation: {
      display:
        value.length > 90
          ? "Now THAT answer has bite. Good hooman."
          : "Short. Zuzu will allow it. For now.",
      spoken:
        value.length > 90
          ? "Now that answer has some real bite. Good."
          : "Short answer. Zuzu will allow it. For now."
    },
    work: {
      display: "Zuzu respects hoomans who actually build, not just talk about it.",
      spoken: "I respect people who actually build things."
    },
    availability: {
      display: "Calendar scent captured. Don't ghost me, hooman.",
      spoken: "Got it. Don't ghost me."
    }
  };

  return reactions[key] ?? { display: "Noted.", spoken: "Noted." };
}

function getBarkType(key: keyof Answers): BarkType | false {
  const map: Partial<Record<keyof Answers, BarkType>> = {
    name: "happy",
    motivation: "excited",
    availability: "celebrate"
  };
  return map[key] ?? false;
}

async function fetchReaction({
  key,
  question,
  answer,
  name,
  priorAnswers,
  nextQuestionBase
}: {
  key: string;
  question: string;
  answer: string;
  name?: string;
  priorAnswers?: Answers;
  nextQuestionBase?: string;
}): Promise<(Reaction & { nextQuestion?: string }) | null> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, question, answer, name, priorAnswers, nextQuestionBase })
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { reaction?: string; nextQuestion?: string };
    if (!data.reaction) return null;
    return { display: data.reaction, spoken: data.reaction, nextQuestion: data.nextQuestion };
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
