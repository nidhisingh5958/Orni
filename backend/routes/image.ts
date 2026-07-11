import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { env } from '../config/env';

export const imageRouter = Router();

// Fallback 1x1 gray PNG image
const FALLBACK_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN88B8AAugB2uUkHn0AAAAASUVORK5CYII=";

imageRouter.post('/image', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const response = await ai.models.generateContent({
      model: env.NB2_LITE_MODEL,
      contents: prompt,
      config: {
        responseModalities: ["IMAGE"]
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));

    if (!imagePart || !imagePart.inlineData) {
      throw new Error("No image data returned from model");
    }

    res.json({
      mimeType: imagePart.inlineData.mimeType,
      data: imagePart.inlineData.data
    });
  } catch (err: any) {
    console.error("Image generation failed, using fallback:", err);
    res.json({
      mimeType: "image/png",
      data: FALLBACK_IMAGE_BASE64,
      isFallback: true,
      errorMsg: err.message || "Failed to generate image"
    });
  }
});
