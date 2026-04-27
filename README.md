# Zuzu Residency Agent

Zuzu is a single-purpose, voice-first residency application agent. Visitors land directly in a chat, hear Zuzu speak, answer 8 questions by voice or text, submit a video link, and the application is saved to Notion. A full-screen "voice mode" with an animated blob is available — Zuzu speaks, you reply by mic (transcribed via ElevenLabs Scribe), and the conversation auto-advances.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Integrations

Copy `.env.example` to `.env` and fill in the keys.

```bash
cp .env.example .env
```

### ElevenLabs

Set:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID=cgSgspJ2msm6clMCkdW9`
- `ELEVENLABS_MODEL_ID=eleven_v3`
- `ELEVENLABS_BARK_PROMPT=small happy dog bark, playful and warm, one-shot, clean studio sound`
- `ELEVENLABS_STT_MODEL_ID=scribe_v1`

Default voice: Jessica - Playful, Bright, Warm. Zuzu is a boy — swap to a male voice ID in your ElevenLabs library if you'd rather hear that. The voice ID is the only thing to change.

The default TTS model is **ElevenLabs v3**, which understands inline audio tags like `[excited]`, `[curious]`, `[apologetic]`, `[skeptical]`. Zuzu's lines are auto-tagged at the call site so the model can deliver the right emotion. If you switch the model env to a non-v3 model (e.g. `eleven_flash_v2_5`), the server route automatically strips the tags so you don't hear "bracket excited bracket" spoken aloud.

The same API key powers TTS, sound effects (the bark), and Scribe (speech-to-text). If `ELEVENLABS_API_KEY` is unset:
- Voice falls back to browser speech synthesis and a local synthesized bark.
- The "Talk" button and full-screen voice mode are disabled (no Scribe = no transcription). Users can still type.

### Notion

Set:

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID=49aa339a32354634a75dfcae3a584f15`

Created database:

- [Zuzu Residency Applications](https://www.notion.so/49aa339a32354634a75dfcae3a584f15)

Suggested Notion database properties:

- `Name` - Title
- `Status` - Select
- `Contact` - Rich text
- `Location` - Rich text
- `Residency` - Rich text
- `Motivation` - Rich text
- `Work` - Rich text
- `Availability` - Rich text
- `Video` - URL
- `Transcript` - Rich text
- `Source` - Rich text
- `Score` - Number

If Notion is not configured — or if the Notion write fails — submissions are appended as JSON lines to `data/applications.jsonl` on the server. The directory is created on first write and is gitignored.
