package com.orni.app.ad

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orni.app.ad.audio.GeminiLiveSession
import com.orni.app.ad.audio.MicAudioSource
import com.orni.app.ad.network.AdRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

class AdViewModel(
    private val repository: AdRepository = AdRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow<AdUiState>(AdUiState.Listening)
    val uiState: StateFlow<AdUiState> = _uiState.asStateFlow()

    private val _amplitude = MutableStateFlow(0f)
    val amplitude: StateFlow<Float> = _amplitude.asStateFlow()

    private var sessionJob: Job? = null
    private var micJob: Job? = null
    private var generationJob: Job? = null
    private var intentDebounceJob: Job? = null
    private var liveSession: GeminiLiveSession? = null

    // The last successfully generated image — needed for animate/localize chaining.
    private var lastImageBase64: String? = null
    private var stableIntent: AdIntent? = null
    private var pendingIntent: AdIntent? = null

    // ---------------------------------------------------------------------------
    // Session lifecycle
    // ---------------------------------------------------------------------------

    fun startSession() {
        if (sessionJob?.isActive == true) return
        sessionJob = viewModelScope.launch { openSessionWithRetry() }
    }

    fun stopSession() {
        sessionJob?.cancel()
        micJob?.cancel()
        generationJob?.cancel()
        intentDebounceJob?.cancel()
        liveSession?.close()
        liveSession = null
        _uiState.value = AdUiState.Listening
    }

    override fun onCleared() {
        super.onCleared()
        stopSession()
    }

    // ---------------------------------------------------------------------------
    // Session open + auto-reconnect
    // ---------------------------------------------------------------------------

    private suspend fun openSessionWithRetry(attempt: Int = 0) {
        val tokenResult = repository.mintEphemeralToken()
        tokenResult.onFailure {
            Log.e(TAG, "Token mint failed: ${it.message}")
            _uiState.value = AdUiState.Error(it.toUserMessage("Could not connect — check your network"), canRetry = true)
            return
        }
        val tokenData = tokenResult.getOrThrow()
        val session = GeminiLiveSession(tokenData.websocketUrl, tokenData.token)
        liveSession = session
        _uiState.value = AdUiState.Listening
        startMicCapture(session)

        session.events().collect { event ->
            when (event) {
                is GeminiLiveSession.SessionEvent.Transcript    -> onPartialTranscript(event.text)
                is GeminiLiveSession.SessionEvent.IntentUpdate  -> onIntentUpdate(event.intent)
                GeminiLiveSession.SessionEvent.TurnComplete     -> {
                    intentDebounceJob?.cancel()
                    pendingIntent?.let { lockAndGenerate(it) }
                }
                GeminiLiveSession.SessionEvent.Interrupted -> {
                    intentDebounceJob?.cancel()
                    pendingIntent = null
                    _uiState.value = AdUiState.Listening
                }
                GeminiLiveSession.SessionEvent.Disconnected     -> {
                    micJob?.cancel()
                    liveSession = null
                    if (attempt < 3) {
                        delay(1_000L * (attempt + 1))
                        openSessionWithRetry(attempt + 1)
                    } else {
                        _uiState.value = AdUiState.Error("Connection lost — tap to retry")
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Mic capture
    // ---------------------------------------------------------------------------

    private fun startMicCapture(session: GeminiLiveSession) {
        micJob?.cancel()
        micJob = viewModelScope.launch {
            MicAudioSource.pcmFlow().collect { chunk ->
                session.sendAudioChunk(chunk)
                _amplitude.value = chunk.rms()
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Intent handling
    // ---------------------------------------------------------------------------

    private fun onPartialTranscript(text: String) {
        // Interrupt: cancel in-flight generation immediately (supersede, don't queue)
        if (generationJob?.isActive == true) {
            generationJob?.cancel()
            Log.d(TAG, "Generation superseded by new speech")
        }
        _uiState.value = AdUiState.IntentStabilizing(text, pendingIntent)
    }

    private fun onIntentUpdate(intent: AdIntent) {
        val merged = when (intent.action) {
            AdIntent.Action.Edit -> stableIntent?.mergeWith(intent) ?: intent
            else -> intent
        }
        pendingIntent = merged
        _uiState.value = AdUiState.IntentStabilizing(merged.product.ifBlank { merged.motion ?: "" }, merged)

        intentDebounceJob?.cancel()
        intentDebounceJob = viewModelScope.launch {
            delay(INTENT_DEBOUNCE_MS)
            lockAndGenerate(merged)
        }
    }

    private fun lockAndGenerate(intent: AdIntent) {
        intentDebounceJob?.cancel()
        pendingIntent = null
        route(intent)
    }

    // ---------------------------------------------------------------------------
    // Routing — mirrors reference repo's handle_utterance action dispatch
    // ---------------------------------------------------------------------------

    private fun route(intent: AdIntent) {
        // Interrupt: cancel whatever is running
        if (intent.interrupt) generationJob?.cancel()

        when (intent.action) {
            AdIntent.Action.Create, AdIntent.Action.Edit -> triggerGenerate(intent)
            AdIntent.Action.Animate  -> triggerAnimate(intent)
            AdIntent.Action.Localize -> triggerLocalize(intent)
            AdIntent.Action.Wardrobe -> triggerGenerate(intent) // wardrobe falls through to image gen
            AdIntent.Action.Unknown  -> { /* not enough info yet */ }
        }
    }

    fun retry() {
        when {
            _uiState.value is AdUiState.Error -> startSession()
            stableIntent != null -> route(stableIntent!!)
        }
    }

    // ---------------------------------------------------------------------------
    // Create / Edit — NB2 Lite image generation
    // ---------------------------------------------------------------------------

    private fun triggerGenerate(intent: AdIntent) {
        generationJob?.cancel()
        stableIntent = intent
        _uiState.value = AdUiState.Generating(intent)

        generationJob = viewModelScope.launch {
            repository.generateAd(intent)
                .onSuccess { imageBase64 ->
                    lastImageBase64 = imageBase64
                    _uiState.value = AdUiState.Success(imageBase64, intent)
                }
                .onFailure {
                    Log.e(TAG, "Generate failed: ${it.message}")
                    _uiState.value = AdUiState.Error(it.toUserMessage("Generation failed"))
                }
        }
    }

    // ---------------------------------------------------------------------------
    // Animate — Omni Flash video + optional TTS voiceover
    // ---------------------------------------------------------------------------

    private fun triggerAnimate(intent: AdIntent) {
        val imageBase64 = lastImageBase64 ?: run {
            // No anchor frame yet — generate one first, then animate
            triggerGenerate(intent.copy(action = AdIntent.Action.Create))
            return
        }
        generationJob?.cancel()
        stableIntent = intent
        _uiState.value = AdUiState.Animating(intent)

        generationJob = viewModelScope.launch {
            repository.animateAd(imageBase64, intent)
                .onSuccess { (videoBase64, audioBase64) ->
                    // Play TTS voiceover if the backend returned one
                    // (audio playback is handled in the UI layer via the state)
                    _uiState.value = AdUiState.Success(
                        imageBase64 = imageBase64,
                        intent = intent,
                        videoBase64 = videoBase64,
                    )
                    // audioBase64 is surfaced via a separate event if needed — keep state simple
                }
                .onFailure {
                    Log.e(TAG, "Animate failed: ${it.message}")
                    _uiState.value = AdUiState.Error(it.toUserMessage("Animation failed"))
                }
        }
    }

    // ---------------------------------------------------------------------------
    // Localize — instant text-overlay swap, no image re-render
    // ---------------------------------------------------------------------------

    private fun triggerLocalize(intent: AdIntent) {
        val lang = intent.language ?: return
        val copyText = stableIntent?.copyText ?: return
        val currentSuccess = _uiState.value as? AdUiState.Success ?: return

        generationJob?.cancel()
        _uiState.value = AdUiState.Localizing(lang)

        generationJob = viewModelScope.launch {
            repository.localizeAd(copyText, lang)
                .onSuccess { translated ->
                    // KEY: only the overlay text changes — image stays identical.
                    // Mirrors the reference repo's overlay_update message.
                    _uiState.value = currentSuccess.copy(overlayText = translated)
                }
                .onFailure {
                    Log.e(TAG, "Localize failed: ${it.message}")
                    _uiState.value = AdUiState.Error(it.toUserMessage("Localization failed"))
                }
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun Throwable.toUserMessage(default: String): String {
        val serverDetail = if (this is HttpException) {
            runCatching { response()?.errorBody()?.string() }.getOrNull()
        } else null

        return when {
            serverDetail?.contains("not configured", ignoreCase = true) == true ||
                    message?.contains("503") == true ->
                "Backend Error: GEMINI_API_KEY is not set on the server."
            message?.contains("Unable to resolve host", ignoreCase = true) == true ->
                "Network error: Could not reach server. Please check your internet connection."
            message?.contains("timeout", ignoreCase = true) == true ->
                "Connection timed out. The server might be busy, please try again."
            message?.contains("Failed to connect", ignoreCase = true) == true ->
                "Could not connect to the ad service. Please try again later."
            else -> serverDetail ?: message ?: default
        }
    }

    private fun ByteArray.rms(): Float {
        if (isEmpty()) return 0f
        var sum = 0.0
        for (i in 0 until size - 1 step 2) {
            val sample = (this[i + 1].toInt() shl 8 or (this[i].toInt() and 0xFF)).toShort().toDouble()
            sum += sample * sample
        }
        return (Math.sqrt(sum / (size / 2)) / Short.MAX_VALUE).toFloat().coerceIn(0f, 1f)
    }

    companion object {
        private const val TAG = "AdViewModel"
        private const val INTENT_DEBOUNCE_MS = 800L
    }
}
