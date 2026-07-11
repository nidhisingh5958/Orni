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
)

@Serializable
data class GenerateAdResponse(
    val imageBase64: String,
)
