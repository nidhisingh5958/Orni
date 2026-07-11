package com.orni.app.ad.network

import com.orni.app.ad.network.dto.EphemeralTokenResponse
import com.orni.app.ad.network.dto.GenerateAdRequest
import com.orni.app.ad.network.dto.GenerateAdResponse
import retrofit2.http.Body
import retrofit2.http.POST

/** Talks only to our backend relay — never directly to Google's API. */
interface AdApiService {

    /** Relay mints a short-lived token; app uses it to open a direct WS to Gemini Live. */
    @POST("ad/ephemeral-token")
    suspend fun mintEphemeralToken(): EphemeralTokenResponse

    /** NB2 Lite image generation, proxied through the relay. */
    @POST("ad/generate")
    suspend fun generateAd(@Body request: GenerateAdRequest): GenerateAdResponse
}
