# Verification report — 2026-07-11

Scope: pre-demo functionality check of Try-On, Ad Canvas, and Voice Wardrobe.
Method: on-device testing (Samsung SM-A166P, Android 16, via adb) against the deployed EC2
relay, plus a full code audit. Latency targets could not be measured because the deployed relay
turned out to be running stub code (finding #2).

## Highest-risk issue

**The app hard-crashes ~2.5 minutes after opening the Try-On screen on a physical phone.**
Reproduced 2/2. The wardrobe voice session auto-starts, gets `ws://10.0.2.2:8765` from the
deployed relay (emulator-only address), the socket times out, and after the reconnect attempts
are exhausted the `close(t)` call in `WardrobeGeminiLiveSession.onFailure`
([WardrobeGeminiLiveSession.kt:63](../app/src/main/kotlin/com/orni/app/wardrobe/audio/WardrobeGeminiLiveSession.kt#L63))
rethrows `SocketTimeoutException` into the flow collector in
`WardrobeViewModel.openSessionWithRetry`, which nothing catches → process death. On stage this
kills the app mid-demo even if the presenter only uses the text flow.
`GeminiLiveSession.kt:64` (ad) has the identical bug.
Fix shape: `close()` without the throwable (emit `Disconnected` only), and/or `.catch {}` on
`session.events()` in both ViewModels.

## Shared infrastructure

| Check | Result | Evidence |
|---|---|---|
| Exactly one ephemeral-token endpoint reused by both voice features | **PASS** | `POST /ad/ephemeral-token` is the only token route; `WardrobeRepository.mintEphemeralToken` delegates to `AdRepository` |
| Exactly one mic-capture implementation | **PASS** | Single `MicAudioSource` object; only `AudioRecord` construction in the codebase |
| Mic/session cleanup on screen switch | **PASS (design)** | Both screens `stopSession()` in `DisposableEffect.onDispose`; NavHost disposes the inactive screen |
| Mic/session cleanup on app backgrounding | **FAIL** | Cleanup is tied to composable disposal only — backgrounding keeps mic + WS alive (green mic dot persists). Tie sessions to lifecycle `ON_STOP` |
| Duplicated WS logic | **WARN** | Two parallel session classes; the ad one still speaks the Phase-0 echo protocol (`{"type":"audio"}`, `?token=`, no setup frame) and cannot talk to real Gemini Live. The wardrobe one has correct BidiGenerateContent framing |

## Per-feature core loop

| Check | Result | Evidence |
|---|---|---|
| Try-On: photo → description → composited result with loading state | **BLOCKED on device / PASS at HTTP level** | Photo picker, text field, button states and loading overlays all work; app→relay calls return 200. Full loop unverifiable on device because of the crash fuse, and the deployed relay echoes the input photo back as the "result" (stub) |
| Ad Canvas: speak → frame renders → mid-sentence correction supersedes | **FAIL (deployed)** | Token mint succeeds, then WS to `10.0.2.2:8765` times out; no transcript can ever arrive. Supersede logic exists in code (debounce + generation-job cancel) but is unexercisable |
| Voice Wardrobe: speak outfit → composite → "make it blue" updates same session | **FAIL (deployed)** | Same WS failure; code path (intent merge on `modify`, session reuse) is implemented but unexercised |

## Session state isolation

| Check | Result | Evidence |
|---|---|---|
| New photo → fresh Omni Flash session | **PASS** | `onPhotoSelected` nulls `sessionId`, clears undo stack + stable intent |
| Debounced generation from previous photo can fire onto new photo | **FAIL (edge)** | `onPhotoSelected` does not cancel `intentDebounceJob`/`pendingIntent` — an 800 ms-pending intent from photo A fires against photo B ([WardrobeViewModel.kt:51-58](../app/src/main/kotlin/com/orni/app/wardrobe/WardrobeViewModel.kt#L51)) |
| Wardrobe ↔ Ad Canvas session isolation | **PASS (design)** | Separate ViewModels; screen dispose stops the outgoing session; fresh token per session start |

## Error & recovery paths

| Check | Result | Evidence |
|---|---|---|
| Network loss mid-generation → clear error + retry | **PARTIAL** | Error states + Retry buttons render, but (a) the WS failure path crashes the app instead, (b) `retry()` after a *text-flow* error restarts the voice session instead of re-running the last description (`stableIntent` is only set on the voice path) |
| Mic permission denied → graceful degradation | **PARTIAL** | Ad Canvas shows a proper `PermissionRequired` state. Wardrobe just never starts voice (no explanation shown); text path still works |
| Cached-result fallback for demo | **NOT IMPLEMENTED** | No local cache of last successful results exists anywhere |

## Feature-logic bugs found in audit

| Bug | Location | Effect |
|---|---|---|
| Undo never activates | [WardrobeViewModel.kt:247-251](../app/src/main/kotlin/com/orni/app/wardrobe/WardrobeViewModel.kt#L247) — reads `_uiState.value as? Success` *after* setting `ApplyingGarment` | `undoStack` never fills; Undo button can never appear |
| Modify-intent description duplicated | [WardrobeViewModel.kt:218-226](../app/src/main/kotlin/com/orni/app/wardrobe/WardrobeViewModel.kt#L218) — `stableIntent = intent` before building the "previous + new" description | NB2 Lite prompt becomes "jacket, blue, jacket, blue" |
| Photo sent as `image/jpeg` regardless of format | backend `apply_garment` | PNG/WebP photos mislabelled |
| Full-resolution photo → base64 JSON per call | `WardrobeTryOnScreen` picker callback (no downscale) | ~6 MB+ request bodies; slow on venue wifi; risks the 60 s read timeout |

## Deployment / demo-readiness

| Check | Result | Evidence |
|---|---|---|
| Deployed relay runs current backend | **FAIL** | EC2 responses: `apply-garment` echoes input verbatim, `generate-garment` answers in 0.23 s with a 5 KB placeholder PNG, token endpoint returns `ws://10.0.2.2:8765` — all Phase-0 stub behavior. Current `main.py` with `GEMINI_API_KEY` would behave differently on every one of these |
| Latency targets (NB2 ~4 s, composite ~10-15 s) | **UNVERIFIABLE** | Stub relay answers in 0.2 s; measure after redeploy |
| No page reloads / navigation flashes | **PASS** | All result swaps are in-place `AnimatedContent` fades |
| Model aliases confirmed against hackathon docs | **OPEN** | `gemini-2.0-*` strings carry "confirm before demo" comments; the brief specifies different aliases (`gemini-3.1-flash-lite-image`, `gemini-omni-flash-preview`). The `ephemeralTokens` REST endpoint in `main.py` is likewise unverified |
| Stubs/TODOs in critical path | **LIST** | Deployed relay (all of it); ad WS client protocol; wardrobe `MODEL` alias; no cached-fallback path |

## What was verified working

- Android → relay HTTP path on a physical phone over mobile data (200s in logcat, cleartext
  whitelist correct).
- Photo picker → full-bleed preview → enabled/disabled button states → loading overlays.
- Backend endpoints respond with well-formed JSON matching the app's DTOs (stub payloads decode
  and render).
- Build/install pipeline: `./gradlew installDebug` (JDK 21 pin) is reliable and fast (~25 s warm).
