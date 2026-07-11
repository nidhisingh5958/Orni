package com.orni.app.wardrobe

sealed interface WardrobeUiState {
    data object Idle : WardrobeUiState
    data object GeneratingGarment : WardrobeUiState
    data object ApplyingGarment : WardrobeUiState
    data class Success(val resultImageBase64: String) : WardrobeUiState
    data class Error(val message: String) : WardrobeUiState
}
