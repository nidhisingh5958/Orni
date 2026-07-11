import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

export const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
