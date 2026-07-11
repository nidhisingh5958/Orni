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
 * Gemini Live WebSocket session for the wardrobe feature.
 *
 * Wire protocol: gemini-3.1-flash-live-preview (BidiGenerateContent).
 *   - On open  → send BidiGenerateContentSetup with model + system prompt
 *   - Audio    → BidiGenerateContentRealtimeInput (inline base64 PCM)
 *   - Receive  → BidiGenerateContentServerContent; extract text parts as JSON intent
 *
 * The WebSocket URL takes ?key=API_KEY directly (per Gemini Live docs).
 * The relay returns the API key as the token; this class appends it as ?key=.
 */
class WardrobeGeminiLiveSession(
    private val websocketUrl: String,
    private val token: String,
) {
    sealed interface SessionEvent {
        data class Transcript(val text: String) : SessionEvent
        data class IntentUpdate(val intent: WardrobeIntent) : SessionEvent
        /** Model signalled it finished a turn — safe to lock intent and generate. */
        data object TurnComplete : SessionEvent
        /** Model was interrupted mid-turn — discard partial intent. */
        data object Interrupted : SessionEvent
        data object Disconnected : SessionEvent
    }

    private var socket: WebSocket? = null

    fun events(): Flow<SessionEvent> = callbackFlow {
        val request = Request.Builder()
            .url("$websocketUrl?key=$token")
            .build()

        val listener = object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                socket = ws
                Log.d(TAG, "Gemini Live WS opened")
                ws.send(buildSetupMessage())
            }

            override fun onMessage(ws: WebSocket, text: String) {
                parseServerMessage(text).forEach { trySend(it) }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WS failure: ${t.message}")
                trySend(SessionEvent.Disconnected)
                close() // do NOT rethrow — avoids crashing the process
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

    /** Send a raw PCM chunk as a BidiGenerateContentRealtimeInput message. */
    fun sendAudioChunk(pcm: ByteArray) {
        val encoded = Base64.encodeToString(pcm, Base64.NO_WRAP)
        val msg = JSONObject().apply {
            put("realtimeInput", JSONObject().apply {
                put("mediaChunks", org.json.JSONArray().apply {
                    put(JSONObject().apply {
                        put("mimeType", "audio/pcm;rate=${MicAudioSource.SAMPLE_RATE}")
                        put("data", encoded)
                    })
                })
            })
        }.toString()
        socket?.send(msg)
    }

    fun close() {
        socket?.close(1000, "session ended")
        socket = null
    }

    // ---------------------------------------------------------------------------
    // Setup message
    // ---------------------------------------------------------------------------

    private fun buildSetupMessage(): String = JSONObject().apply {
        put("setup", JSONObject().apply {
            put("model", MODEL)
            put("generationConfig", JSONObject().apply {
                put("responseModalities", org.json.JSONArray().apply { put("TEXT") })
            })
            put("systemInstruction", JSONObject().apply {
                put("parts", org.json.JSONArray().apply {
                    put(JSONObject().apply {
                        put("text", SYSTEM_PROMPT)
                    })
                })
            })
        })
    }.toString()

    // ---------------------------------------------------------------------------
    // Server message parsing
    // ---------------------------------------------------------------------------

    /**
     * A single server frame can carry multiple parts and a turnComplete flag.
     * Returns a list so all signals from one frame are emitted in order.
     */
    private fun parseServerMessage(text: String): List<SessionEvent> = runCatching {
        val events = mutableListOf<SessionEvent>()
        val json = JSONObject(text)

        val serverContent = json.optJSONObject("serverContent") ?: return@runCatching events

        // Interrupted signal — model was cut off
        if (serverContent.optBoolean("interrupted", false)) {
            events += SessionEvent.Interrupted
            return@runCatching events
        }

        // Extract text parts from modelTurn
        val modelTurn = serverContent.optJSONObject("modelTurn")
        val parts = modelTurn?.optJSONArray("parts")
        if (parts != null) {
            val textParts = (0 until parts.length())
                .mapNotNull { parts.getJSONObject(it).optString("text").takeIf { t -> t.isNotBlank() } }
            val combined = textParts.joinToString(" ").trim()
            if (combined.isNotBlank()) {
                val intent = tryParseIntent(combined)
                if (intent != null) events += SessionEvent.IntentUpdate(intent)
                else events += SessionEvent.Transcript(combined)
            }
        }

        // turnComplete — model finished speaking
        if (serverContent.optBoolean("turnComplete", false)) {
            events += SessionEvent.TurnComplete
        }

        events
    }.getOrElse { emptyList() }

    /**
     * The model is instructed to always reply with JSON. Try to parse it;
     * fall back to regex extraction if the model returns plain text.
     */
    private fun tryParseIntent(text: String): WardrobeIntent? {
        // Strip markdown code fences if present
        val cleaned = text.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        return runCatching {
            val j = JSONObject(cleaned)
            val garmentType = j.optString("garmentType").takeIf { it.isNotBlank() } ?: return@runCatching null
            val action = when (j.optString("action").lowercase()) {
                "add" -> WardrobeIntent.Action.Add
                "modify" -> WardrobeIntent.Action.Modify
                else -> WardrobeIntent.Action.Replace
            }
            WardrobeIntent(
                action = action,
                garmentType = garmentType,
                color = j.optString("color").takeIf { it.isNotBlank() },
                material = j.optString("material").takeIf { it.isNotBlank() },
                targetArea = j.optString("targetArea").takeIf { it.isNotBlank() },
            )
        }.getOrNull() ?: regexFallbackIntent(text)
    }

    /** Regex fallback for when the model returns plain text instead of JSON. */
    private fun regexFallbackIntent(text: String): WardrobeIntent? {
        val lower = text.lowercase()
        val action = when {
            lower.contains(Regex("\\b(add|layer|also|put on)\\b")) -> WardrobeIntent.Action.Add
            lower.contains(Regex("\\b(make it|change|switch|instead|turn it)\\b")) -> WardrobeIntent.Action.Modify
            else -> WardrobeIntent.Action.Replace
        }
        val garmentType = Regex(
            """\b(jacket|coat|shirt|t-shirt|tee|blouse|top|dress|saree|sari|suit|blazer|trousers|pants|jeans|skirt|shorts|sweater|hoodie|kurta|lehenga|sunglasses|hat|cap|scarf|shoes|sneakers|boots)\b"""
        ).find(lower)?.value ?: return null
        val color = Regex("""\b(red|blue|green|black|white|yellow|pink|purple|orange|brown|grey|gray|navy|beige|cream|gold|silver)\b""").find(lower)?.value
        val material = Regex("""\b(leather|denim|cotton|silk|wool|linen|velvet|satin|polyester|knit)\b""").find(lower)?.value
        return WardrobeIntent(action = action, garmentType = garmentType, color = color, material = material)
    }

    companion object {
        private const val TAG = "WardrobeGeminiLive"
        // Confirmed against Gemini API docs (June 2025).
        private const val MODEL = "models/gemini-3.1-flash-live-preview"
        private val SYSTEM_PROMPT = """
            You are a wardrobe assistant. The user will speak outfit change instructions.
            After each complete instruction, respond ONLY with a single JSON object — no prose, no markdown fences:
            {"action":"replace|add|modify","garmentType":"<item>","color":"<color or null>","material":"<material or null>","targetArea":"<body area or null>"}
            
            Rules:
            - action=replace: swap the whole garment ("put him in a suit")
            - action=add: layer something new ("add sunglasses")
            - action=modify: change an attribute of the current garment ("make it brown", "actually blue")
            - If the user corrects themselves mid-sentence, use the final stated value only.
            - garmentType must always be present. All other fields are optional (omit or null).
        """.trimIndent()
    }
}
