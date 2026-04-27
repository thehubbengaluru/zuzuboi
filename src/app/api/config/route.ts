import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const elevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY);
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
  return NextResponse.json({
    elevenLabsConfigured: elevenLabsKey && Boolean(process.env.ELEVENLABS_VOICE_ID),
    soundEffectsConfigured: elevenLabsKey,
    scribeConfigured: elevenLabsKey,
    notionConfigured: Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID),
    voiceName: process.env.ELEVENLABS_VOICE_NAME || null,
    voiceModelId: modelId,
    voiceModelSupportsMood: /v3/i.test(modelId)
  });
}
