/**
 * image.ts — VoiceCanvas AI Image Generation Routes
 *
 * Uses a multi-step fallback chain for maximum reliability:
 *
 * IMAGE GENERATION CASCADE:
 *   1. Imagen 3 (imagen-3.0-generate-002) — Best quality, paid tier, uses generateImages API
 *   2. Gemini 2.0 Flash Exp (gemini-2.0-flash-exp) — Experimental, supports IMAGE responseModality
 *   3. Static 1x1 placeholder PNG — Silent fallback, never crashes
 *
 * TRYON CASCADE (same chain but with input image):
 *   1. Imagen 3 with edit prompt
 *   2. Gemini 2.0 Flash Exp with image input
 *   3. Return original webcam frame unchanged
 */

import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { env } from '../config/env';

export const imageRouter = Router();

// Fallback 1x1 transparent gray PNG
const FALLBACK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN88B8AAugB2uUkHn0AAAAASUVORK5CYII=';

// ─────────────────────────────────────────────────────────────
// HELPER: Tier 1 — Imagen 3 via generateImages API
// ─────────────────────────────────────────────────────────────
async function tryImagen3(prompt: string): Promise<string | null> {
  try {
    console.log(`[Imagen3] Attempting image generation: "${prompt}"`);
    const response = await (ai.models as any).generateImages({
      model: env.IMAGEN_MODEL,
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1'
      }
    });
    const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) throw new Error('No imageBytes in Imagen 3 response');
    console.log('[Imagen3] ✅ Image generated successfully');
    return typeof imageBytes === 'string'
      ? imageBytes
      : Buffer.from(imageBytes as any).toString('base64');
  } catch (err: any) {
    console.warn(`[Imagen3] ❌ Failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Tier 2 — Gemini 2.0 Flash Exp via generateContent + IMAGE modality
// ─────────────────────────────────────────────────────────────
async function tryGeminiExpImage(prompt: string, inputImageBase64?: string): Promise<string | null> {
  try {
    console.log(`[GeminiExp] Attempting image generation: "${prompt}"`);
    const parts: any[] = [];
    if (inputImageBase64) {
      parts.push({ inlineData: { mimeType: 'image/png', data: inputImageBase64 } });
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: env.GEMINI_EXP_IMAGE_MODEL,
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['IMAGE'] }
    });

    const resParts = response.candidates?.[0]?.content?.parts || [];
    const imgPart = resParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imgPart?.inlineData?.data) throw new Error('No image data in Gemini Exp response');
    console.log('[GeminiExp] ✅ Image generated successfully');
    return imgPart.inlineData.data as string;
  } catch (err: any) {
    console.warn(`[GeminiExp] ❌ Failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/image — Generate creative image from text prompt
// Fallback chain: Imagen 3 → Gemini Exp → Static placeholder
// ─────────────────────────────────────────────────────────────
imageRouter.post('/image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  const enrichedPrompt = `High-quality, photorealistic, cinematic image: "${prompt}". Vibrant colors, professional lighting, ultra-detailed.`;

  // Tier 1: Imagen 3
  let imageData = await tryImagen3(enrichedPrompt);

  // Tier 2: Gemini 2.0 Flash Exp
  if (!imageData) {
    imageData = await tryGeminiExpImage(enrichedPrompt);
  }

  // Tier 3: Placeholder
  if (!imageData) {
    console.warn('[image] All tiers failed, returning static placeholder');
    return res.json({
      mimeType: 'image/png',
      data: FALLBACK_IMAGE_BASE64,
      isFallback: true,
      errorMsg: 'All image generation models unavailable'
    });
  }

  res.json({ mimeType: 'image/jpeg', data: imageData });
});

// ─────────────────────────────────────────────────────────────
// POST /api/tryon — AI Virtual Try-On: webcam portrait + clothing style
// Fallback chain: Imagen 3 edit → Gemini Exp → Original frame
// ─────────────────────────────────────────────────────────────
imageRouter.post('/tryon', async (req, res) => {
  const { prompt, frameBytes, clothBytes } = req.body;
  if (!frameBytes) return res.status(400).json({ error: 'webcam frameBytes is required' });

  const tryonPrompt = clothBytes
    ? `The first image is the user's portrait. The second image is a clothing item. Synthesize a realistic edit where the person wears that clothing item naturally. Keep their face, hair, expression, and background identical. Style context: ${prompt || 'matching outfit'}. Return only the edited portrait.`
    : `The image is the user's portrait. Realistically place on them: ${prompt || 'a stylish outfit'}. Keep their face, hair, expression, and background completely unchanged. Return only the edited portrait.`;

  // Tier 1: Imagen 3 (doesn't support image input natively, so skip if clothBytes available)
  let imageData: string | null = null;
  if (!clothBytes) {
    // Imagen 3 can generate a try-on from text description when no reference image exists
    imageData = await tryImagen3(
      `Professional fashion photo: a person wearing ${prompt || 'a stylish outfit'}. Photorealistic, studio lighting, neutral background. Ultra-detailed, fashion editorial quality.`
    );
  }

  // Tier 2: Gemini Exp (supports image input for editing)
  if (!imageData) {
    const inputImage = clothBytes
      ? `${frameBytes}|||${clothBytes}` // Signal to include both images
      : frameBytes;

    // For cloth editing, we need multi-image input
    if (clothBytes) {
      try {
        console.log('[tryon/GeminiExp] Running two-image try-on...');
        const response = await ai.models.generateContent({
          model: env.GEMINI_EXP_IMAGE_MODEL,
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: frameBytes } },
              { inlineData: { mimeType: 'image/png', data: clothBytes } },
              { text: tryonPrompt }
            ]
          }],
          config: { responseModalities: ['IMAGE'] }
        });
        const resParts = response.candidates?.[0]?.content?.parts || [];
        const imgPart = resParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
        imageData = imgPart?.inlineData?.data || null;
        if (imageData) console.log('[tryon/GeminiExp] ✅ Two-image try-on successful');
      } catch (err: any) {
        console.warn('[tryon/GeminiExp] Two-image try-on failed:', err.message);
      }
    } else {
      imageData = await tryGeminiExpImage(tryonPrompt, frameBytes);
    }
  }

  // Tier 3: Return original frame unchanged
  if (!imageData) {
    console.warn('[tryon] All tiers failed, returning original webcam frame');
    return res.json({
      mimeType: 'image/png',
      data: frameBytes,
      isFallback: true,
      errorMsg: 'Try-on generation unavailable, showing original frame'
    });
  }

  res.json({ mimeType: 'image/jpeg', data: imageData });
});
