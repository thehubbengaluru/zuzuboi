import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type TranscriptItem = {
  role?: string;
  text?: string;
  at?: string;
};

type ApplicationBody = {
  answers?: Record<string, string>;
  transcript?: TranscriptItem[];
  userAgent?: string;
};

type Application = {
  name: string;
  contact: string;
  location: string;
  residency: string;
  motivation: string;
  work: string;
  availability: string;
  video: string;
  transcript: TranscriptItem[];
  userAgent: string;
  submittedAt: string;
};

const FALLBACK_PATH = path.join(process.cwd(), "data", "applications.jsonl");

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ApplicationBody | null;

  if (!body?.answers) {
    return NextResponse.json({ error: "Missing application answers." }, { status: 400 });
  }

  const application = normalizeApplication(body);
  const vetting = scoreApplication(application);
  const notionConfigured = Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID);
  let notionPageId: string | null = null;
  let notionError: string | null = null;
  let savedLocally = false;

  if (notionConfigured) {
    const result = await createNotionPage(application, vetting);
    if (result.ok) {
      notionPageId = result.pageId;
    } else {
      notionError = result.userMessage;
    }
  }

  if (!notionConfigured || notionError) {
    savedLocally = await appendFallback(application, vetting);
  }

  if (notionError && !savedLocally) {
    return NextResponse.json(
      {
        ok: false,
        notionConfigured,
        error: notionError,
        score: vetting.score,
        status: vetting.status
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    notionConfigured,
    notionPageId,
    notionError,
    savedLocally,
    status: vetting.status,
    score: vetting.score,
    nextStep: vetting.nextStep
  });
}

function normalizeApplication(body: ApplicationBody): Application {
  const answers = body.answers || {};
  const transcript = Array.isArray(body.transcript) ? body.transcript : [];

  return {
    name: clean(answers.name),
    contact: clean(answers.contact),
    location: clean(answers.location),
    residency: clean(answers.residency),
    motivation: clean(answers.motivation),
    work: clean(answers.work),
    availability: clean(answers.availability),
    video: clean(answers.video),
    transcript,
    userAgent: clean(body.userAgent),
    submittedAt: new Date().toISOString()
  };
}

function scoreApplication(application: Application) {
  let score = 0;
  const required: Array<keyof Pick<Application, "name" | "contact" | "location" | "residency" | "motivation" | "work" | "availability" | "video">> = [
    "name",
    "contact",
    "location",
    "residency",
    "motivation",
    "work",
    "availability",
    "video"
  ];

  for (const key of required) {
    if (application[key]) score += 10;
  }

  if (application.motivation.length > 80) score += 8;
  if (application.work.length > 60) score += 6;
  if (looksLikeUrl(application.video)) score += 6;

  const status = score >= 86 ? "Tail Wag" : score >= 70 ? "Needs Review" : "Incomplete";
  const nextStep =
    status === "Tail Wag"
      ? "Strong scent on this one. Zuzu has trotted your application straight to the hoomans."
      : status === "Needs Review"
        ? "Application's in. Zuzu will paw the hoomans to take a closer look."
        : "Application's in, but a few scents are missing. Zuzu will ask the hoomans to fill in the gaps.";

  return { score, status, nextStep };
}

type NotionResult =
  | { ok: true; pageId: string }
  | { ok: false; userMessage: string };

async function createNotionPage(
  application: Application,
  vetting: ReturnType<typeof scoreApplication>
): Promise<NotionResult> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  try {
    const notionResponse = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Name: title(application.name || "Unnamed applicant"),
          Status: select(vetting.status),
          Contact: richText(application.contact),
          Location: richText(application.location),
          Residency: richText(application.residency),
          Motivation: richText(application.motivation),
          Work: richText(application.work),
          Availability: richText(application.availability),
          Video: { url: looksLikeUrl(application.video) ? application.video : null },
          Transcript: richText(formatTranscript(application.transcript).slice(0, 1900)),
          Source: richText("zuzuboi.com"),
          Score: { number: vetting.score }
        }
      })
    });

    if (!notionResponse.ok) {
      const errorText = await notionResponse.text();
      console.error("Notion error:", notionResponse.status, errorText);
      return { ok: false, userMessage: notionUserMessage(notionResponse.status, errorText) };
    }

    const page = (await notionResponse.json()) as { id: string };
    return { ok: true, pageId: page.id };
  } catch (error) {
    console.error("Notion request failed:", error);
    return { ok: false, userMessage: "Could not reach Notion. The application was kept locally." };
  }
}

function notionUserMessage(status: number, errorText: string): string {
  if (status === 401 || status === 403) {
    return "Notion rejected the integration key. Check NOTION_API_KEY and that the database is shared with the integration.";
  }
  if (status === 404) {
    return "Notion could not find the database. Check NOTION_DATABASE_ID.";
  }
  if (status === 400) {
    try {
      const parsed = JSON.parse(errorText) as { message?: string };
      if (parsed.message) {
        return `Notion rejected the payload: ${parsed.message}`;
      }
    } catch {
      // fall through
    }
    return "Notion rejected the payload. The database schema may be missing a property.";
  }
  return `Notion returned ${status}. The application was kept locally.`;
}

async function appendFallback(
  application: Application,
  vetting: ReturnType<typeof scoreApplication>
): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(FALLBACK_PATH), { recursive: true });
    const line =
      JSON.stringify({
        ...application,
        score: vetting.score,
        status: vetting.status
      }) + "\n";
    await fs.appendFile(FALLBACK_PATH, line, "utf8");
    return true;
  } catch (error) {
    console.error("Local fallback write failed:", error);
    return false;
  }
}

function clean(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 2000);
}

function looksLikeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function formatTranscript(transcript: TranscriptItem[]) {
  return transcript
    .map((item) => `${item.role === "zuzu" ? "Zuzu" : "Applicant"}: ${clean(item.text)}`)
    .join("\n");
}

function title(text: string) {
  return { title: [{ text: { content: text.slice(0, 120) } }] };
}

function richText(text: string) {
  return { rich_text: text ? [{ text: { content: text.slice(0, 1900) } }] : [] };
}

function select(name: string) {
  return { select: { name } };
}
