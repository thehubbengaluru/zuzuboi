import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const modelId = process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v1";

  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs Scribe is not configured." }, { status: 501 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart audio upload." }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio file is too large." }, { status: 413 });
  }

  const language = (formData.get("language_code") as string | null)?.trim() || undefined;

  const upstream = new FormData();
  upstream.append("file", audio, "answer.webm");
  upstream.append("model_id", modelId);
  if (language) upstream.append("language_code", language);

  let elevenResponse: Response;
  try {
    elevenResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: upstream
    });
  } catch (error) {
    console.error("Scribe request failed:", error);
    return NextResponse.json({ error: "Could not reach ElevenLabs Scribe." }, { status: 502 });
  }

  if (!elevenResponse.ok) {
    const errorText = await elevenResponse.text();
    console.error("Scribe error:", elevenResponse.status, errorText);
    return NextResponse.json(
      { error: scribeUserMessage(elevenResponse.status) },
      { status: 502 }
    );
  }

  const payload = (await elevenResponse.json().catch(() => null)) as
    | { text?: string; language_code?: string; language_probability?: number }
    | null;

  if (!payload || typeof payload.text !== "string") {
    return NextResponse.json({ error: "Scribe returned an unexpected response." }, { status: 502 });
  }

  return NextResponse.json({
    text: payload.text.trim(),
    languageCode: payload.language_code ?? null,
    languageProbability: payload.language_probability ?? null
  });
}

function scribeUserMessage(status: number) {
  if (status === 401 || status === 403) return "ElevenLabs rejected the API key.";
  if (status === 429) return "ElevenLabs rate-limited Zuzu. Try again in a moment.";
  if (status >= 500) return "ElevenLabs is having a moment. Try again.";
  return "Scribe could not transcribe that clip.";
}
