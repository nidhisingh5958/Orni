package com.orni.app.ad.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive

/**
 * Continuously captures raw 16-bit PCM mono audio from the microphone and
 * emits chunks as a [Flow]. The flow is cold — capture starts when collected
 * and stops when the collector is cancelled.
 *
 * Gemini Live expects: 16 kHz, mono, 16-bit little-endian PCM.
 */
object MicAudioSource {

    const val SAMPLE_RATE = 16_000
    private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
    private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT

    // ~20 ms of audio per chunk — small enough for low latency, large enough
    // to amortise the JNI overhead of each AudioRecord.read() call.
    private val CHUNK_BYTES = SAMPLE_RATE * 2 * 20 / 1000  // 640 bytes

    @SuppressLint("MissingPermission")  // Caller must hold RECORD_AUDIO before collecting.
    fun pcmFlow(): Flow<ByteArray> = flow {
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
        val bufSize = maxOf(minBuf, CHUNK_BYTES * 4)

        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            CHANNEL,
            ENCODING,
            bufSize,
        )

        recorder.startRecording()
        try {
            val chunk = ByteArray(CHUNK_BYTES)
            while (currentCoroutineContext().isActive) {
                val read = recorder.read(chunk, 0, chunk.size)
                if (read > 0) emit(chunk.copyOf(read))
            }
        } finally {
            recorder.stop()
            recorder.release()
        }
    }.flowOn(Dispatchers.IO)
}
