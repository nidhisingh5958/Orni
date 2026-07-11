package com.orni.app.ad.network

import com.orni.app.ad.AdIntent
import com.orni.app.ad.network.dto.EphemeralTokenResponse
import com.orni.app.ad.network.dto.GenerateAdRequest
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
            ),
        ).imageBase64
    }
}
