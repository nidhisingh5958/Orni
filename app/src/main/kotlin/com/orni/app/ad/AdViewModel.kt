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

class AdViewModel(
    private val repository: AdRepository = AdRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow<AdUiState>(AdUiState.Listening)
    val uiState: StateFlow<AdUiState> = _uiState.asStateFlow()

    // Waveform amplitude for the listening indicator (0f–1f)
    private val _amplitude = MutableStateFlow(0f)
    val amplitude: StateFlow<Float> = _amplitude.asStateFlow()

    private var sessionJob: Job? = null
    private var micJob: Job? = null
    private var generationJob: Job? = null
    private var intentDebounceJob: Job? = null

    private var liveSession: GeminiLiveSession? = null
    private var stableIntent: AdIntent? = null

    // ---------------------------------------------------------------------------
    // Session lifecycle
    // ---------------------------------------------------------------------------

    /** Call once the RECORD_AUDIO permission is confirmed. */
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
        tokenResult.onFailure { err ->
            Log.e(TAG, "Token mint failed: ${err.message}")
            _uiState.value = AdUiState.Error("Could not connect — check your network", canRetry = true)
            return
        }
        val tokenData = tokenResult.getOrThrow()

        val session = GeminiLiveSession(tokenData.websocketUrl, tokenData.token)
        liveSession = session

        _uiState.value = AdUiState.Listening
        startMicCapture(session)

        session.events().collect { event ->
            when (event) {
                is GeminiLiveSession.SessionEvent.Transcript -> onTranscript(event.text, intent = null)
                is GeminiLiveSession.SessionEvent.IntentUpdate -> onTranscript(
                    transcript = event.intent.product,
                    intent = event.intent,
                )
                GeminiLiveSession.SessionEvent.Disconnected -> {
                    micJob?.cancel()
                    liveSession = null
                    // Auto-reconnect with exponential back-off, cap at 3 attempts
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
                // Derive a rough amplitude from the RMS of the chunk for the waveform UI
                _amplitude.value = chunk.rms()
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Intent handling + interruption logic
    // ---------------------------------------------------------------------------

    /**
     * Called on every transcript/intent update from the WebSocket.
     *
     * Interruption rule: if a generation is in flight (or just completed) and
     * new speech arrives, cancel the in-flight job and supersede with the merged
     * intent — never queue behind it.
     */
    private fun onTranscript(transcript: String, intent: AdIntent?) {
        val merged = if (intent != null) {
            val existing = stableIntent
            if (existing != null) existing.mergeWith(intent) else intent
        } else null

        _uiState.value = AdUiState.IntentStabilizing(transcript, merged)

        // Debounce: wait 800 ms of silence before treating intent as stable.
        // If new speech arrives before the debounce fires, the old debounce is
        // cancelled — this is the interruption mechanism for mid-sentence corrections.
        intentDebounceJob?.cancel()
        if (merged != null && merged.isActionable) {
            intentDebounceJob = viewModelScope.launch {
                delay(INTENT_DEBOUNCE_MS)
                triggerGeneration(merged)
            }
        }
    }

    private fun triggerGeneration(intent: AdIntent) {
        // Cancel any in-flight generation — the new intent supersedes it.
        generationJob?.cancel()
        stableIntent = intent
        _uiState.value = AdUiState.Generating(intent)

        generationJob = viewModelScope.launch {
            repository.generateAd(intent)
                .onSuccess { imageBase64 ->
                    _uiState.value = AdUiState.Success(imageBase64, intent)
                }
                .onFailure { err ->
                    Log.e(TAG, "Generation failed: ${err.message}")
                    _uiState.value = AdUiState.Error(err.message ?: "Generation failed")
                }
        }
    }

    fun retry() {
        val current = _uiState.value
        when {
            current is AdUiState.Error -> startSession()
            stableIntent != null -> triggerGeneration(stableIntent!!)
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /** Root-mean-square amplitude of a 16-bit PCM byte array, normalised to 0–1. */
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
