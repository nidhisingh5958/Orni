/**
 * video.ts — VoiceCanvas AI Video Generation Routes
 *
 * Uses a multi-step fallback chain for maximum reliability:
 *
 * VIDEO GENERATION CASCADE:
 *   1. Veo 2 (veo-2.0-generate-001) — Actual MP4 video output, paid tier, async polling
 *   2. Imagen 3 (imagen-3.0-generate-002) — High-quality cinematic still frame, paid tier
 *   3. Gemini 2.0 Flash Exp — Experimental still frame via IMAGE modality
 *   4. Static placeholder — Never crashes
 *
 * /video/session  — Seeds the session context for an asset (stores prompt metadata).
 * /video/turn     — Executes a generation turn using the full cascade.
 *
 * IMPORTANT: ai.interactions.create is the Antigravity agent runtime API, NOT for image/video generation.
 * All media generation uses ai.models.generateContent, ai.models.generateImages, ai.models.generateVideos.
 */

import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { sessionStore } from '../services/sessionStore';
import { env } from '../config/env';

export const videoRouter = Router();

// Fallback 1x1 transparent PNG
const FALLBACK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN88B8AAugB2uUkHn0AAAAASUVORK5CYII=';

// ─────────────────────────────────────────────────────────────
// HELPER: Tier 1 — Veo 2 (real MP4 video via async polling)
// ─────────────────────────────────────────────────────────────
async function tryVeo2(prompt: string): Promise<{ data: string; isVideo: true } | null> {
  try {
    console.log(`[Veo2] Starting video generation: "${prompt}"`);

    let operation = await (ai.models as any).generateVideos({
      model: env.VEO_MODEL,
      prompt: `Cinematic, photorealistic, high-quality video: ${prompt}. Dramatic lighting, smooth camera movement, professional cinematography.`,
      config: {
        numberOfVideos: 1,
        durationSeconds: 5,
        aspectRatio: '16:9'
      }
    });

    // Poll until done or timeout
    const deadline = Date.now() + env.VEO_TIMEOUT_MS;
    while (!operation.done) {
      if (Date.now() > deadline) {
        throw new Error(`Veo 2 timed out after ${env.VEO_TIMEOUT_MS / 1000}s`);
      }
      console.log('[Veo2] Polling... waiting 4s');
      await new Promise(r => setTimeout(r, 4000));
      operation = await (ai.operations as any).getVideosOperation({
        operation: { name: operation.name }
      });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error('No video URI in Veo 2 response');

    console.log(`[Veo2] Video ready at: ${videoUri}`);

    // Fetch video bytes from the CDN URI
    const fetchResponse = await fetch(videoUri, {
      headers: { 'Authorization': `Bearer ${env.GEMINI_API_KEY}` }
    });
    if (!fetchResponse.ok) {
      // Try without auth header (public CDN URL)
      const publicResponse = await fetch(videoUri);
      if (!publicResponse.ok) throw new Error(`Failed to fetch video bytes: ${publicResponse.status}`);
      const videoBuffer = await publicResponse.arrayBuffer();
      console.log('[Veo2] ✅ Video fetched successfully (public URL)');
      return { data: Buffer.from(videoBuffer).toString('base64'), isVideo: true };
    }

    const videoBuffer = await fetchResponse.arrayBuffer();
    console.log('[Veo2] ✅ Video fetched successfully');
    return { data: Buffer.from(videoBuffer).toString('base64'), isVideo: true };
  } catch (err: any) {
    console.warn(`[Veo2] ❌ Failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Tier 2 — Imagen 3 (cinematic still frame)
// ─────────────────────────────────────────────────────────────
async function tryImagen3Still(prompt: string): Promise<{ data: string; isVideo: false } | null> {
  try {
    console.log(`[Imagen3] Generating cinematic still: "${prompt}"`);
    const response = await (ai.models as any).generateImages({
      model: env.IMAGEN_MODEL,
      prompt: `Cinematic still frame from a blockbuster film: ${prompt}. Ultra-detailed, dramatic lighting, professional color grading, anamorphic lens aesthetic. 16:9 wide aspect.`,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9'
      }
    });
    const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) throw new Error('No imageBytes in Imagen 3 response');
    console.log('[Imagen3] ✅ Cinematic still generated');
    const data = typeof imageBytes === 'string'
      ? imageBytes
      : Buffer.from(imageBytes as any).toString('base64');
    return { data, isVideo: false };
  } catch (err: any) {
    console.warn(`[Imagen3] ❌ Failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Tier 3 — Gemini 2.0 Flash Exp (still via IMAGE modality)
// ─────────────────────────────────────────────────────────────
async function tryGeminiExpStill(prompt: string): Promise<{ data: string; isVideo: false } | null> {
  try {
    console.log(`[GeminiExp] Generating still frame: "${prompt}"`);
    const response = await ai.models.generateContent({
      model: env.GEMINI_EXP_IMAGE_MODEL,
      contents: [{
        role: 'user',
        parts: [{
          text: `Create a cinematic, photorealistic still frame for this scene: "${prompt}". Apply dramatic lighting, professional color grading, movie-quality composition.`
        }]
      }],
      config: { responseModalities: ['IMAGE'] }
    });
    const parts = response.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imgPart?.inlineData?.data) throw new Error('No image data in Gemini Exp response');
    console.log('[GeminiExp] ✅ Still frame generated');
    return { data: imgPart.inlineData.data as string, isVideo: false };
  } catch (err: any) {
    console.warn(`[GeminiExp] ❌ Failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/video/session
// Seeds a visual session for an asset. Pre-generates a cinematic
// still frame from the provided image to pre-warm the asset context.
// Body: { assetId, imageBytes (base64 PNG), prompt? }
// ─────────────────────────────────────────────────────────────
videoRouter.post('/video/session', async (req, res) => {
  const { assetId, imageBytes, prompt } = req.body;

  if (!assetId || !imageBytes) {
    return res.status(400).json({ error: 'assetId and imageBytes are required' });
  }

  console.log(`[video/session] Seeding session for asset: ${assetId}`);

  // Seed the session store immediately
  const sessionId = `session_${assetId}_${Date.now()}`;
  sessionStore.setSession(assetId, sessionId);

  const sessionPrompt = prompt || 'Generate a breathtaking cinematic scene from this photo. Apply dramatic lighting and vivid colors.';

  // Tier 2: Imagen 3 still (no need for Veo in pre-warm)
  let result = await tryImagen3Still(sessionPrompt);

  // Tier 3: Gemini Exp
  if (!result) result = await tryGeminiExpStill(sessionPrompt);

  console.log(`[video/session] Session ${sessionId} seeded. Image: ${!!result}`);

  res.json({
    success: true,
    sessionId,
    videoBytes: result?.data || null,
    isVideo: false
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/video/turn
// Full generation cascade: Veo 2 → Imagen 3 → Gemini Exp → Placeholder
// Body: { assetId, prompt }
// ─────────────────────────────────────────────────────────────
videoRouter.post('/video/turn', async (req, res) => {
  const { assetId, prompt } = req.body;

  if (!assetId || !prompt) {
    return res.status(400).json({ error: 'assetId and prompt are required' });
  }

  // Ensure a session exists
  if (!sessionStore.getSession(assetId)) {
    sessionStore.setSession(assetId, `dynamic_${assetId}_${Date.now()}`);
  }

  console.log(`[video/turn] Generating for asset: ${assetId}, prompt: "${prompt}"`);

  // ── Tier 1: Veo 2 (real MP4 video) ──
  const veoResult = await tryVeo2(prompt);
  if (veoResult) {
    sessionStore.setSession(assetId, `veo_${assetId}_${Date.now()}`);
    return res.json({
      success: true,
      sessionId: `veo_${assetId}_${Date.now()}`,
      videoBytes: veoResult.data,
      isVideo: true
    });
  }

  // ── Tier 2: Imagen 3 (cinematic still) ──
  const imagenResult = await tryImagen3Still(prompt);
  if (imagenResult) {
    sessionStore.setSession(assetId, `imagen_${assetId}_${Date.now()}`);
    return res.json({
      success: true,
      sessionId: `imagen_${assetId}_${Date.now()}`,
      videoBytes: imagenResult.data,
      isVideo: false
    });
  }

  // ── Tier 3: Gemini 2.0 Flash Exp (still frame) ──
  const expResult = await tryGeminiExpStill(prompt);
  if (expResult) {
    sessionStore.setSession(assetId, `exp_${assetId}_${Date.now()}`);
    return res.json({
      success: true,
      sessionId: `exp_${assetId}_${Date.now()}`,
      videoBytes: expResult.data,
      isVideo: false
    });
  }

  // ── Tier 4: Static placeholder (silent fallback) ──
  console.error('[video/turn] All tiers exhausted, returning placeholder');
  res.json({
    success: false,
    sessionId: `placeholder_${assetId}_${Date.now()}`,
    videoBytes: null,
    isVideo: false,
    errorMsg: 'All video generation models temporarily unavailable',
    isFallback: true
  });
});
