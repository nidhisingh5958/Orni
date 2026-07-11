import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { tokenRouter } from './routes/token';
import { imageRouter } from './routes/image';
import { videoRouter } from './routes/video';
import { ttsRouter } from './routes/tts';
import { translateRouter } from './routes/translate';

const app = express();

// Configure CORS to permit connections from frontend origins
app.use(cors({
  origin: [env.FRONTEND_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173']
}));

// Configure larger body size limits for base64 image payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Simple healthcheck route to satisfy Phase 0 requirements
app.get('/health', (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// API Routes mounting
app.use('/api', tokenRouter);
app.use('/api', imageRouter);
app.use('/api', videoRouter);
app.use('/api', ttsRouter);
app.use('/api', translateRouter);

const server = app.listen(env.PORT, () => {
  console.log(`[VoiceCanvas Backend] Server running on port ${env.PORT}`);
});
