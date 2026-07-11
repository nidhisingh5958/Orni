import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { env } from '../config/env';

export const tokenRouter = Router();

tokenRouter.post('/token', async (req, res) => {
  try {
    const expireTime = new Date(Date.now() + env.EPHEMERAL_TOKEN_TTL_SECONDS * 1000).toISOString();
    
    // Securely mint a short-lived token restricted to standard text modalities
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: expireTime,
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: `models/${env.GEMINI_LIVE_MODEL}`,
          config: {
            responseModalities: ['TEXT']
          }
        },
        httpOptions: { apiVersion: 'v1alpha' }
      }
    });

    res.json({ token: token.name });
  } catch (err: any) {
    console.error("Failed to mint ephemeral token:", err);
    res.status(500).json({ error: err.message || "Failed to mint ephemeral token" });
  }
});
