package com.orni.app.wardrobe.network

import com.orni.app.wardrobe.network.dto.ApplyGarmentRequest
import com.orni.app.wardrobe.network.dto.GenerateGarmentRequest

class WardrobeRepository(
    private val api: WardrobeApiService = NetworkModule.wardrobeApi,
) {

    suspend fun generateGarment(description: String): Result<String> = runCatching {
        api.generateGarment(GenerateGarmentRequest(description = description)).garmentImageBase64
    }

    suspend fun applyGarment(
        photoBase64: String,
        garmentImageBase64: String,
        sessionId: String?,
        instruction: String? = null,
    ): Result<Pair<String, String>> = runCatching {
        val response = api.applyGarment(
            ApplyGarmentRequest(
                photoBase64 = photoBase64,
                garmentImageBase64 = garmentImageBase64,
                sessionId = sessionId,
                instruction = instruction,
            ),
        )
        response.resultImageBase64 to response.sessionId
    }
}
