# Audio Ad Canvas

User speaks an ad brief continuously; a typographically-correct 1024×1024 ad frame renders live and updates mid-sentence.

## Flow

```
Mic (16 kHz PCM) → GeminiLiveSession (WS) → AdIntent → POST /ad/generate → ad frame image
```

1. `AdViewModel.startSession()` mints an ephemeral token via `POST /ad/ephemeral-token`.
2. `GeminiLiveSession` opens a WebSocket and streams audio chunks.
3. Server responses are parsed into `Transcript` or `IntentUpdate` events.
4. An 800 ms debounce fires `triggerGeneration(intent)` after speech settles.
5. If new speech arrives while a generation is in flight, the job is cancelled and superseded — never queued.
6. `POST /ad/generate` → NB2 Lite returns a 1024×1024 ad frame.

## Intent fields

| field | description |
|---|---|
| `product` | What the ad is for (required to be actionable) |
| `background` | Background description |
| `copyText` | On-image text / headline |
| `style` | Visual style / vibe |

Partial intents are merged via `AdIntent.mergeWith` so each new speech turn only needs to state what changed.

## UI states

`Listening → IntentStabilizing → Generating → Success | Error`

`PermissionRequired` is shown if `RECORD_AUDIO` is not granted.

## Known issues

- `GeminiLiveSession` still speaks the Phase-0 echo protocol (`{"type":"audio"}`, `?token=` auth, no setup frame) — it cannot talk to real Gemini Live. The wardrobe WS client has the correct BidiGenerateContent framing and should be used as the reference for upgrading this class.
- App crashes if the WS fails: `onFailure` calls `close(t)`, rethrowing the exception into the flow collector. Same fix as Voice Wardrobe: emit `Disconnected` and call `close()` without the throwable.
- Mic stays active when the app is backgrounded.
- Intent extraction relies on regex; replace with a structured JSON system prompt (same approach as `WardrobeGeminiLiveSession`) once the WS protocol is upgraded.
