/**
 * video.ts — VoiceCanvas AI Video Generation Routes
 *
 * This file handles the two-step video generation flow:
 *   1. /video/session — Seeds a "session" for a given asset by storing the prompt context.
 *      Uses generateContent with responseModalities:["IMAGE"] to create a still frame
 *      representing the opening visual of the video scene.
 *   2. /video/turn — Given an existing assetId + a new prompt, calls generateContent to
 *      generate an updated visual frame from the new prompt, simulating a video turn.
 *
 * IMPORTANT: ai.interactions.create is the Antigravity agent runtime API.
 * It is NOT for calling Gemini image/video models. All generative calls MUST use
 * ai.models.generateContent with the correct model and responseModalities config.
 *
 * All errors fall back gracefully — the frontend always gets a response, never a raw 400/500.
 */

import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { sessionStore } from '../services/sessionStore';
import { env } from '../config/env';

export const videoRouter = Router();

// Minimal fallback 1x1 transparent PNG base64 (used when all generation fails)
const FALLBACK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN88B8AAugB2uUkHn0AAAAASUVORK5CYII=';

/**
 * POST /api/video/session
 * Seeds a video session for an asset by generating a cinematic still frame from an image + prompt.
 * This pre-warms the session store so subsequent /video/turn calls can reference the assetId.
 *
 * Body: { assetId: string, imageBytes: string (base64 PNG), prompt?: string }
 * Returns: { success: boolean, sessionId: string, videoBytes: string | null }
 */
videoRouter.post('/video/session', async (req, res) => {
  const { assetId, imageBytes, prompt } = req.body;

  if (!assetId || !imageBytes) {
    return res.status(400).json({ error: 'assetId and imageBytes are required' });
  }

  try {
    console.log(`[video/session] Seeding visual session for asset: ${assetId}`);

    const videoPrompt = prompt || 'Generate a cinematic, high-quality scene image inspired by this photo. Apply dramatic lighting, vibrant color grading, and a cinematic wide-angle aesthetic.';

    // Use generateContent with IMAGE modality to create a styled still frame
    const response = await ai.models.generateContent({
      model: env.OMNI_FLASH_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBytes
              }
            },
            { text: videoPrompt }
          ]
        }
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT']
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    // Store a synthetic session ID (timestamp-based) in the session store
    const sessionId = `session_${assetId}_${Date.now()}`;
    sessionStore.setSession(assetId, sessionId);

    console.log(`[video/session] Session seeded: ${sessionId}, image found: ${!!imagePart}`);

    res.json({
      success: true,
      sessionId,
      videoBytes: imagePart?.inlineData?.data || null
    });
  } catch (err: any) {
    console.error('[video/session] Generation failed, returning fallback:', err.message);

    // Store fallback session so /video/turn still has an assetId to work with
    const fallbackSessionId = `fallback_${assetId}_${Date.now()}`;
    sessionStore.setSession(assetId, fallbackSessionId);

    res.json({
      success: false,
      sessionId: fallbackSessionId,
      videoBytes: null,
      errorMsg: err.message || 'Failed to seed video session',
      isFallback: true
    });
  }
});

/**
 * POST /api/video/turn
 * Executes a video generation turn for an existing assetId.
 * Calls generateContent with IMAGE modality using the user's new prompt.
 * If no session exists for the assetId, seeds one dynamically first.
 *
 * Body: { assetId: string, prompt: string }
 * Returns: { success: boolean, videoBytes: string | null, sessionId: string }
 */
videoRouter.post('/video/turn', async (req, res) => {
  const { assetId, prompt } = req.body;

  if (!assetId || !prompt) {
    return res.status(400).json({ error: 'assetId and prompt are required' });
  }

  // Ensure a session exists — seed one dynamically if not
  if (!sessionStore.getSession(assetId)) {
    console.log(`[video/turn] No active session for ${assetId}, creating one dynamically...`);
    const dynamicSessionId = `dynamic_${assetId}_${Date.now()}`;
    sessionStore.setSession(assetId, dynamicSessionId);
  }

  try {
    console.log(`[video/turn] Generating visual for asset: ${assetId}, prompt: "${prompt}"`);

    // Generate a styled cinematic image from the text prompt
    const response = await ai.models.generateContent({
      model: env.OMNI_FLASH_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Create a cinematic, photorealistic, ultra high-quality visual for this scene: "${prompt}". 
              Apply dramatic lighting, professional color grading, and movie-quality composition. 
              The image should feel like a still frame from a blockbuster film.`
            }
          ]
        }
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT']
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    // Update session ID
    const newSessionId = `turn_${assetId}_${Date.now()}`;
    sessionStore.setSession(assetId, newSessionId);

    console.log(`[video/turn] Turn complete. Image generated: ${!!imagePart}`);

    res.json({
      success: true,
      sessionId: newSessionId,
      videoBytes: imagePart?.inlineData?.data || null
    });
  } catch (err: any) {
    console.error('[video/turn] Generation failed, returning fallback:', err.message);

    res.json({
      success: false,
      sessionId: `error_${assetId}_${Date.now()}`,
      videoBytes: null,
      errorMsg: err.message || 'Failed to generate video turn',
      isFallback: true
    });
  }
});
