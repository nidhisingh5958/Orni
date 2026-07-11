import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from './config/env';
import { tokenRouter } from './routes/token';
import { imageRouter } from './routes/image';
import { videoRouter } from './routes/video';
import { ttsRouter } from './routes/tts';
import { translateRouter } from './routes/translate';
import { intentRouter } from './routes/intent';
import { transcribeRouter } from './routes/transcribe';

const app = express();

// Configure CORS to permit connections from frontend origins
app.use(cors({
  origin: [env.FRONTEND_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173']
}));

// Configure larger body size limits for base64 image payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Simple healthcheck route
app.get('/health', (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// API Routes mounting
app.use('/api', tokenRouter);
app.use('/api', imageRouter);
app.use('/api', videoRouter);
app.use('/api', ttsRouter);
app.use('/api', translateRouter);
app.use('/api', intentRouter);
app.use('/api', transcribeRouter);

// Create HTTP server from express app to handle WS upgrades
const server = http.createServer(app);

// Configure WebSocket Server Relay
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  console.log('[WS Relay] Client connected');

  // Direct backend connection to Gemini Live WebSocket API
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  geminiWs.on('open', () => {
    console.log('[WS Relay] Connected to Gemini Live API');
  });

  geminiWs.on('message', (data) => {
    // Forward server frames from Gemini back to the browser client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data.toString());
    }
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`[WS Relay] Gemini Live closed connection: ${code} - ${reason}`);
    ws.close();
  });

  geminiWs.on('error', (err) => {
    console.error('[WS Relay] Gemini Live connection error:', err);
    ws.close();
  });

  ws.on('message', (message) => {
    // Forward client audio stream chunks and setup frames to Gemini Live API
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(message.toString());
    }
  });

  ws.on('close', () => {
    console.log('[WS Relay] Client disconnected');
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });

  ws.on('error', (err) => {
    console.error('[WS Relay] Client connection error:', err);
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});

// Intercept and route upgrade requests to /ws
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(env.PORT, () => {
  console.log(`[VoiceCanvas Backend] Server running on port ${env.PORT}`);
});
