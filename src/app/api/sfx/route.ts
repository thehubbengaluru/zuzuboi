import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { prompt?: string } | null;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const defaultPrompt = process.env.ELEVENLABS_BARK_PROMPT || "small happy dog bark, playful and warm, one-shot";
  const prompt = String(body?.prompt || defaultPrompt).trim().slice(0, 300);
  const modelId = process.env.ELEVENLABS_SFX_MODEL_ID || "eleven_text_to_sound_v2";

  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs sound effects are not configured." }, { status: 501 });
  }

  const elevenResponse = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text: prompt,
      model_id: modelId,
      duration_seconds: 0.7,
      prompt_influence: 0.85,
      loop: false
    })
  });

  if (!elevenResponse.ok) {
    const errorText = await elevenResponse.text();
    console.error("ElevenLabs sound effects error:", errorText);
    return NextResponse.json({ error: "ElevenLabs could not generate a bark." }, { status: 502 });
  }

  return new Response(elevenResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600"
    }
  });
}
