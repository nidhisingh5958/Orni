package com.orni.app.ad.network

import com.orni.app.ad.AdIntent
import com.orni.app.ad.network.dto.AnimateAdRequest
import com.orni.app.ad.network.dto.EphemeralTokenResponse
import com.orni.app.ad.network.dto.GenerateAdRequest
import com.orni.app.ad.network.dto.LocalizeAdRequest
import com.orni.app.wardrobe.network.NetworkModule

class AdRepository(
    private val api: AdApiService = NetworkModule.adApi,
) {

    suspend fun mintEphemeralToken(): Result<EphemeralTokenResponse> = runCatching {
        api.mintEphemeralToken()
    }

    suspend fun generateAd(intent: AdIntent): Result<String> = runCatching {
        api.generateAd(
            GenerateAdRequest(
                product = intent.product,
                background = intent.background,
                copyText = intent.copyText,
                style = intent.style,
                aspect = intent.aspect.ratio,
                energy = intent.energy.name.lowercase(),
            ),
        ).imageBase64
    }

    /** Returns Pair(videoBase64, audioBase64?) */
    suspend fun animateAd(imageBase64: String, intent: AdIntent): Result<Pair<String, String?>> = runCatching {
        val resp = api.animateAd(
            AnimateAdRequest(
                imageBase64 = imageBase64,
                motion = intent.motion ?: "slow cinematic push-in",
                energy = intent.energy.name.lowercase(),
            ),
        )
        resp.videoBase64 to resp.audioBase64
    }

    suspend fun localizeAd(copyText: String, language: String): Result<String> = runCatching {
        api.localizeAd(LocalizeAdRequest(copyText = copyText, language = language)).translatedText
    }
}
