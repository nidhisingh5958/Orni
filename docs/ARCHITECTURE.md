# Architecture

## Why two models, in this order

Every feature is the same pipeline with a different target asset:

```
Gemini Live (voice) → structured intent → NB2 Lite (precise layer) → Omni Flash (stateful composite) → UI
```

- **NB2 Lite first.** It is fast and precise for static generation — garments, logos, on-image
  text. Typography rendered by a compositing/motion model comes out garbled, so text never goes
  to Omni Flash.
- **Omni Flash second.** It is the only model with a stateful multi-turn session, so it owns
  compositing and iterative edits. The relay stores the full turn history per `sessionId`
  (in-process dict for the hackathon; Redis in production) so the client only round-trips the id.

## Session rules (highest-risk invariants)

1. **One Omni Flash session per photo.** `WardrobeViewModel.onPhotoSelected` nulls `sessionId`,
   clears the undo stack and stable intent. A new photo must never inherit the old session.
2. **Follow-up edits reuse the session.** `applyGarment(sessionId=...)` sends an incremental
   turn; the relay appends to the stored history.
3. **One ephemeral-token endpoint, one mic.** Both voice features mint tokens via
   `POST /ad/ephemeral-token` (`WardrobeRepository` delegates to `AdRepository`) and capture
   audio via the single `MicAudioSource` object (16 kHz / mono / 16-bit PCM `Flow<ByteArray>`,
   cold — collection starts capture, cancellation stops it).
4. **The relay is never in the audio path.** It mints the token; the app opens the WebSocket to
   Gemini Live directly.

## Voice → intent → generation loop (wardrobe)

`WardrobeGeminiLiveSession` implements the BidiGenerateContent wire protocol:
setup frame on open (model + system prompt demanding a single JSON object per turn), audio as
`realtimeInput.mediaChunks`, server frames parsed into:

- `Transcript` — partial text; if a generation is in flight it is **cancelled and superseded**,
  never queued.
- `IntentUpdate` — parsed `{action, garmentType, color, material, targetArea}`; `modify` merges
  onto the previous stable intent so attributes accumulate; `replace`/`add` start clean.
- `TurnComplete` — locks the pending intent and fires generation.
- `Interrupted` — user spoke over the model; pending intent is discarded.
- `Disconnected` — auto-reconnect with linear back-off, 3 attempts, then error state.

An 800 ms debounce backs up `TurnComplete` in case the server never sends it (Phase-0 echo
server). The debounce is also the mid-sentence correction mechanism: new speech cancels the
pending debounce.

## UI state machines

Both features drive Compose UI off a single `StateFlow<UiState>`:

- Wardrobe: `Idle → Listening → IntentStabilizing → GeneratingGarment → ApplyingGarment →
  Success | Error` (text path skips the first three).
- Ad Canvas: `PermissionRequired | Listening → IntentStabilizing → Generating → Success | Error`.

All transitions are in-place `AnimatedContent` swaps — no navigation, no reload flash. `Success`
holds the raw base64 so the image survives recomposition; undo keeps up to 2 previous
`(resultImage, sessionId)` pairs so "undo" also rewinds the Omni Flash session pointer.

## Security

- The Gemini API key exists only in the relay's environment (`GEMINI_API_KEY`). Client-side keys
  in an APK are trivially extractable — never embed one.
- Ephemeral tokens are scoped to a single Live session with a 10-minute TTL.
- Cleartext HTTP is whitelisted per-host in `network_security_config.xml` for the hackathon
  relay; move to HTTPS before anything real.
