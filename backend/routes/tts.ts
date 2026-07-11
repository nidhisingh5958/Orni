import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { env } from '../config/env';

export const ttsRouter = Router();

// Fallback silences - a basic short WAV file base64
const SILENT_WAV_BASE64 = "UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA==";

ttsRouter.post('/tts', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const response = await ai.models.generateContent({
      model: env.FLASH_TTS_MODEL,
      contents: text,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Kore"
            }
          }
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('audio/'));

    if (!audioPart || !audioPart.inlineData) {
      throw new Error("No audio returned from model");
    }

    res.json({
      mimeType: audioPart.inlineData.mimeType,
      audioBytes: audioPart.inlineData.data
    });
  } catch (err: any) {
    console.error("TTS generation failed, using silence fallback:", err);
    res.json({
      mimeType: "audio/wav",
      audioBytes: SILENT_WAV_BASE64,
      isFallback: true,
      errorMsg: err.message || "Failed to generate TTS"
    });
  }
});
