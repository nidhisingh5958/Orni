import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { env } from '../config/env';

export const translateRouter = Router();

translateRouter.post('/translate', async (req, res) => {
  const { text, targetLanguage } = req.body;

  if (!text || !targetLanguage) {
    return res.status(400).json({ error: "text and targetLanguage are required" });
  }

  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_LIVE_TRANSLATE_MODEL,
      contents: `Translate the following text into ${targetLanguage}. Output ONLY the translated text. Do not add any introduction, explanations, or metadata.\n\nText: ${text}`
    });

    const translatedText = response.text || text;
    res.json({ translatedText });
  } catch (err: any) {
    console.error("Translation failed, using original text as fallback:", err);
    res.json({
      translatedText: text,
      isFallback: true,
      errorMsg: err.message || "Failed to translate text"
    });
  }
});
