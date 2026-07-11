package com.orni.app.wardrobe

import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orni.app.ad.audio.MicAudioSource
import com.orni.app.wardrobe.audio.WardrobeGeminiLiveSession
import com.orni.app.wardrobe.network.WardrobeRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class WardrobeViewModel(
    private val repository: WardrobeRepository = WardrobeRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow<WardrobeUiState>(WardrobeUiState.Idle)
    val uiState: StateFlow<WardrobeUiState> = _uiState.asStateFlow()

    private val _selectedPhotoUri = MutableStateFlow<Uri?>(null)
    val selectedPhotoUri: StateFlow<Uri?> = _selectedPhotoUri.asStateFlow()

    // Waveform amplitude for the listening indicator (0f–1f)
    private val _amplitude = MutableStateFlow(0f)
    val amplitude: StateFlow<Float> = _amplitude.asStateFlow()

    // Omni Flash session — keyed to the current photo, persisted across voice turns.
    private var sessionId: String? = null
    private var currentPhotoBase64: String? = null

    // Voice session state
    private var sessionJob: Job? = null
    private var micJob: Job? = null
    private var generationJob: Job? = null
    private var intentDebounceJob: Job? = null
    private var liveSession: WardrobeGeminiLiveSession? = null
    private var stableIntent: WardrobeIntent? = null

    // ---------------------------------------------------------------------------
    // Photo selection
    // ---------------------------------------------------------------------------

    fun onPhotoSelected(uri: Uri, photoBase64: String) {
        // New photo = new Omni Flash session; don't bleed edits across photos.
        sessionId = null
        currentPhotoBase64 = photoBase64
        _selectedPhotoUri.value = uri
        _uiState.value = if (sessionJob?.isActive == true) WardrobeUiState.Listening else WardrobeUiState.Idle
    }

    // ---------------------------------------------------------------------------
    // Text input path (existing flow — unchanged)
    // ---------------------------------------------------------------------------

    fun onDescriptionSubmitted(description: String) {
        val photoBase64 = currentPhotoBase64 ?: return
        viewModelScope.launch {
            _uiState.value = WardrobeUiState.GeneratingGarment
            repository.generateGarment(description)
                .onSuccess { garmentBase64 -> applyGarment(photoBase64, garmentBase64, description) }
                .onFailure { _uiState.value = WardrobeUiState.Error(it.message ?: "Failed to generate garment") }
        }
    }

    fun retry() {
        stableIntent?.let { triggerGeneration(it) } ?: startVoiceSession()
    }

    // ---------------------------------------------------------------------------
    // Voice session lifecycle
    // ---------------------------------------------------------------------------

    /** Call once RECORD_AUDIO permission is confirmed. */
    fun startVoiceSession() {
        if (sessionJob?.isActive == true) return
        sessionJob = viewModelScope.launch { openSessionWithRetry() }
    }

    fun stopVoiceSession() {
        sessionJob?.cancel()
        micJob?.cancel()
        generationJob?.cancel()
        intentDebounceJob?.cancel()
        liveSession?.close()
        liveSession = null
        _uiState.value = WardrobeUiState.Idle
    }

    override fun onCleared() {
        super.onCleared()
        stopVoiceSession()
    }

    // ---------------------------------------------------------------------------
    // Session open + auto-reconnect
    // ---------------------------------------------------------------------------

    private suspend fun openSessionWithRetry(attempt: Int = 0) {
        val tokenResult = repository.mintEphemeralToken()
        tokenResult.onFailure {
            Log.e(TAG, "Token mint failed: ${it.message}")
            _uiState.value = WardrobeUiState.Error("Could not connect — check your network")
            return
        }
        val tokenData = tokenResult.getOrThrow()

        val session = WardrobeGeminiLiveSession(tokenData.websocketUrl, tokenData.token)
        liveSession = session
        _uiState.value = WardrobeUiState.Listening
        startMicCapture(session)

        session.events().collect { event ->
            when (event) {
                is WardrobeGeminiLiveSession.SessionEvent.Transcript ->
                    onTranscript(event.text, intent = null)
                is WardrobeGeminiLiveSession.SessionEvent.IntentUpdate ->
                    onTranscript(event.intent.toDescription(), intent = event.intent)
                WardrobeGeminiLiveSession.SessionEvent.Disconnected -> {
                    micJob?.cancel()
                    liveSession = null
                    if (attempt < 3) {
                        delay(1_000L * (attempt + 1))
                        openSessionWithRetry(attempt + 1)
                    } else {
                        _uiState.value = WardrobeUiState.Error("Connection lost — tap to retry")
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Mic capture
    // ---------------------------------------------------------------------------

    private fun startMicCapture(session: WardrobeGeminiLiveSession) {
        micJob?.cancel()
        micJob = viewModelScope.launch {
            MicAudioSource.pcmFlow().collect { chunk ->
                session.sendAudioChunk(chunk)
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
     * Interruption rule: new speech cancels the debounce (and any in-flight
     * generation) — the latest intent always supersedes, never queues.
     */
    private fun onTranscript(transcript: String, intent: WardrobeIntent?) {
        val merged = intent?.let { newer ->
            stableIntent?.mergeWith(newer) ?: newer
        }
        _uiState.value = WardrobeUiState.IntentStabilizing(transcript, merged)

        intentDebounceJob?.cancel()
        if (merged != null) {
            intentDebounceJob = viewModelScope.launch {
                delay(INTENT_DEBOUNCE_MS)
                triggerGeneration(merged)
            }
        }
    }

    private fun triggerGeneration(intent: WardrobeIntent) {
        val photoBase64 = currentPhotoBase64 ?: return
        // Cancel any in-flight generation — the new intent supersedes it.
        generationJob?.cancel()
        stableIntent = intent
        _uiState.value = WardrobeUiState.GeneratingGarment

        generationJob = viewModelScope.launch {
            repository.generateGarment(intent.toDescription())
                .onSuccess { garmentBase64 -> applyGarment(photoBase64, garmentBase64, intent.toDescription()) }
                .onFailure {
                    Log.e(TAG, "Generation failed: ${it.message}")
                    _uiState.value = WardrobeUiState.Error(it.message ?: "Generation failed")
                }
        }
    }

    private suspend fun applyGarment(photoBase64: String, garmentImageBase64: String, instruction: String) {
        _uiState.value = WardrobeUiState.ApplyingGarment
        repository.applyGarment(
            photoBase64 = photoBase64,
            garmentImageBase64 = garmentImageBase64,
            sessionId = sessionId,
            instruction = instruction,
        ).onSuccess { (resultImageBase64, newSessionId) ->
            sessionId = newSessionId
            _uiState.value = WardrobeUiState.Success(resultImageBase64)
        }.onFailure {
            _uiState.value = WardrobeUiState.Error(it.message ?: "Failed to apply garment")
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

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
        private const val TAG = "WardrobeViewModel"
        private const val INTENT_DEBOUNCE_MS = 800L
    }
}
