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
import retrofit2.HttpException

class WardrobeViewModel(
    private val repository: WardrobeRepository = WardrobeRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow<WardrobeUiState>(WardrobeUiState.Idle)
    val uiState: StateFlow<WardrobeUiState> = _uiState.asStateFlow()

    private val _selectedPhotoUri = MutableStateFlow<Uri?>(null)
    val selectedPhotoUri: StateFlow<Uri?> = _selectedPhotoUri.asStateFlow()

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

    // Intent + undo state
    private var stableIntent: WardrobeIntent? = null
    private var pendingIntent: WardrobeIntent? = null  // accumulates until TurnComplete
    // Undo stack: up to 2 previous (resultBase64, sessionId) pairs
    private val undoStack = ArrayDeque<Pair<String, String>>(2)

    // ---------------------------------------------------------------------------
    // Photo selection
    // ---------------------------------------------------------------------------

    fun onPhotoSelected(uri: Uri, photoBase64: String) {
        sessionId = null
        currentPhotoBase64 = photoBase64
        _selectedPhotoUri.value = uri
        undoStack.clear()
        stableIntent = null
        _uiState.value = if (sessionJob?.isActive == true) WardrobeUiState.Listening else WardrobeUiState.Idle
    }

    // ---------------------------------------------------------------------------
    // Text input path (unchanged)
    // ---------------------------------------------------------------------------

    fun onDescriptionSubmitted(description: String) {
        val photoBase64 = currentPhotoBase64 ?: return
        viewModelScope.launch {
            _uiState.value = WardrobeUiState.GeneratingGarment
            repository.generateGarment(description)
                .onSuccess { garmentBase64 -> applyGarment(photoBase64, garmentBase64, description) }
                .onFailure {
                    _uiState.value = WardrobeUiState.Error(it.toUserMessage("Failed to generate garment"))
                }
        }
    }

    fun retry() {
        val lastErr = _uiState.value as? WardrobeUiState.Error
        if (lastErr != null && stableIntent != null) triggerGeneration(stableIntent!!)
        else if (sessionJob?.isActive != true) startVoiceSession()
    }

    fun undo() {
        if (undoStack.isEmpty()) return
        val (prevResult, prevSession) = undoStack.removeLast()
        sessionId = prevSession
        _uiState.value = WardrobeUiState.Success(prevResult)
    }

    val canUndo: Boolean get() = undoStack.isNotEmpty()

    // ---------------------------------------------------------------------------
    // Voice session lifecycle
    // ---------------------------------------------------------------------------

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
            _uiState.value = WardrobeUiState.Error(it.toUserMessage("Could not connect — check your network"))
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
                    onPartialTranscript(event.text)

                is WardrobeGeminiLiveSession.SessionEvent.IntentUpdate ->
                    onIntentUpdate(event.intent)

                // Model finished its turn — lock the pending intent and generate.
                WardrobeGeminiLiveSession.SessionEvent.TurnComplete ->
                    pendingIntent?.let { lockAndGenerate(it) }

                // Model was interrupted (user spoke again) — discard pending intent;
                // the new speech will produce a fresh IntentUpdate.
                WardrobeGeminiLiveSession.SessionEvent.Interrupted -> {
                    intentDebounceJob?.cancel()
                    pendingIntent = null
                    _uiState.value = WardrobeUiState.Listening
                }

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
    // Intent handling — Phase 2 correction logic
    // ---------------------------------------------------------------------------

    private fun onPartialTranscript(text: String) {
        // New speech while generating → cancel in-flight generation (supersede, don't queue)
        if (generationJob?.isActive == true) {
            generationJob?.cancel()
            Log.d(TAG, "Generation superseded by new speech")
        }
        _uiState.value = WardrobeUiState.IntentStabilizing(text, pendingIntent)
    }

    private fun onIntentUpdate(intent: WardrobeIntent) {
        // Merge with stable intent for modify actions so attributes accumulate.
        val merged = when (intent.action) {
            WardrobeIntent.Action.Modify -> stableIntent?.mergeWith(intent) ?: intent
            WardrobeIntent.Action.Add, WardrobeIntent.Action.Replace -> intent
        }
        pendingIntent = merged
        _uiState.value = WardrobeUiState.IntentStabilizing(merged.toDescription(), merged)

        // Debounce as a safety net — fires if TurnComplete never arrives (e.g. echo server).
        intentDebounceJob?.cancel()
        intentDebounceJob = viewModelScope.launch {
            delay(INTENT_DEBOUNCE_MS)
            lockAndGenerate(merged)
        }
    }

    private fun lockAndGenerate(intent: WardrobeIntent) {
        intentDebounceJob?.cancel()
        pendingIntent = null
        triggerGeneration(intent)
    }

    private fun triggerGeneration(intent: WardrobeIntent) {
        val photoBase64 = currentPhotoBase64 ?: return
        generationJob?.cancel()
        stableIntent = intent
        _uiState.value = WardrobeUiState.GeneratingGarment

        // For modify, prepend the existing description so NB2 Lite has full context.
        val description = if (intent.action == WardrobeIntent.Action.Modify && stableIntent != null) {
            "${stableIntent!!.toDescription()}, ${intent.toDescription()}"
        } else {
            intent.toDescription()
        }

        generationJob = viewModelScope.launch {
            repository.generateGarment(description)
                .onSuccess { garmentBase64 -> applyGarment(photoBase64, garmentBase64, description) }
                .onFailure {
                    Log.e(TAG, "Generation failed: ${it.message}")
                    _uiState.value = WardrobeUiState.Error(it.toUserMessage("Generation failed"))
                }
        }
    }

    private suspend fun applyGarment(photoBase64: String, garmentImageBase64: String, instruction: String) {
        val previousState = _uiState.value
        _uiState.value = WardrobeUiState.ApplyingGarment
        repository.applyGarment(
            photoBase64 = photoBase64,
            garmentImageBase64 = garmentImageBase64,
            sessionId = sessionId,
            instruction = instruction,
        ).onSuccess { (resultImageBase64, newSessionId) ->
            // Push current result onto undo stack before replacing it
            if (previousState is WardrobeUiState.Success && sessionId != null) {
                if (undoStack.size >= 2) undoStack.removeFirst()
                undoStack.addLast(previousState.resultImageBase64 to sessionId!!)
            }
            sessionId = newSessionId
            _uiState.value = WardrobeUiState.Success(resultImageBase64, canUndo = undoStack.isNotEmpty())
        }.onFailure {
            Log.e(TAG, "Apply failed: ${it.message}")
            _uiState.value = WardrobeUiState.Error(it.toUserMessage("Failed to apply garment"))
        }
    }

    private fun Throwable.toUserMessage(default: String): String {
        val serverDetail = if (this is retrofit2.HttpException) {
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
                "Could not connect to the wardrobe service. Please try again later."
            else -> serverDetail ?: message ?: default
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
