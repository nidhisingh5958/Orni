package com.orni.app.wardrobe.network.dto

import kotlinx.serialization.Serializable

/**
 * NB2 Lite generates the clothing/garment layer first, with any text or logo
 * rendered precisely. This request never reaches Omni Flash directly.
 */
@Serializable
data class GenerateGarmentRequest(
    val description: String,
)

@Serializable
data class GenerateGarmentResponse(
    val garmentImageBase64: String,
)

/**
 * Omni Flash composites the garment onto the photo and owns style/motion
 * realism. [sessionId] threads follow-up edits through the same Interactions
 * API session; omit it to start a fresh session for a new photo.
 */
@Serializable
data class ApplyGarmentRequest(
    val photoBase64: String,
    val garmentImageBase64: String,
    val sessionId: String? = null,
    val instruction: String? = null,
)

@Serializable
data class ApplyGarmentResponse(
    val resultImageBase64: String,
    val sessionId: String,
)
