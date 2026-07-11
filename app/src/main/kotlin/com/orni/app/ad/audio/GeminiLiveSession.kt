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
import org.json.JSONArray
import org.json.JSONObject

/**
 * Gemini Live WebSocket session for the Ad Canvas feature.
 *
 * Wire protocol: BidiGenerateContent (same as WardrobeGeminiLiveSession).
 *   - On open       → send BidiGenerateContentSetup with model + system prompt
 *   - On setupComplete → start sending audio
 *   - Audio         → BidiGenerateContentRealtimeInput (inline base64 PCM)
 *   - Receive       → BidiGenerateContentServerContent; extract JSON intent
 */
class GeminiLiveSession(private val websocketUrl: String, private val token: String) {

    sealed interface SessionEvent {
        data class Transcript(val text: String) : SessionEvent
        data class IntentUpdate(val intent: AdIntent) : SessionEvent
        data object TurnComplete : SessionEvent
        data object Disconnected : SessionEvent
    }

    private var socket: WebSocket? = null
    private var setupComplete = false

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
                close() // close the flow channel, NOT rethrow — avoids crash
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
        if (!setupComplete) return
        val encoded = Base64.encodeToString(pcm, Base64.NO_WRAP)
        val msg = JSONObject().apply {
            put("realtimeInput", JSONObject().apply {
                put("mediaChunks", JSONArray().apply {
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
        setupComplete = false
    }

    private fun buildSetupMessage(): String = JSONObject().apply {
        put("setup", JSONObject().apply {
            put("model", MODEL)
            put("generationConfig", JSONObject().apply {
                put("responseModalities", JSONArray().apply { put("TEXT") })
            })
            put("systemInstruction", JSONObject().apply {
                put("parts", JSONArray().apply {
                    put(JSONObject().apply { put("text", SYSTEM_PROMPT) })
                })
            })
        })
    }.toString()

    private fun parseServerMessage(text: String): List<SessionEvent> = runCatching {
        val events = mutableListOf<SessionEvent>()
        val json = JSONObject(text)

        // setupComplete — safe to start sending audio
        if (json.optBoolean("setupComplete", false)) {
            setupComplete = true
            return@runCatching events
        }

        val serverContent = json.optJSONObject("serverContent") ?: return@runCatching events

        if (serverContent.optBoolean("interrupted", false)) {
            return@runCatching events // discard partial, new speech coming
        }

        val parts = serverContent.optJSONObject("modelTurn")?.optJSONArray("parts")
        if (parts != null) {
            val combined = (0 until parts.length())
                .mapNotNull { parts.getJSONObject(it).optString("text").takeIf { t -> t.isNotBlank() } }
                .joinToString(" ").trim()
            if (combined.isNotBlank()) {
                val intent = tryParseIntent(combined)
                if (intent != null) events += SessionEvent.IntentUpdate(intent)
                else events += SessionEvent.Transcript(combined)
            }
        }

        if (serverContent.optBoolean("turnComplete", false)) {
            events += SessionEvent.TurnComplete
        }

        events
    }.getOrElse { emptyList() }

    private fun tryParseIntent(text: String): AdIntent? {
        val cleaned = text.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        return runCatching {
            val j = JSONObject(cleaned)
            val actionStr = j.optString("action").lowercase()
            val action = when (actionStr) {
                "edit"     -> AdIntent.Action.Edit
                "animate"  -> AdIntent.Action.Animate
                "localize" -> AdIntent.Action.Localize
                "wardrobe" -> AdIntent.Action.Wardrobe
                "unknown"  -> AdIntent.Action.Unknown
                else       -> AdIntent.Action.Create
            }
            val aspectStr = j.optString("aspect")
            val aspect = when (aspectStr) {
                "1:1"  -> AdIntent.Aspect.Square
                "16:9" -> AdIntent.Aspect.Landscape
                else   -> AdIntent.Aspect.Vertical
            }
            val energy = when (j.optString("energy").lowercase()) {
                "high" -> AdIntent.Energy.High
                "low"  -> AdIntent.Energy.Low
                else   -> AdIntent.Energy.Medium
            }
            AdIntent(
                action = action,
                product = j.optString("product").takeIf { it.isNotBlank() } ?: "",
                background = j.optString("background").takeIf { it.isNotBlank() },
                copyText = j.optString("copy_text").takeIf { it.isNotBlank() },
                style = j.optString("style").takeIf { it.isNotBlank() },
                motion = j.optString("motion").takeIf { it.isNotBlank() },
                language = j.optString("language").takeIf { it.isNotBlank() },
                aspect = aspect,
                energy = energy,
                interrupt = j.optBoolean("interrupt", false),
                confidence = j.optDouble("confidence", 1.0).toFloat(),
            )
        }.getOrNull() ?: regexFallbackIntent(text)
    }

    private fun regexFallbackIntent(text: String): AdIntent? {
        val lower = text.lowercase()
        val interrupt = INTERRUPT_WORDS.any { lower.startsWith(it) }
        val action = when {
            lower.contains(Regex("\\b(animate|video|clip|reel|cinematic|motion)\\b")) -> AdIntent.Action.Animate
            lower.contains(Regex("\\b(translate|hindi|kannada|tamil|localize)\\b"))  -> AdIntent.Action.Localize
            interrupt -> AdIntent.Action.Edit
            else -> AdIntent.Action.Create
        }
        val language = when {
            "hindi" in lower || " hi" in lower   -> "hi"
            "kannada" in lower || " kn" in lower -> "kn"
            "tamil" in lower || " ta" in lower   -> "ta"
            else -> null
        }
        if (action == AdIntent.Action.Localize) {
            return AdIntent(action = action, language = language, interrupt = interrupt)
        }
        val product = Regex("""(?:for|ad for|about)\s+(?:a\s+|an\s+)?(.+?)(?:\s*,|\s+with|\s+text|\s+background|\s+style|$)""")
            .find(lower)?.groupValues?.getOrNull(1)?.trim() ?: return null
        val aspect = when {
            "square" in lower || "post" in lower   -> AdIntent.Aspect.Square
            "banner" in lower || "youtube" in lower -> AdIntent.Aspect.Landscape
            else -> AdIntent.Aspect.Vertical
        }
        val energy = when {
            INTERRUPT_WORDS_HIGH.any { it in lower } -> AdIntent.Energy.High
            INTERRUPT_WORDS_LOW.any { it in lower }  -> AdIntent.Energy.Low
            else -> AdIntent.Energy.Medium
        }
        return AdIntent(
            action = action,
            product = product,
            background = Regex("""background\s+(?:is\s+|a\s+)?(.+?)(?:\s*,|$)""").find(lower)?.groupValues?.getOrNull(1)?.trim(),
            copyText = Regex("""(?:text|copy|says?)\s+["']?(.+?)["']?(?:\s*,|$)""").find(lower)?.groupValues?.getOrNull(1)?.trim(),
            style = Regex("""(?:style|vibe|look)\s+(?:is\s+|like\s+)?(.+?)(?:\s*,|$)""").find(lower)?.groupValues?.getOrNull(1)?.trim(),
            motion = if (action == AdIntent.Action.Animate) text else null,
            aspect = aspect,
            energy = energy,
            interrupt = interrupt,
        )
    }

    companion object {
        private const val TAG = "GeminiLiveSession"
        private const val MODEL = "models/gemini-2.0-flash-live-001"
        private val INTERRUPT_WORDS = listOf("wait", "no,", "actually", "stop", "change that", "hold on")
        private val INTERRUPT_WORDS_HIGH = listOf("really", "very", "super", "bold", "dramatic", "epic", "flashier")
        private val INTERRUPT_WORDS_LOW  = listOf("subtle", "minimal", "calm", "soft", "gentle", "clean")
        private val SYSTEM_PROMPT = """
            You are the intent parser for a voice-driven ad studio.
            After each complete instruction, respond ONLY with a single JSON object — no prose, no markdown fences:
            {"action":"create|edit|animate|localize|wardrobe|unknown","product":"<product>","background":"<bg or null>","copy_text":"<headline or null>","style":"<style or null>","motion":"<motion brief or null>","language":"<ISO code or null>","aspect":"9:16|1:1|16:9","energy":"low|medium|high","interrupt":false,"confidence":1.0}
            Rules:
            - RESOLVE self-corrections: "a red bottle, no, blue" -> blue wins.
            - action=create: new asset. action=edit: modify current. action=animate: add motion. action=localize: translate copy. action=wardrobe: apparel change.
            - interrupt=true if utterance starts with "wait", "no", "actually", "stop", "change that".
            - copy_text is the LITERAL on-image words, verbatim.
            - aspect: "story"/"reel"/"vertical"->9:16; "post"/"square"->1:1; "banner"/"youtube"->16:9.
            - energy: detect from vocal emphasis words ("really bold", "super flashy"->high; "subtle", "minimal"->low).
        """.trimIndent()
    }
}
