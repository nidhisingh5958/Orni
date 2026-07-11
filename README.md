# VoiceCanvas AI

VoiceCanvas AI is a voice-driven, real-time multimodal ad production canvas. A user speaks continuously, and the application generates ad creatives, swaps wardrobe/apparel on an avatar, animates static images into cinematic video clips with synchronized voiceovers, and translates campaigns into Hindi/Kannada with zero page reloads and sub-second perceived latency.

## Zero-Latency Architecture Decisions

To achieve the sub-second responsiveness required for a real-time voice interface, we adopt a hybrid communication pipeline. First, the microphone audio path is established **directly** from the browser to the Gemini Live WebSocket endpoint using a backend-issued, short-lived ephemeral token; raw audio frames never pass through our backend server, which prevents network serialization bottlenecking. Second, we use an **optimistic UI model** on the canvas, drawing visual shimmers and skeletons the moment a spoken intent is parsed, rather than waiting for downstream model responses (e.g. image or video generation) to resolve. Third, active editing sessions (such as the Omni Flash Interactions API session) are **pre-warmed** on load so that turns can be processed without initial session-creation overhead.

---

## Required Environment Variables (.env)

Create a `.env` file at the root of the project with the following keys:

```env
GEMINI_API_KEY=                 # Your Gemini API Key from Google AI Studio
PORT=8787                       # Backend port (default 8787)
FRONTEND_ORIGIN=http://localhost:5173
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
GEMINI_LIVE_TRANSLATE_MODEL=gemini-3.5-live-translate-preview
NB2_LITE_MODEL=gemini-3.1-flash-lite-image
OMNI_FLASH_MODEL=gemini-omni-flash-preview
FLASH_TTS_MODEL=gemini-3.1-flash-tts-preview
ANTIGRAVITY_RUNTIME_ID=antigravity-preview-05-2026
EPHEMERAL_TOKEN_TTL_SECONDS=60
```

---

## Running Locally

To run the application locally, you will need two terminal windows:

### 1. Start the Backend Relay Server
```bash
cd backend
npm install
npm run dev
```

### 2. Start the Frontend Dev Server
```bash
cd frontend
npm install
npm run dev
```
