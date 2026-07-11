package com.orni.app.ad

sealed interface AdUiState {
    /** Mic permission not yet granted. */
    data object PermissionRequired : AdUiState

    /** Mic is open, listening, no stable intent yet. */
    data object Listening : AdUiState

    /** Partial intent received — showing live transcript, not yet generating. */
    data class IntentStabilizing(val transcript: String, val partialIntent: AdIntent?) : AdUiState

    /** Intent locked — NB2 Lite call in flight, showing shimmer. */
    data class Generating(val intent: AdIntent) : AdUiState

    /** Generation complete. New speech will supersede this. */
    data class Success(val imageBase64: String, val intent: AdIntent) : AdUiState

    /** Recoverable error — auto-reconnect or user retry. */
    data class Error(val message: String, val canRetry: Boolean = true) : AdUiState
}
