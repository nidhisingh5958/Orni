# Voice Wardrobe

Continuous voice control over the Virtual Try-On. The user speaks outfit changes ("make it blue instead", "add a leather jacket") and the result updates live without touching the screen.

## Flow

```
Mic (16 kHz PCM) → WardrobeGeminiLiveSession (BidiGenerateContent WS) → structured intent → NB2 Lite → Omni Flash → result
```

1. `WardrobeViewModel.startVoiceSession()` mints an ephemeral token via `POST /ad/ephemeral-token`.
2. `WardrobeGeminiLiveSession` opens a WebSocket to Gemini Live, sends a setup frame (model + system prompt demanding a single JSON object per turn).
3. `MicAudioSource.pcmFlow()` streams 16 kHz mono PCM chunks; each chunk is sent as a `realtimeInput.mediaChunks` frame.
4. Server frames are parsed into `SessionEvent`s:
   - `Transcript` — partial text; cancels any in-flight generation (supersede, never queue).
   - `IntentUpdate` — parsed `{action, garmentType, color, material, targetArea}`; `modify` merges onto the previous stable intent so attributes accumulate.
   - `TurnComplete` — locks the pending intent and fires generation.
   - `Interrupted` — user spoke over the model; pending intent is discarded.
   - `Disconnected` — auto-reconnect with linear back-off, 3 attempts, then error state.
5. An 800 ms debounce backs up `TurnComplete` in case the server never sends it.

## Intent merge rules

| action | behaviour |
|---|---|
| `replace` | Starts a fresh intent; previous attributes discarded |
| `add` | Starts a fresh intent for a new garment layer |
| `modify` | Merges onto `stableIntent` — only the stated attributes change |

## Session lifecycle

- `startVoiceSession()` / `stopVoiceSession()` called from `DisposableEffect.onDispose` in `WardrobeTryOnScreen`.
- Selecting a new photo calls `onPhotoSelected`, which resets `sessionId` but does **not** restart the voice session — the same WS session continues listening.

## Known issues

- App crashes ~2.5 min after opening on a physical phone: `onFailure` calls `close(t)` which rethrows the socket exception into the flow collector. Fix: call `close()` without the throwable and emit `Disconnected` only.
- `onPhotoSelected` does not cancel `intentDebounceJob` — a debounced intent from the previous photo can fire against the new one.
- Modify-intent description is duplicated in the NB2 Lite prompt ("jacket, blue, jacket, blue") because `stableIntent` is overwritten before building the combined description.
- Mic stays active when the app is backgrounded (cleanup is tied to composable disposal only).
- No explanation shown when mic permission is denied; text path still works silently.
