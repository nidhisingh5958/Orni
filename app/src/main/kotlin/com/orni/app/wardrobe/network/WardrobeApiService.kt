package com.orni.app.wardrobe.network

import com.orni.app.wardrobe.network.dto.ApplyGarmentRequest
import com.orni.app.wardrobe.network.dto.ApplyGarmentResponse
import com.orni.app.wardrobe.network.dto.GenerateGarmentRequest
import com.orni.app.wardrobe.network.dto.GenerateGarmentResponse
import retrofit2.http.Body
import retrofit2.http.POST

/** Talks only to our backend relay - never directly to Google's API with a client-side key. */
interface WardrobeApiService {

    @POST("generate-garment")
    suspend fun generateGarment(@Body request: GenerateGarmentRequest): GenerateGarmentResponse

    @POST("apply-garment")
    suspend fun applyGarment(@Body request: ApplyGarmentRequest): ApplyGarmentResponse
}
