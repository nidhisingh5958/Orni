import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnv = ['GEMINI_API_KEY'];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`CRITICAL CONFIG ERROR: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

export const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
  PORT: parseInt(process.env.PORT || '8787', 10),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',

  // Live API (WebSocket voice)
  GEMINI_LIVE_MODEL: process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001',
  GEMINI_LIVE_TRANSLATE_MODEL: process.env.GEMINI_LIVE_TRANSLATE_MODEL || 'gemini-2.0-flash-live-001',

  // Text-only tasks: intent parsing, transcription
  INTENT_MODEL: process.env.INTENT_MODEL || 'gemini-2.0-flash',

  // Text-to-speech
  FLASH_TTS_MODEL: process.env.FLASH_TTS_MODEL || 'gemini-2.5-flash-preview-tts',

  // Image generation — cascade fallback chain (1 → 2 → placeholder)
  IMAGEN_MODEL: process.env.IMAGEN_MODEL || 'imagen-3.0-generate-002',         // 1st: Imagen 3 (best)
  GEMINI_EXP_IMAGE_MODEL: process.env.GEMINI_EXP_IMAGE_MODEL || 'gemini-2.0-flash-exp', // 2nd: Gemini Exp

  // Video generation — cascade fallback chain (1 → 2 → 3 → placeholder)
  VEO_MODEL: process.env.VEO_MODEL || 'veo-2.0-generate-001',  // 1st: Veo 2 (real MP4)
  VEO_TIMEOUT_MS: parseInt(process.env.VEO_TIMEOUT_MS || '45000', 10),

  ANTIGRAVITY_RUNTIME_ID: process.env.ANTIGRAVITY_RUNTIME_ID || 'antigravity-preview-05-2026',
  EPHEMERAL_TOKEN_TTL_SECONDS: parseInt(process.env.EPHEMERAL_TOKEN_TTL_SECONDS || '60', 10),
};
