import type { Answers } from "@/config/questions";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\-.\s\d]{7,}$/;

export function looksLikeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function validateAnswer(key: keyof Answers, raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Zuzu can't sniff an empty bowl. Give me something.";

  if (key === "video" && !looksLikeUrl(value)) {
    return "That's not a link Zuzu can fetch. Paste one that starts with https://";
  }

  if (key === "contact") {
    const looksLikeEmail = emailPattern.test(value);
    const looksLikePhone = phonePattern.test(value);
    if (!looksLikeEmail && !looksLikePhone) {
      return "Email or phone, hooman. Zuzu can't send mail to vibes.";
    }
  }

  return null;
}
