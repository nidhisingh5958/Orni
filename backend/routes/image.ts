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
    const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('image/'));

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

// Flagship AI Try-On Image-to-Image Endpoint
imageRouter.post('/tryon', async (req, res) => {
  const { prompt, frameBytes, clothBytes } = req.body;

  if (!frameBytes) {
    return res.status(400).json({ error: "webcam frameBytes is required" });
  }

  try {
    const contents: any[] = [];

    // 1. Add user's webcam snapshot image
    contents.push({
      inlineData: {
        mimeType: "image/png",
        data: frameBytes
      }
    });

    // 2. Add uploaded clothing item reference image (optional)
    if (clothBytes) {
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: clothBytes
        }
      });
      contents.push({
        text: `The first image is the user's portrait. The second image is a clothing product photo. Synthesize a realistic edited image where the person in the first photo is wearing the clothing item from the second photo. Fit the item naturally to their shoulders and body. Style context: ${prompt || 'matching jacket'}. Keep their face, expression, and the background identical. Return the edited image.`
      });
    } else {
      contents.push({
        text: `The image is the user's portrait. Generate a realistic edit where they are wearing a high-quality ${prompt || 'coat'}. Fit it naturally to their body. Keep their face, expression, hair, and the background identical. Return the edited image.`
      });
    }

    const response = await ai.models.generateContent({
      model: env.NB2_LITE_MODEL,
      contents: contents,
      config: {
        responseModalities: ["IMAGE"]
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('image/'));

    if (!imagePart || !imagePart.inlineData) {
      throw new Error("No try-on image returned from Gemini");
    }

    res.json({
      mimeType: imagePart.inlineData.mimeType,
      data: imagePart.inlineData.data
    });
  } catch (err: any) {
    console.error("AI Try-on generation failed, falling back to frame copy:", err);
    res.json({
      mimeType: "image/png",
      data: frameBytes,
      isFallback: true,
      errorMsg: err.message || "Failed to generate AI Try-on"
    });
  }
});
