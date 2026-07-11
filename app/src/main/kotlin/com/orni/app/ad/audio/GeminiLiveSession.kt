package com.orni.app.ad.audio

import android.util.Base64
import android.util.Log
import com.orni.app.ad.AdIntent
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
 * Manages a single Gemini Live WebSocket session.
 *
 * - Audio chunks (raw PCM) are sent as base64-encoded JSON messages.
 * - Text responses from Gemini are parsed into [SessionEvent]s.
 * - The flow closes when the socket closes or [close] is called.
 *
 * Phase 0: the websocketUrl points at a local echo server so the audio
 * streaming path can be proven before Gemini Live is wired in.
 *
 * Phase 1: swap the message format to match the Gemini Live API spec once
 * the hackathon docs confirm the exact wire protocol for
 * `gemini-3.1-flash-live-preview`.
 */
class GeminiLiveSession(private val websocketUrl: String, private val token: String) {

    sealed interface SessionEvent {
        data class Transcript(val text: String) : SessionEvent
        data class IntentUpdate(val intent: AdIntent) : SessionEvent
        data object Disconnected : SessionEvent
    }

    private var socket: WebSocket? = null

    /**
     * Opens the WebSocket and returns a [Flow] of [SessionEvent]s.
     * Collecting the flow drives the session; cancelling the collector closes it.
     */
    fun events(): Flow<SessionEvent> = callbackFlow {
        val request = Request.Builder()
            .url("$websocketUrl?token=$token")
            .build()

        val listener = object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                socket = ws
                Log.d(TAG, "Gemini Live WS opened")
                // Phase 1: send the session setup message here (model, config, etc.)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                val event = parseServerMessage(text)
                if (event != null) trySend(event)
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

    /** Send a raw PCM chunk. Encodes to base64 and wraps in the Gemini Live audio message format. */
    fun sendAudioChunk(pcm: ByteArray) {
        val encoded = Base64.encodeToString(pcm, Base64.NO_WRAP)
        // Phase 1: replace with the exact Gemini Live realtime_input message schema.
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

    /**
     * Parse a server text frame into a [SessionEvent].
     *
     * Phase 0: the echo server reflects our own audio messages back — we treat
     * any JSON with a "transcript" field as a transcript event.
     *
     * Phase 1: map to the actual Gemini Live response schema. Gemini Live
     * returns server_content / model_turn messages; extract the text part and
     * run a lightweight regex/JSON parse to pull structured intent fields.
     *
     * The intent extraction here is intentionally simple — product, background,
     * copyText, style — because the ViewModel handles merging partial updates.
     */
    private fun parseServerMessage(text: String): SessionEvent? = runCatching {
        val json = JSONObject(text)

        // Transcript path (Phase 0 echo + Phase 1 Gemini text turns)
        val transcript = json.optString("transcript").takeIf { it.isNotBlank() }
            ?: json.optJSONObject("serverContent")
                ?.optJSONObject("modelTurn")
                ?.optJSONArray("parts")
                ?.let { parts ->
                    (0 until parts.length()).mapNotNull { parts.getJSONObject(it).optString("text").takeIf { t -> t.isNotBlank() } }
                        .joinToString(" ")
                }?.takeIf { it.isNotBlank() }

        if (transcript != null) {
            val intent = extractIntent(transcript)
            return if (intent != null) SessionEvent.IntentUpdate(intent)
            else SessionEvent.Transcript(transcript)
        }
        null
    }.getOrNull()

    /**
     * Lightweight intent extraction from a transcript string.
     *
     * Phase 1: replace with a structured JSON response from Gemini Live by
     * instructing the model (in the session setup) to always respond with a
     * JSON object containing {product, background, copyText, style} fields.
     * That removes the need for regex entirely.
     */
    private fun extractIntent(transcript: String): AdIntent? {
        val lower = transcript.lowercase()

        // Require at least a product mention to form an intent
        val product = Regex("""(?:for|ad for|about)\s+(?:a\s+|an\s+)?(.+?)(?:\s*,|\s+with|\s+text|\s+background|\s+style|$)""")
            .find(lower)?.groupValues?.getOrNull(1)?.trim()
            ?: return null

        val background = Regex("""background\s+(?:is\s+|a\s+|an\s+)?(.+?)(?:\s*,|$)""").find(lower)?.groupValues?.getOrNull(1)?.trim()
        val copyText = Regex("""(?:text|copy|says?)\s+["']?(.+?)["']?(?:\s*,|$)""").find(lower)?.groupValues?.getOrNull(1)?.trim()
        val style = Regex("""(?:style|vibe|look)\s+(?:is\s+|like\s+)?(.+?)(?:\s*,|$)""").find(lower)?.groupValues?.getOrNull(1)?.trim()

        return AdIntent(product = product, background = background, copyText = copyText, style = style)
    }

    companion object {
        private const val TAG = "GeminiLiveSession"
    }
}
