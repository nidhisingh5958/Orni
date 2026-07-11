import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { sessionStore } from '../services/sessionStore';
import { env } from '../config/env';

export const videoRouter = Router();

// Minimal fallback empty MP4 video base64
const FALLBACK_VIDEO_BASE64 = "AAAAIGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAADh1dWlkWkhSlE548Elj4jD8r9FQAQAAACl0cmFrAAAAHHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAMW1kaWEAAAAgbWRoZAAAAAMAAAAAAAAAAAAAACcQAAAAAABlaDVsYw==";

videoRouter.post('/video/session', async (req, res) => {
  const { assetId, imageBytes, prompt } = req.body;

  if (!assetId || !imageBytes) {
    return res.status(400).json({ error: "assetId and imageBytes are required" });
  }

  try {
    console.log(`Pre-warming Omni Flash session for asset: ${assetId}`);
    
    const interaction = await ai.interactions.create({
      model: env.OMNI_FLASH_MODEL,
      input: [
        {
          type: "image",
          data: imageBytes,
          mime_type: "image/png"
        } as any,
        {
          type: "text",
          text: prompt || "Generate a panning cinematic short video loop from this image."
        }
      ]
    });

    if (interaction.id) {
      sessionStore.setSession(assetId, interaction.id);
    }

    res.json({
      success: true,
      sessionId: interaction.id,
      videoBytes: (interaction as any).output_video?.data || null
    });
  } catch (err: any) {
    console.error("Failed to seed video session:", err);
    res.json({
      success: false,
      errorMsg: err.message || "Failed to seed video session",
      videoBytes: FALLBACK_VIDEO_BASE64,
      isFallback: true
    });
  }
});

videoRouter.post('/video/turn', async (req, res) => {
  const { assetId, prompt } = req.body;

  if (!assetId || !prompt) {
    return res.status(400).json({ error: "assetId and prompt are required" });
  }

  let prevSessionId = sessionStore.getSession(assetId);
  if (!prevSessionId) {
    console.log(`No active session found for asset: ${assetId}. Dynamically seeding...`);
    try {
      const seedInteraction = await ai.interactions.create({
        model: env.OMNI_FLASH_MODEL,
        input: [
          {
            type: "image",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN88B8AAugB2uUkHn0AAAAASUVORK5CYII=",
            mime_type: "image/png"
          } as any,
          {
            type: "text",
            text: `Base image creative background for: ${prompt}`
          }
        ]
      });
      if (seedInteraction.id) {
        sessionStore.setSession(assetId, seedInteraction.id);
        prevSessionId = seedInteraction.id;
      }
    } catch (err) {
      console.error("Dynamic session seeding failed:", err);
    }
  }

  if (!prevSessionId) {
    return res.status(400).json({ error: "Failed to dynamically warm video session." });
  }

  try {
    console.log(`Running interaction turn on session: ${prevSessionId} for asset: ${assetId}`);

    const interaction = await ai.interactions.create({
      model: env.OMNI_FLASH_MODEL,
      previous_interaction_id: prevSessionId,
      input: prompt
    });

    if (interaction.id) {
      sessionStore.setSession(assetId, interaction.id);
    }

    res.json({
      success: true,
      sessionId: interaction.id,
      videoBytes: (interaction as any).output_video?.data || null
    });
  } catch (err: any) {
    console.error("Interaction turn failed, using fallback:", err);
    res.json({
      success: false,
      errorMsg: err.message || "Failed to run interaction turn",
      videoBytes: FALLBACK_VIDEO_BASE64,
      isFallback: true
    });
  }
});
