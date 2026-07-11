import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnv = [
  'GEMINI_API_KEY',
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`CRITICAL CONFIG ERROR: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

export const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
  PORT: parseInt(process.env.PORT || '8787', 10),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  // gemini-2.0-flash-live-001 is the stable documented Live API model
  GEMINI_LIVE_MODEL: process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001',
  GEMINI_LIVE_TRANSLATE_MODEL: process.env.GEMINI_LIVE_TRANSLATE_MODEL || 'gemini-2.0-flash-live-001',
  // gemini-2.0-flash-exp supports responseModalities: ["IMAGE"] — the ONLY stable generateContent image model
  NB2_LITE_MODEL: process.env.NB2_LITE_MODEL || 'gemini-2.0-flash-exp',
  OMNI_FLASH_MODEL: process.env.OMNI_FLASH_MODEL || 'gemini-2.0-flash-exp',
  // gemini-2.0-flash for text-only tasks (intent parsing, transcription)
  INTENT_MODEL: process.env.INTENT_MODEL || 'gemini-2.0-flash',
  // gemini-2.5-flash-preview-tts for text-to-speech
  FLASH_TTS_MODEL: process.env.FLASH_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
  ANTIGRAVITY_RUNTIME_ID: process.env.ANTIGRAVITY_RUNTIME_ID || 'antigravity-preview-05-2026',
  EPHEMERAL_TOKEN_TTL_SECONDS: parseInt(process.env.EPHEMERAL_TOKEN_TTL_SECONDS || '60', 10),
};
