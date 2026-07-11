package com.orni.app.ad.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class EphemeralTokenResponse(
    val token: String,
    val expiresAt: Long,
    val websocketUrl: String,
)

@Serializable
data class GenerateAdRequest(
    val product: String,
    val background: String? = null,
    val copyText: String? = null,
    val style: String? = null,
    val aspect: String = "9:16",      // "9:16" | "1:1" | "16:9"
    val energy: String = "medium",    // "low" | "medium" | "high"
)

@Serializable
data class GenerateAdResponse(
    val imageBase64: String,
)

@Serializable
data class AnimateAdRequest(
    val imageBase64: String,          // anchor frame from the previous generate call
    val motion: String,               // motion brief / voiceover cue
    val energy: String = "medium",
)

@Serializable
data class AnimateAdResponse(
    val videoBase64: String,
    val audioBase64: String? = null,  // TTS voiceover, null in mock mode
)

@Serializable
data class LocalizeAdRequest(
    val copyText: String,
    val language: String,             // ISO code: "hi" | "kn" | "ta"
)

@Serializable
data class LocalizeAdResponse(
    val translatedText: String,
)
