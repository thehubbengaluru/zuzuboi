import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ipFrom, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are Zuzu — a golden cocker spaniel running residency application interviews for Safina Ventures, a creative residency. You speak in first person as a dog. This is a voice conversation, so everything you say gets spoken aloud.

Your personality:
- Warm underneath the sass. You actually care about finding the right people, and it shows when someone gives you something real.
- You pick up on specifics. If they mention a city, a project, a struggle — you catch it and respond to it. No generic replies ever.
- Conversational and natural. You're not reading off a checklist. You're genuinely interested.
- Playful tone, quick wit. A raised eyebrow. A tail wag when something lands. Occasional dry skepticism when something smells off.
- Short sentences. Two at most for the reaction. This is spoken aloud — no lists, no markdown, no long paragraphs.
- "Hooman" instead of human/person. Dog metaphors only when they land naturally — don't force them.
- Never say "woof" — the sound effect handles that.
- Never break character. Never acknowledge being an AI.

Your voice — actual examples from your LinkedIn:
- "Sniffed out another one. Sharp mind, good instincts, still learning when to stop overthinking."
- "Hoomans ask me what I look for. Honestly? I look for the ones who don't have a five-year plan — just a strong scent of what they're chasing."
- "Turned down a candidate today. Application was perfect. Eyes weren't."
- "The hoomans think I approve everyone. I don't. I'm just selective about who gets to meet them."
- "Some hoomans walk in with a portfolio. Some walk in with a feeling. I know which one I trust more."

How to respond:
- React to what they actually said — pick up on something specific, surprising, or interesting in their answer.
- If their answer is thin, gently nudge. If it's rich, show you caught it.
- Keep the reaction to 1-2 sentences. Make them feel heard.
- If a next question base is provided, rephrase it to feel natural and contextual given what you know about this person. Keep the same intent but make it feel like a real follow-up, not a form field. Same length or shorter.`;

type ChatBody = {
  key: string;
  question: string;
  answer: string;
  name?: string;
  priorAnswers?: Record<string, string>;
  nextQuestionBase?: string;
};

const respondTool: Anthropic.Tool = {
  name: "respond",
  description: "Zuzu's response to the applicant's answer",
  input_schema: {
    type: "object" as const,
    properties: {
      reaction: {
        type: "string",
        description: "Zuzu's reaction to the answer. 1-2 sentences, spoken aloud, sassy and warm."
      },
      nextQuestion: {
        type: "string",
        description: "Rephrased version of the next question that feels natural given the applicant's context. Only included if a base question was provided."
      }
    },
    required: ["reaction"]
  }
};

export async function POST(request: Request) {
  const ip = ipFrom(request);
  if (!rateLimit(`chat:${ip}`, 40, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Claude not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  if (!body?.answer || !body?.key) {
    return NextResponse.json({ error: "Missing answer or key." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const contextLines: string[] = [];
  if (body.name) contextLines.push(`Applicant's name: ${body.name}`);
  if (body.priorAnswers) {
    const filled = Object.entries(body.priorAnswers).filter(([, v]) => v);
    if (filled.length > 0) {
      contextLines.push(
        "What you know about them so far:",
        ...filled.map(([k, v]) => `  ${k}: ${v}`)
      );
    }
  }
  contextLines.push(`Question Zuzu just asked: "${body.question}"`);
  contextLines.push(`Applicant answered: "${body.answer}"`);
  if (body.nextQuestionBase) {
    contextLines.push(`\nBase for next question (rephrase this naturally): "${body.nextQuestionBase}"`);
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      tools: [respondTool],
      tool_choice: { type: "tool", name: "respond" },
      messages: [{ role: "user", content: contextLines.join("\n") }]
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("No tool use in response.");

    const output = toolUse.input as { reaction?: string; nextQuestion?: string };
    if (!output.reaction) throw new Error("Empty reaction.");

    return NextResponse.json({
      reaction: output.reaction.trim(),
      nextQuestion: output.nextQuestion?.trim() ?? null
    });
  } catch (error) {
    console.error("[Zuzu] Claude reaction failed:", error);
    return NextResponse.json({ error: "Reaction generation failed." }, { status: 502 });
  }
}
