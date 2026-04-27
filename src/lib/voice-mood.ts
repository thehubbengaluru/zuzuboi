import type { Answers } from "@/config/questions";

export type Mood =
  | "excited"
  | "curious"
  | "playful"
  | "cheeky"
  | "happy"
  | "proud"
  | "thoughtful"
  | "skeptical"
  | "apologetic"
  | "concerned";

/**
 * ElevenLabs v3 supports inline audio tags like `[excited]` to shape delivery.
 * The TTS server route strips bracketed tags when the active model isn't v3,
 * so it's safe to call this everywhere.
 */
export function withMood(mood: Mood, text: string): string {
  return `[${mood}] ${text}`;
}

export function questionMood(key: keyof Answers): Mood {
  switch (key) {
    case "name":
      return "excited";
    case "contact":
      return "playful";
    case "location":
      return "curious";
    case "residency":
      return "playful";
    case "motivation":
      return "curious";
    case "work":
      return "curious";
    case "availability":
      return "playful";
    case "video":
      return "cheeky";
  }
}

export function reactionMood(key: keyof Answers, value: string): Mood {
  switch (key) {
    case "name":
      return "happy";
    case "contact":
      return "playful";
    case "location":
      return "playful";
    case "residency":
      return "curious";
    case "motivation":
      return value.length > 90 ? "proud" : "skeptical";
    case "work":
      return "playful";
    case "availability":
      return "happy";
    case "video":
      return "happy";
  }
}

export function resultMood(opts: {
  score?: number;
  notionConfigured?: boolean;
  notionError?: string | null;
}): Mood {
  if ((opts.score ?? 0) < 70) return "thoughtful";
  if (opts.notionConfigured && opts.notionError) return "apologetic";
  if ((opts.score ?? 0) >= 86) return "excited";
  return "thoughtful";
}
