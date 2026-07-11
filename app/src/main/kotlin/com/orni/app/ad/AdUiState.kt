package com.orni.app.ad

sealed interface AdUiState {
    data object PermissionRequired : AdUiState
    data object Listening : AdUiState

    /** Partial intent received — showing live transcript, not yet generating. */
    data class IntentStabilizing(val transcript: String, val partialIntent: AdIntent?) : AdUiState

    /** NB2 Lite image generation in flight. */
    data class Generating(val intent: AdIntent) : AdUiState

    /** Omni Flash video animation in flight. */
    data class Animating(val intent: AdIntent) : AdUiState

    /** Instant text-overlay translation in flight (no re-render). */
    data class Localizing(val language: String) : AdUiState

    /**
     * Generation complete.
     * [overlayText] is the live-swappable copy (localize action updates this only,
     * no image re-render needed — mirrors the reference repo's overlay_update message).
     */
    data class Success(
        val imageBase64: String,
        val intent: AdIntent,
        val overlayText: String? = null,   // null = use intent.copyText
        val videoBase64: String? = null,   // non-null after Animate action
    ) : AdUiState

    data class Error(val message: String, val canRetry: Boolean = true) : AdUiState
}
