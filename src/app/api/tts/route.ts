import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  let text = String(body?.text || "").trim().slice(0, 600);

  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";

  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: "ElevenLabs is not configured." }, { status: 501 });
  }

  // v3 understands inline audio tags like `[excited]`. Older models would
  // speak the brackets out loud, so strip them when not on v3.
  if (!/v3/i.test(modelId)) {
    text = text.replace(/\[[^\]]+\]\s*/g, "").trim();
  }

  const elevenResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.32,
        similarity_boost: 0.80,
        style: 0.62,
        use_speaker_boost: true
      }
    })
  });

  if (!elevenResponse.ok) {
    const errorText = await elevenResponse.text();
    console.error("ElevenLabs error:", errorText);
    return NextResponse.json({ error: "ElevenLabs could not generate audio." }, { status: 502 });
  }

  return new Response(elevenResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store"
    }
  });
}
