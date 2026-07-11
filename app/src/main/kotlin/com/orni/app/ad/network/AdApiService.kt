package com.orni.app.ad.network

import com.orni.app.ad.network.dto.AnimateAdRequest
import com.orni.app.ad.network.dto.AnimateAdResponse
import com.orni.app.ad.network.dto.EphemeralTokenResponse
import com.orni.app.ad.network.dto.GenerateAdRequest
import com.orni.app.ad.network.dto.GenerateAdResponse
import com.orni.app.ad.network.dto.LocalizeAdRequest
import com.orni.app.ad.network.dto.LocalizeAdResponse
import retrofit2.http.Body
import retrofit2.http.POST

interface AdApiService {

    @POST("ad/ephemeral-token")
    suspend fun mintEphemeralToken(): EphemeralTokenResponse

    /** NB2 Lite: voice brief → 1K ad frame. */
    @POST("ad/generate")
    suspend fun generateAd(@Body request: GenerateAdRequest): GenerateAdResponse

    /** Omni Flash: anchor frame + motion brief → video clip + optional TTS audio. */
    @POST("ad/animate")
    suspend fun animateAd(@Body request: AnimateAdRequest): AnimateAdResponse

    /** Instant copy translation — no image re-render. */
    @POST("ad/localize")
    suspend fun localizeAd(@Body request: LocalizeAdRequest): LocalizeAdResponse
}
