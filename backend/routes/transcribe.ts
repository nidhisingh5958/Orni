import { Router } from 'express';
import { ai } from '../services/geminiClient';

export const transcribeRouter = Router();

transcribeRouter.post('/transcribe', async (req, res) => {
  const { audioBytes, mimeType } = req.body;

  if (!audioBytes) {
    return res.status(400).json({ error: "audioBytes is required" });
  }

  const type = mimeType || 'audio/webm';

  // 1. Try Deepgram API if key is present in environment variables
  if (process.env.DEEPGRAM_API_KEY) {
    try {
      console.log("[Transcribe Router] Attempting transcription via Deepgram...");
      const audioBuffer = Buffer.from(audioBytes, 'base64');
      
      const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': type
        },
        body: audioBuffer
      });

      if (response.ok) {
        const data: any = await response.json();
        const transcription = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
        console.log("[Transcribe Router] Deepgram transcription:", transcription);
        if (transcription.trim()) {
          return res.json({ text: transcription.trim() });
        }
      } else {
        console.warn(`[Transcribe Router] Deepgram API returned status ${response.status}`);
      }
    } catch (dgErr) {
      console.error("[Transcribe Router] Deepgram request failed:", dgErr);
    }
  }

  // 2. Fallback to Gemini 2.5 Flash audio transcription
  try {
    console.log("[Transcribe Router] Falling back to Gemini audio parser...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          inlineData: {
            mimeType: "audio/webm",
            data: audioBytes
          }
        },
        {
          text: "Transcribe this audio precisely. Return ONLY the transcription text, no other conversational comments."
        }
      ]
    });

    const transcription = response.text || '';
    res.json({ text: transcription.trim() });
  } catch (err: any) {
    console.error("[Transcribe Router] Gemini transcription failed:", err);
    res.status(500).json({ error: err.message || "Failed to transcribe audio feed" });
  }
});
