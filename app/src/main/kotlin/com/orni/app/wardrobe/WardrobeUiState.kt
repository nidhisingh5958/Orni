package com.orni.app.wardrobe

sealed interface WardrobeUiState {
    /** No photo selected yet, or photo just changed. */
    data object Idle : WardrobeUiState

    /** Mic open, waiting for speech. */
    data object Listening : WardrobeUiState

    /** Partial intent received — showing live transcript, not yet generating. */
    data class IntentStabilizing(val transcript: String, val partialIntent: WardrobeIntent?) : WardrobeUiState

    /** NB2 Lite garment generation in flight — show shimmer. */
    data object GeneratingGarment : WardrobeUiState

    /** Omni Flash compositing in flight — show shimmer over the photo. */
    data object ApplyingGarment : WardrobeUiState

    /** Generation complete. New speech will supersede this. */
    data class Success(val resultImageBase64: String, val canUndo: Boolean = false) : WardrobeUiState

    data class Error(val message: String, val canRetry: Boolean = true) : WardrobeUiState
}
