import { Router } from 'express';
import { ai } from '../services/geminiClient';
import { env } from '../config/env';

export const intentRouter = Router();

intentRouter.post('/intent/parse', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const systemInstruction = `
      You are an expert NLP classifier for a creative camera dashboard.
      Analyze the user's spoken command and categorize it into exactly one of three categories:
      1. "wardrobe": If the user is requesting to style themselves, put on clothes, wear an outfit, or change apparel (e.g., "put a coat on me", "wear a luxury jacket", "try on blue jeans").
      2. "videogen": If the user is asking to generate a scene, video loop, background story, or cinematic animation that should show on the side video generation panel (e.g., "generate a car racing video", "show me a space war clip", "create a dog running video").
      3. "filter": If the user is asking for visual camera filters or overlays applied directly to the camera mirror (e.g., "cinematic screen", "add sepia vignette", "cyberpunk HUD overlay").

      Response MUST be in clean JSON format matching this schema:
      {
        "type": "wardrobe" | "videogen" | "filter",
        "subject": "A clean description of the target apparel style or filter name to apply",
        "prompt": "A refined prompt suitable for a generative model to generate a video or edit an image"
      }
    `;

    const response = await ai.models.generateContent({
      model: env.INTENT_MODEL,
      contents: `User command: "${text}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    });

    const outputText = response.text || '';
    const parsed = JSON.parse(outputText.trim());

    res.json({
      type: parsed.type || 'wardrobe',
      subject: parsed.subject || text,
      prompt: parsed.prompt || text
    });
  } catch (err: any) {
    console.error("Intent parsing failed, using fallback wardrobe routing:", err);
    // Safe dynamic fallback parsing
    const lower = text.toLowerCase();
    let type = 'wardrobe';
    if (lower.includes('video') || lower.includes('gen') || lower.includes('create') || lower.includes('scene')) {
      type = 'videogen';
    } else if (lower.includes('hud') || lower.includes('filter') || lower.includes('sepia') || lower.includes('cinematic')) {
      type = 'filter';
    }

    res.json({
      type,
      subject: text,
      prompt: text
    });
  }
});
