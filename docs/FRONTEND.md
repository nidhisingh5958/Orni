# Frontend (Android)

Native Kotlin / Jetpack Compose app. Package: `com.orni.app`.

## Module layout

```
app/src/main/kotlin/com/orni/app/
  MainActivity.kt                        Bottom-nav shell: Try-On | Ad Canvas
  wardrobe/                              Virtual Try-On + Voice Wardrobe
    WardrobeViewModel.kt                 State machine, voice session, undo stack
    WardrobeUiState.kt                   Idle/Listening/IntentStabilizing/GeneratingGarment/ApplyingGarment/Success/Error
    WardrobeIntent.kt                    {action, garmentType, color, material, targetArea}
    audio/WardrobeGeminiLiveSession.kt   Gemini Live WS — BidiGenerateContent protocol (correct)
    network/WardrobeRepository.kt        generateGarment, applyGarment, mintEphemeralToken
    network/WardrobeApiService.kt        Retrofit interface
    network/NetworkModule.kt             Shared OkHttpClient + Retrofit instance
    network/dto/GarmentDtos.kt           Request/response data classes
    ui/WardrobeTryOnScreen.kt            Full-bleed preview, picker, text input, waveform, undo
    util/ImageEncoding.kt                Bitmap → base64 helper
  ad/                                    Audio Ad Canvas
    AdViewModel.kt                       Debounced intent → generation, supersede-on-interrupt
    AdUiState.kt                         PermissionRequired/Listening/IntentStabilizing/Generating/Success/Error
    AdIntent.kt                          {product, background, copyText, style}
    audio/GeminiLiveSession.kt           WS session — Phase-0 echo protocol (needs upgrade)
    audio/MicAudioSource.kt              Single mic implementation — reuse this, never duplicate
    network/AdRepository.kt             mintEphemeralToken, generateAd
    network/AdApiService.kt             Retrofit interface
    network/dto/AdDtos.kt               Request/response data classes
    ui/AudioAdCanvasScreen.kt           Live canvas, waveform, transcript strip
```

## Shared infrastructure

### MicAudioSource
Single `AudioRecord`-based implementation at `ad/audio/MicAudioSource.kt`. Emits a cold `Flow<ByteArray>` of 16 kHz mono 16-bit PCM chunks. Collection starts capture; cancellation stops it. Both voice features use this — never create a second `AudioRecord`.

### NetworkModule
Shared `OkHttpClient` and `Retrofit` instance at `wardrobe/network/NetworkModule.kt`. `RELAY_BASE_URL` is injected via `BuildConfig` (set in `app/build.gradle.kts`).

### Ephemeral token
Both voice features mint tokens via `POST /ad/ephemeral-token`. `WardrobeRepository.mintEphemeralToken` delegates to `AdRepository` — there is exactly one token endpoint and one code path.

## Network security

Cleartext HTTP is whitelisted per-host in `app/src/main/res/xml/network_security_config.xml`:
- `10.0.2.2` — Android emulator loopback to host machine
- `ec2-3-110-82-68.ap-south-1.compute.amazonaws.com` — deployed relay

Move to HTTPS and remove this config before any real release.

## Build

```bash
./gradlew installDebug   # phone connected via adb, or emulator
```

- JDK: pinned to Temurin 21 via `org.gradle.java.home` in `gradle.properties`. The default Homebrew JDK 23 breaks AGP.
- Emulator reaches the relay at `http://10.0.2.2:8000/`.
- Physical phone needs a reachable host (deployed relay or Mac LAN IP whitelisted in the network security config).

## UI patterns

- All screens are driven by a single `StateFlow<UiState>` from the ViewModel.
- State transitions render via `AnimatedContent` — no navigation, no reload flash.
- `Success` holds the raw base64 so the image survives recomposition.
- Both screens call `stopSession()` in `DisposableEffect.onDispose`; NavHost disposes the inactive screen automatically.

## Known issues

- Both WS `onFailure` callbacks call `close(t)`, rethrowing the socket exception into the flow collector → process death ~2.5 min after opening Try-On on a physical phone. Fix: call `close()` without the throwable.
- `GeminiLiveSession` (Ad Canvas) still speaks the Phase-0 echo protocol and cannot connect to real Gemini Live. Use `WardrobeGeminiLiveSession` as the reference implementation.
- Mic and WS session stay alive when the app is backgrounded. Tie `stopSession()` to `Lifecycle.ON_STOP`.
- Retry after a text-flow error restarts the voice session instead of re-running the last description (`stableIntent` is only set on the voice path).
