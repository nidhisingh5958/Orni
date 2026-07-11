/**
 * image.ts — VoiceCanvas AI Image Generation Routes
 *
 * Two endpoints:
 *   1. /image — Generates a creative image from a text prompt using Gemini with IMAGE modality.
 *   2. /tryon — Virtual try-on: takes the user's webcam frame + optional clothing reference image,
 *      asks Gemini to composite the clothing onto the user realistically.
 *
 * Model: gemini-2.0-flash with responseModalities: ["IMAGE"] for image outputs.
 * Falls back gracefully to the original frame bytes if generation fails.
 */

import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { env } from '../config/env';

export const imageRouter = Router();

// Fallback 1x1 gray PNG image
const FALLBACK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN88B8AAugB2uUkHn0AAAAASUVORK5CYII=';

/**
 * POST /api/image
 * Generates a creative ad image from a text prompt.
 * Body: { prompt: string }
 * Returns: { mimeType, data, isFallback?, errorMsg? }
 */
imageRouter.post('/image', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    console.log(`[image] Generating image for prompt: "${prompt}"`);

    const response = await ai.models.generateContent({
      model: env.NB2_LITE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Create a high-quality, visually striking creative image for: "${prompt}". Make it photorealistic and cinematic.` }]
        }
      ],
      config: {
        responseModalities: ['IMAGE']
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart?.inlineData) {
      throw new Error('No image data returned from model');
    }

    console.log(`[image] Image generated successfully`);
    res.json({
      mimeType: imagePart.inlineData.mimeType,
      data: imagePart.inlineData.data
    });
  } catch (err: any) {
    console.error('[image] Image generation failed, using fallback:', err.message);
    res.json({
      mimeType: 'image/png',
      data: FALLBACK_IMAGE_BASE64,
      isFallback: true,
      errorMsg: err.message || 'Failed to generate image'
    });
  }
});

/**
 * POST /api/tryon
 * AI Virtual Try-On: Composites clothing onto the user's webcam portrait.
 * Body: { prompt: string, frameBytes: string (base64 PNG), clothBytes?: string (base64 PNG) }
 * Returns: { mimeType, data, isFallback?, errorMsg? }
 */
imageRouter.post('/tryon', async (req, res) => {
  const { prompt, frameBytes, clothBytes } = req.body;

  if (!frameBytes) {
    return res.status(400).json({ error: 'webcam frameBytes is required' });
  }

  try {
    console.log(`[tryon] Running AI try-on for: "${prompt}"`);

    const parts: any[] = [];

    // 1. Add user's webcam snapshot image
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: frameBytes
      }
    });

    // 2. Add uploaded clothing item reference image (optional)
    if (clothBytes) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: clothBytes
        }
      });
      parts.push({
        text: `The first image is the user's portrait. The second image is a clothing product photo. 
Synthesize a realistic edited image where the person in the first photo is wearing the clothing item from the second photo. 
Fit the item naturally to their shoulders and body. Style context: ${prompt || 'matching jacket'}. 
Keep their face, expression, and the background identical. Return ONLY the edited image.`
      });
    } else {
      parts.push({
        text: `The image is the user's portrait. Generate a realistic edit where they are wearing: ${prompt || 'a stylish coat'}. 
Fit it naturally to their body and shoulders. Keep their face, expression, hair, and the background completely identical. 
Return ONLY the photorealistic edited image.`
      });
    }

    const response = await ai.models.generateContent({
      model: env.NB2_LITE_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['IMAGE']
      }
    });

    const responseParts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart?.inlineData) {
      throw new Error('No try-on image returned from Gemini');
    }

    console.log(`[tryon] Try-on generated successfully`);
    res.json({
      mimeType: imagePart.inlineData.mimeType,
      data: imagePart.inlineData.data
    });
  } catch (err: any) {
    console.error('[tryon] AI Try-on failed, returning original frame:', err.message);
    res.json({
      mimeType: 'image/png',
      data: frameBytes,
      isFallback: true,
      errorMsg: err.message || 'Failed to generate AI Try-on'
    });
  }
});
