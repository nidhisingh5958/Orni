package com.orni.app.wardrobe.audio

import android.util.Base64
import android.util.Log
import com.orni.app.ad.audio.MicAudioSource
import com.orni.app.wardrobe.WardrobeIntent
import com.orni.app.wardrobe.network.NetworkModule
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * Gemini Live WebSocket session scoped to the wardrobe feature.
 *
 * Reuses [MicAudioSource] and [NetworkModule.okHttpClient] from the ad feature.
 * Only the intent parser differs — it extracts garment fields instead of ad fields.
 *
 * Phase 0: websocketUrl points at a local echo server; transcript events prove
 * the audio path before garment logic is wired in.
 * Phase 1: swap parseServerMessage to match the real Gemini Live wire protocol.
 */
class WardrobeGeminiLiveSession(
    private val websocketUrl: String,
    private val token: String,
) {
    sealed interface SessionEvent {
        data class Transcript(val text: String) : SessionEvent
        data class IntentUpdate(val intent: WardrobeIntent) : SessionEvent
        data object Disconnected : SessionEvent
    }

    private var socket: WebSocket? = null

    fun events(): Flow<SessionEvent> = callbackFlow {
        val request = Request.Builder()
            .url("$websocketUrl?token=$token")
            .build()

        val listener = object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                socket = ws
                Log.d(TAG, "Wardrobe Gemini Live WS opened")
                // Phase 1: send session setup message (model, system prompt requesting JSON intent output)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                parseServerMessage(text)?.let { trySend(it) }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WS failure: ${t.message}")
                trySend(SessionEvent.Disconnected)
                close(t)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WS closed: $code $reason")
                trySend(SessionEvent.Disconnected)
                close()
            }
        }

        socket = NetworkModule.okHttpClient.newWebSocket(request, listener)
        awaitClose { socket?.close(1000, "collector cancelled") }
    }

    fun sendAudioChunk(pcm: ByteArray) {
        val encoded = Base64.encodeToString(pcm, Base64.NO_WRAP)
        // Phase 1: replace with exact Gemini Live realtime_input schema.
        val msg = JSONObject().apply {
            put("type", "audio")
            put("data", encoded)
            put("mimeType", "audio/pcm;rate=${MicAudioSource.SAMPLE_RATE}")
        }.toString()
        socket?.send(msg)
    }

    fun close() {
        socket?.close(1000, "session ended")
        socket = null
    }

    // ---------------------------------------------------------------------------
    // Intent parsing
    // ---------------------------------------------------------------------------

    private fun parseServerMessage(text: String): SessionEvent? = runCatching {
        val json = JSONObject(text)

        // Dual-path: Phase 0 echo server uses "transcript" key;
        // Phase 1 Gemini Live uses serverContent.modelTurn.parts[].text
        val transcript = json.optString("transcript").takeIf { it.isNotBlank() }
            ?: json.optJSONObject("serverContent")
                ?.optJSONObject("modelTurn")
                ?.optJSONArray("parts")
                ?.let { parts ->
                    (0 until parts.length())
                        .mapNotNull { parts.getJSONObject(it).optString("text").takeIf { t -> t.isNotBlank() } }
                        .joinToString(" ")
                }?.takeIf { it.isNotBlank() }

        if (transcript != null) {
            val intent = extractWardrobeIntent(transcript)
            return if (intent != null) SessionEvent.IntentUpdate(intent)
            else SessionEvent.Transcript(transcript)
        }
        null
    }.getOrNull()

    /**
     * Lightweight garment intent extraction from a transcript string.
     *
     * Phase 1: instruct Gemini Live (in the session setup system prompt) to always
     * respond with JSON: {action, garmentType, color, material, targetArea}.
     * That removes regex entirely and makes this a simple JSON parse.
     */
    private fun extractWardrobeIntent(transcript: String): WardrobeIntent? {
        val lower = transcript.lowercase()

        val action = when {
            lower.contains(Regex("\\b(add|layer|also|put on)\\b")) -> WardrobeIntent.Action.Add
            lower.contains(Regex("\\b(make it|change|switch|instead|turn it)\\b")) -> WardrobeIntent.Action.Modify
            else -> WardrobeIntent.Action.Replace
        }

        val garmentType = Regex(
            """\b(jacket|coat|shirt|t-shirt|tee|blouse|top|dress|saree|sari|suit|blazer|trousers|pants|jeans|skirt|shorts|sweater|hoodie|kurta|lehenga|sunglasses|hat|cap|scarf|shoes|sneakers|boots)\b"""
        ).find(lower)?.value ?: return null

        val color = Regex("""\b(red|blue|green|black|white|yellow|pink|purple|orange|brown|grey|gray|navy|beige|cream|gold|silver)\b""")
            .find(lower)?.value

        val material = Regex("""\b(leather|denim|cotton|silk|wool|linen|velvet|satin|polyester|knit)\b""")
            .find(lower)?.value

        return WardrobeIntent(action = action, garmentType = garmentType, color = color, material = material)
    }

    companion object {
        private const val TAG = "WardrobeGeminiLive"
    }
}
