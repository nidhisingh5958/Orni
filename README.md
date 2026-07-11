# Orni

Talk to your phone and watch it dress a photo or design an ad in real time — no typing, no
"generate" button, live corrections mid-sentence.

Native Kotlin/Compose Android app + a thin FastAPI relay that holds the Gemini API key
server-side. Three features share one architecture:

| Feature | Input | Output |
|---|---|---|
| **Virtual Try-On** | Photo + typed outfit description | Garment composited onto the photo |
| **Audio Ad Canvas** | Continuous voice (ad brief) | Typographically-correct ad frame, updated live |
| **Voice Wardrobe** | Photo + continuous voice | Outfit changes by talking ("make it blue instead") |

## The core pipeline (protect this)

```
voice (Gemini Live) ──► structured intent ──► NB2 Lite renders the garment/typography layer FIRST
                                                        │
photo ──────────────────────────────────────► Omni Flash composites it SECOND (stateful session)
                                                        │
                                              result streamed back to Compose UI
```

- **NB2 Lite** (image generation model) owns anything that must be *precise*: garments, logos,
  on-image text. Never ask Omni Flash to render text — it garbles it.
- **Omni Flash** owns *compositing and iteration*: it holds a stateful multi-turn session per
  photo, so "make it corduroy" is an incremental turn, not a cold start.
- **One session per asset.** Selecting a new photo must close the old Omni Flash session and
  start fresh — never let edits bleed across try-ons.

## Repo layout

```
app/                                    Android app (Kotlin, Jetpack Compose, package com.orni.app)
  src/main/kotlin/com/orni/app/
    MainActivity.kt                     Bottom-nav shell: Try-On | Ad Canvas
    wardrobe/                           Virtual Try-On + Voice Wardrobe
      WardrobeViewModel.kt              State machine, voice session, undo stack
      WardrobeUiState.kt                Idle/Listening/IntentStabilizing/Generating/Applying/Success/Error
      WardrobeIntent.kt                 {action: replace|add|modify, garmentType, color, material}
      audio/WardrobeGeminiLiveSession.kt  Gemini Live WS (BidiGenerateContent protocol)
      network/                          Retrofit service, repository, DTOs, shared NetworkModule
      ui/WardrobeTryOnScreen.kt         Full-bleed preview, picker, text input, waveform, undo
    ad/                                 Audio Ad Canvas
      AdViewModel.kt                    Debounced intent → generation, supersede-on-interrupt
      audio/GeminiLiveSession.kt        Phase-0 WS session (echo-server protocol — see Known issues)
      audio/MicAudioSource.kt           SINGLE mic implementation (16 kHz mono PCM Flow) — reuse this
      ui/AudioAdCanvasScreen.kt         Live canvas, waveform, transcript strip
backend/                                FastAPI relay (holds GEMINI_API_KEY)
  app/main.py                           All endpoints
  requirements.txt
docs/                                   Architecture notes + verification reports
```

## Relay API

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness probe |
| `POST /generate-garment` | NB2 Lite: outfit description → garment PNG (base64) |
| `POST /apply-garment` | Omni Flash: photo + garment + optional `sessionId` → composited image; reuses server-side session history |
| `POST /ad/generate` | NB2 Lite: structured ad intent → 1024×1024 ad frame |
| `POST /ad/ephemeral-token` | Mints a short-lived token so the app opens the Gemini Live WebSocket **directly** — the relay is never in the audio path. Shared by both voice features. |

The Android app never talks to Google's API with a long-lived key. `RELAY_BASE_URL` is a
`buildConfigField` in [app/build.gradle.kts](app/build.gradle.kts); cleartext HTTP to that host
must be whitelisted in
[network_security_config.xml](app/src/main/res/xml/network_security_config.xml).

## Running it

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY=...        # without it, endpoints fall back to Phase-0 stubs
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Deploying:** whatever host you deploy to must run the *current* `backend/app/main.py` with
`GEMINI_API_KEY` set. Without the key the token endpoint hands out `ws://10.0.2.2:8765`
(emulator-only loopback) and the AI endpoints return placeholder images.

### Android

```bash
./gradlew installDebug          # phone connected via adb, or an emulator
```

- JDK: the build is pinned to Temurin 21 via `org.gradle.java.home` in
  [gradle.properties](gradle.properties) — the default Homebrew JDK 23 on this machine breaks AGP
  with a cryptic one-line error.
- Emulator reaches a locally-run relay at `http://10.0.2.2:8000/`; a physical phone needs a
  reachable host (deployed relay or your Mac's LAN IP, whitelisted in the network security config).

## Model aliases

Centralised at the top of [backend/app/main.py](backend/app/main.py) and in
`WardrobeGeminiLiveSession.MODEL`. **Confirm these against the hackathon's official docs before
demo day** — a wrong alias is the most common first-hour blocker:

| Role | Current string |
|---|---|
| NB2 Lite (garment/ad frames) | `gemini-3.1-flash-lite-image` |
| Omni Flash (compositing) | `gemini-omni-flash-preview` |
| Gemini Live (voice) | `models/gemini-3.1-flash-live-preview` |

## Known issues / demo risks

See [docs/VERIFICATION-2026-07-11.md](docs/VERIFICATION-2026-07-11.md) for the full audited
list with evidence. Highlights, most severe first:

1. **App crashes ~2.5 min after opening Try-On on a physical phone** when the voice WebSocket
   can't connect: both `GeminiLiveSession` classes call `close(t)` in `onFailure`, which rethrows
   the socket exception into the flow collector and kills the process. Reproduced 2/2 on device.
2. **The deployed EC2 relay runs the old Phase-0 stub code** — `apply-garment` echoes the photo
   back, `generate-garment` returns a placeholder PNG in 0.2 s, and the token endpoint points at
   the emulator-only `ws://10.0.2.2:8765`. Redeploy `backend/app/main.py` with `GEMINI_API_KEY`.
3. The **Ad Canvas WS client still speaks the Phase-0 echo protocol** (`{"type":"audio"}`,
   `?token=` auth, no setup frame) — it cannot talk to real Gemini Live; the wardrobe WS client
   has the correct BidiGenerateContent framing.
4. Undo button never appears (state read after it's been overwritten), modify-intents duplicate
   their description, and Retry after a text-flow error restarts the mic instead of retrying.
